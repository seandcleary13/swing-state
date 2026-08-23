import { hexDistance, hexKey, type HexCoord } from "./hex";
import { TERRAIN_DEFS, TOWNS, buildMap } from "./mapData";
import { computeReachable, unitAt } from "./movement";
import { rollCombat } from "./combat";
import { computeRetreat, retreatStepOptions, beginRetreats, MAX_RETREAT_HEXES } from "./retreat";
import { addLog } from "./log";
import { ORDER_OF_BATTLE, RESUPPLY_KINDS, applyCasualty, attackRange, currentPower, defensePower, defenseValue, isCavalryKind, unitDisplayName } from "./units";
import type { CasualtyOutcome } from "./units";
import { canTraceSupply, newUnitId, resupplyAllowance, scheduledDrafts } from "./supply";
import { applyScheduledDrafts, buildCavalryQueue, buildCombatQueue, buildMoveQueue, stepAdvance, stepCombat, stepResupply } from "./ai";
import type { AiTurnState, Faction, GameState, Unit, UnitKind } from "./types";

// Both armies start on the board, foot in the forward column and everything else behind.
// Each table is index-aligned with that side's ORDER_OF_BATTLE list.
const DEPLOY: Record<Faction, Array<[number, number]>> = {
  // France: 5 infantry forward on column 1; 3 cavalry, 3 heavy cavalry, 4 guns on column 0.
  france: [
    [1, 1], [1, 4], [1, 6], [1, 9], [1, 12],
    [0, 2], [0, 7], [0, 11],
    [0, 4], [0, 6], [0, 9],
    [0, 0], [0, 5], [0, 10], [0, 13],
  ],
  // Coalition: 9 infantry forward on column 17; 2 cavalry, 1 heavy cavalry, 3 guns on column 18.
  coalition: [
    [17, 0], [17, 2], [17, 3], [17, 5], [17, 6], [17, 8], [17, 9], [17, 11], [17, 13],
    [18, 4], [18, 10],
    [18, 7],
    [18, 1], [18, 6], [18, 12],
  ],
};

function isOnHill(state: GameState, pos: HexCoord): boolean {
  return state.map[hexKey(pos)]?.terrain === "hill";
}

/** Consumes one of the player's resupply actions, moving on once the turn's allowance is spent. */
function spendResupplyAction(state: GameState): GameState {
  const resupplyLeft = Math.max(0, state.resupplyLeft - 1);
  if (resupplyLeft > 0) return { ...state, resupplyLeft, selectedUnitId: null, reachable: {} };
  return { ...state, resupplyLeft, phase: "player-cavalry-move", selectedUnitId: null, reachable: {} };
}

/**
 * Opens the player's turn on `turn`, loading that turn's resupply allowance from the schedule.
 * A turn with no allowance skips the resupply phase entirely rather than showing an empty one.
 */
function beginPlayerTurn(state: GameState, turn: number): GameState {
  const resupplyLeft = resupplyAllowance(state.playerFaction, turn);
  const next: GameState = {
    ...state,
    turn,
    resupplyLeft,
    phase: resupplyLeft > 0 ? "player-resupply" : "player-cavalry-move",
    selectedUnitId: null,
    reachable: {},
  };
  if (resupplyLeft > 0) {
    return addLog(
      next,
      `Turn ${turn} begins — ${resupplyLeft} resupply action${resupplyLeft > 1 ? "s" : ""} available.`,
      "info"
    );
  }
  return addLog(next, `Turn ${turn} begins — the depots are empty, no resupply. Cavalry advances first.`, "info");
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function casualtyPhrase(outcome: CasualtyOutcome): string {
  return outcome === "eliminated" ? "eliminated" : "reduced to half strength";
}

function terrainMultiplier(state: GameState, pos: HexCoord): number {
  const tile = state.map[hexKey(pos)];
  return tile ? TERRAIN_DEFS[tile.terrain].defenseMultiplier : 1;
}

/**
 * After a retreat queue drains (`pendingRetreat` clears), either apply the AI's own
 * automatic advance into ground its attack vacated and leave `aiTurnState` for the next
 * step to resume (during the Coalition's turn), or run the normal end-of-combat checks
 * (during the player's turn).
 */
function resolveRetreatQueueAdvance(state: GameState, queue: string[], awayFrom: HexCoord): GameState {
  let next = beginRetreats(state, queue, awayFrom);
  if (next.pendingRetreat) return next;

  if (next.phase === "ai-turn") {
    const auto = next.aiTurnState?.pendingAutoAdvance;
    if (auto && next.units[auto.attackerId]) {
      next = recomputeObjectiveControl({
        ...next,
        units: { ...next.units, [auto.attackerId]: { ...next.units[auto.attackerId], pos: auto.hex } },
      });
    }
    if (next.aiTurnState) {
      next = { ...next, aiTurnState: { ...next.aiTurnState, pendingAutoAdvance: null } };
    }
    return next;
  }

  return finalizeCombatOutcome(next);
}

function finalizeCombatOutcome(state: GameState): GameState {
  let next = recomputeObjectiveControl(state);
  if (!Object.values(next.units).some((u) => u.faction === next.defenderFaction)) {
    next = addLog(next, "The Coalition army has been annihilated — the Grande Armée overruns the field!", "victory");
    return finalizeVictory(next, next.attackerFaction, "annihilation-defender");
  }
  return next;
}

function recomputeObjectiveControl(state: GameState): GameState {
  const map = { ...state.map };
  for (const tile of Object.values(state.map)) {
    if (!tile.objective) continue;
    const occ = unitAt(state.units, { col: tile.col, row: tile.row });
    if (occ) map[hexKey({ col: tile.col, row: tile.row })] = { ...tile, controlledBy: occ.faction };
  }
  return { ...state, map };
}

// Note: `reduced` is persistent battlefield damage, not a per-turn flag — it is deliberately
// never cleared here.
function resetFactionFlags(state: GameState, faction: Faction): GameState {
  const units = { ...state.units };
  for (const [id, u] of Object.entries(units)) {
    if (u.faction === faction) units[id] = { ...u, hasCavalryMoved: false, hasMoved: false, hasAttacked: false, routed: false };
  }
  return { ...state, units };
}

function factionTownCount(state: GameState, faction: Faction): number {
  return Object.values(state.map).filter((t) => t.objective && t.controlledBy === faction).length;
}

// The attacker wins outright by capturing every town — a full breakthrough.
function attackerHasOverrun(state: GameState): boolean {
  const totalTowns = Object.values(state.map).filter((t) => t.objective).length;
  return factionTownCount(state, state.attackerFaction) === totalTowns;
}

function finalizeVictory(state: GameState, winner: Faction, reason: GameState["victoryReason"]): GameState {
  return { ...state, phase: "game-over", winner, victoryReason: reason };
}

export function initGameState(): GameState {
  const map = buildMap();
  // The Coalition defends and starts already holding every town.
  for (const tile of Object.values(map)) {
    if (tile.objective) tile.controlledBy = "coalition";
  }

  // Both armies take the field already deployed — no placement step.
  const units: Record<string, Unit> = {};
  for (const faction of ["france", "coalition"] as const) {
    ORDER_OF_BATTLE[faction].forEach((kind, i) => {
      const [col, row] = DEPLOY[faction][i];
      const id = `${faction}-${i}`;
      units[id] = { id, faction, kind, pos: { col, row }, hasCavalryMoved: false, hasMoved: false, hasAttacked: false, routed: false, reduced: false };
    });
  }

  // The three central towns start with a half-strength Coalition garrison already dug in,
  // ahead of the main line drawn up on the eastern edge.
  const GARRISON_TOWNS = ["Vieuxpont", "Saint-Aubry", "Hauteclaire"];
  for (const townName of GARRISON_TOWNS) {
    const town = TOWNS.find((t) => t.name === townName);
    if (!town) continue;
    const id = `coalition-garrison-${town.name}`;
    units[id] = {
      id,
      faction: "coalition",
      kind: "infantry",
      pos: { col: town.col, row: town.row },
      hasCavalryMoved: false,
      hasMoved: false,
      hasAttacked: false,
      routed: false,
      reduced: true,
    };
  }

  return {
    map,
    units,
    turn: 1,
    totalTurns: 8,
    resupplyLeft: resupplyAllowance("france", 1),
    phase: "player-resupply",
    playerFaction: "france",
    aiFaction: "coalition",
    attackerFaction: "france",
    defenderFaction: "coalition",
    selectedUnitId: null,
    reachable: {},
    combatTargetId: null,
    combatAttackerIds: [],
    pendingRetreat: null,
    retreatOptions: {},
    pendingAdvance: null,
    aiTurnState: null,
    log: [
      {
        id: "start",
        turn: 0,
        text: "The armies are drawn up. The Coalition holds every town in the region; the Grande Armée must break through and take them all before the campaign's 8 turns run out. Turn 1 begins with resupply.",
        kind: "setup",
      },
    ],
    winner: null,
    victoryReason: null,
    lastCombat: null,
  };
}

export type Action =
  | { type: "RESUPPLY_FLIP"; unitId: string }
  | { type: "RESUPPLY_PLACE"; kind: UnitKind; hex: HexCoord }
  | { type: "SELECT_UNIT"; unitId: string | null }
  | { type: "MOVE_UNIT"; hex: HexCoord }
  | { type: "SELECT_ATTACK_TARGET"; targetId: string }
  | { type: "CLEAR_ATTACK" }
  | { type: "CONFIRM_ATTACK" }
  | { type: "CHOOSE_RETREAT_HEX"; hex: HexCoord }
  | { type: "STOP_RETREAT" }
  | { type: "CONFIRM_ADVANCE" }
  | { type: "DECLINE_ADVANCE" }
  | { type: "END_PHASE" }
  | { type: "ADVANCE_AI_STEP" }
  | { type: "SKIP_AI_TURN" }
  | { type: "RESET" };

export function gameReducer(state: GameState, action: Action): GameState {
  // While a retreat is being interactively resolved, every other action is blocked until
  // the player finishes choosing where those units fall back to.
  if (state.pendingRetreat && action.type !== "CHOOSE_RETREAT_HEX" && action.type !== "STOP_RETREAT" && action.type !== "RESET") {
    return state;
  }
  // While the player is deciding whether to advance into vacated ground, block everything else.
  if (state.pendingAdvance && action.type !== "CONFIRM_ADVANCE" && action.type !== "DECLINE_ADVANCE" && action.type !== "RESET") {
    return state;
  }

  switch (action.type) {
    case "RESET":
      return initGameState();

    // --- Resupply: a scheduled number of actions per turn (see lib/supply.ts), each either
    // --- bringing a worn unit back up to strength or raising a fresh half-strength formation.
    case "RESUPPLY_FLIP": {
      if (state.phase !== "player-resupply" || state.resupplyLeft <= 0) return state;
      const unit = state.units[action.unitId];
      if (!unit || unit.faction !== state.playerFaction || !unit.reduced) return state;
      if (!canTraceSupply(state, unit)) return state;

      const units = { ...state.units, [unit.id]: { ...unit, reduced: false } };
      let next = spendResupplyAction({ ...state, units });
      next = addLog(next, `${unitDisplayName(unit.faction, unit.kind)} draws supply and is back up to full strength.`, "info");
      return next;
    }

    case "RESUPPLY_PLACE": {
      if (state.phase !== "player-resupply" || state.resupplyLeft <= 0) return state;
      if (!RESUPPLY_KINDS.includes(action.kind)) return state;
      const tile = state.map[hexKey(action.hex)];
      if (!tile || tile.deploymentFor !== state.playerFaction) return state;
      if (unitAt(state.units, action.hex)) return state;

      const id = newUnitId(state.units, state.playerFaction);
      const units = {
        ...state.units,
        [id]: { id, faction: state.playerFaction, kind: action.kind, pos: action.hex, hasCavalryMoved: false, hasMoved: false, hasAttacked: false, routed: false, reduced: true },
      };
      let next = spendResupplyAction({ ...state, units });
      next = addLog(next, `A fresh ${unitDisplayName(state.playerFaction, action.kind)} formation musters at half strength.`, "info");
      return next;
    }

    case "SELECT_UNIT": {
      if (action.unitId === null) return { ...state, selectedUnitId: null, reachable: {} };
      const unit = state.units[action.unitId];
      if (!unit || unit.faction !== state.playerFaction) return state;

      if (state.phase === "player-cavalry-move") {
        if (!isCavalryKind(unit.kind)) return state;
        const reachable = !unit.hasCavalryMoved ? computeReachable(state, unit) : {};
        return { ...state, selectedUnitId: action.unitId, reachable };
      }
      if (state.phase === "player-move") {
        const reachable = !unit.hasMoved ? computeReachable(state, unit) : {};
        return { ...state, selectedUnitId: action.unitId, reachable };
      }
      if (state.phase === "player-combat") {
        if (unit.hasAttacked || unit.routed) return { ...state, selectedUnitId: action.unitId };
        const target = state.combatTargetId ? state.units[state.combatTargetId] : null;
        if (!target) return { ...state, selectedUnitId: action.unitId };
        const range = attackRange(unit.kind, isOnHill(state, unit.pos));
        if (hexDistance(unit.pos, target.pos) > range) return { ...state, selectedUnitId: action.unitId };
        const already = state.combatAttackerIds.includes(unit.id);
        const combatAttackerIds = already
          ? state.combatAttackerIds.filter((id) => id !== unit.id)
          : [...state.combatAttackerIds, unit.id];
        return { ...state, selectedUnitId: action.unitId, combatAttackerIds };
      }
      return { ...state, selectedUnitId: action.unitId, reachable: {} };
    }

    case "SELECT_ATTACK_TARGET": {
      if (state.phase !== "player-combat") return state;
      const target = state.units[action.targetId];
      if (!target || target.faction !== state.aiFaction) return state;
      if (state.combatTargetId === action.targetId) return state;
      return { ...state, combatTargetId: action.targetId, combatAttackerIds: [] };
    }

    case "CLEAR_ATTACK": {
      if (state.phase !== "player-combat") return state;
      return { ...state, combatTargetId: null, combatAttackerIds: [] };
    }

    case "MOVE_UNIT": {
      if (!state.selectedUnitId) return state;
      if (state.phase !== "player-cavalry-move" && state.phase !== "player-move") return state;
      const unit = state.units[state.selectedUnitId];
      if (!unit) return state;
      if (state.phase === "player-cavalry-move" && (!isCavalryKind(unit.kind) || unit.hasCavalryMoved)) return state;
      if (state.phase === "player-move" && unit.hasMoved) return state;

      const key = hexKey(action.hex);
      if (!(key in state.reachable)) return state;
      const tile = state.map[key];
      const updated: Unit =
        state.phase === "player-cavalry-move"
          ? { ...unit, pos: action.hex, hasCavalryMoved: true }
          : { ...unit, pos: action.hex, hasMoved: true };
      const units = { ...state.units, [unit.id]: updated };
      let next: GameState = { ...state, units, selectedUnitId: null, reachable: {} };
      next = recomputeObjectiveControl(next);
      next = addLog(next, `${unitDisplayName(state.playerFaction, unit.kind)} advances to ${tile.objectiveName ?? `${TERRAIN_DEFS[tile.terrain].label} (${action.hex.col}-${action.hex.row})`}.`);
      return next;
    }

    case "CONFIRM_ATTACK": {
      if (state.phase !== "player-combat") return state;
      if (!state.combatTargetId || state.combatAttackerIds.length === 0) return state;
      const defender = state.units[state.combatTargetId];
      const attackers = state.combatAttackerIds.map((id) => state.units[id]).filter((u): u is Unit => !!u);
      if (!defender || !attackers.length) return state;
      if (defender.faction !== state.aiFaction) return state;

      const atk = attackers.reduce((sum, u) => sum + currentPower(u), 0);
      const def = defensePower(defenseValue(defender), terrainMultiplier(state, defender.pos));
      const roll = Math.floor(Math.random() * 6) + 1;
      const { odds, result } = rollCombat(atk, def, roll);
      const attackerNames = joinNames(attackers.map((u) => unitDisplayName(state.playerFaction, u.kind)));
      const defenderName = unitDisplayName(state.aiFaction, defender.kind);
      // Artillery firing from beyond adjacency ("bombarding") never suffers combat results itself.
      const adjacentAttackers = attackers.filter((a) => hexDistance(a.pos, defender.pos) === 1);
      const bombardingOnly = adjacentAttackers.length === 0;

      let units = { ...state.units };
      for (const a of attackers) units[a.id] = { ...units[a.id], hasAttacked: true };

      let text = "";
      if (result === "NE") {
        text = `${attackerNames} attack ${defenderName} at ${odds} — no effect (roll ${roll}).`;
      } else if (result === "AE") {
        if (bombardingOnly) {
          text = `${attackerNames} bombard ${defenderName} at ${odds} — the barrage goes wide (roll ${roll}).`;
        } else {
          const casualties = adjacentAttackers.map((a) => {
            const r = applyCasualty(units, a.id);
            units = r.units;
            return { name: unitDisplayName(state.playerFaction, a.kind), outcome: r.outcome };
          });
          const clause =
            casualties.length === 1
              ? `repulsed and ${casualtyPhrase(casualties[0].outcome)}`
              : joinNames(casualties.map((c) => `${c.name} ${casualtyPhrase(c.outcome)}`));
          text = `${attackerNames} attack ${defenderName} at ${odds} — ${clause} (roll ${roll}).`;
        }
      } else if (result === "DE") {
        const r = applyCasualty(units, defender.id);
        units = r.units;
        text = `${attackerNames} attack ${defenderName} at ${odds} — enemy ${casualtyPhrase(r.outcome)} (roll ${roll})!`;
      } else if (result === "EX") {
        const defResult = applyCasualty(units, defender.id);
        units = defResult.units;
        if (bombardingOnly) {
          text = `${attackerNames} bombard ${defenderName} at ${odds} — enemy ${casualtyPhrase(defResult.outcome)} (roll ${roll}).`;
        } else {
          const weakest = [...adjacentAttackers].sort((a, b) => currentPower(a) - currentPower(b))[0];
          const atkResult = applyCasualty(units, weakest.id);
          units = atkResult.units;
          const weakestName = unitDisplayName(state.playerFaction, weakest.kind);
          text = `${attackerNames} clash with ${defenderName} at ${odds} — ${defenderName} is ${casualtyPhrase(defResult.outcome)}, and ${weakestName} is ${casualtyPhrase(atkResult.outcome)} (roll ${roll}).`;
        }
      } else if (result === "DR") {
        const retreat = computeRetreat(state, defender.pos, attackers.map((a) => a.pos), MAX_RETREAT_HEXES);
        if (retreat) {
          units[defender.id] = { ...defender, pos: retreat, routed: true };
          text = `${attackerNames} attack ${defenderName} at ${odds} — enemy falls back (roll ${roll}).`;
        } else {
          const r = applyCasualty(units, defender.id);
          units = r.units;
          text = `${attackerNames} attack ${defenderName} at ${odds} — no room to retreat, enemy ${casualtyPhrase(r.outcome)} (roll ${roll}).`;
        }
      } else if (result === "Ar") {
        text = bombardingOnly
          ? `${attackerNames} bombard ${defenderName} at ${odds} — no effect (roll ${roll}).`
          : `${attackerNames} attack ${defenderName} at ${odds} — repulsed and falling back (roll ${roll}).`;
      }

      let next: GameState = {
        ...state,
        units,
        combatTargetId: null,
        combatAttackerIds: [],
        lastCombat: { attackers: attackers.map((a) => a.id), defender: defender.id, odds, roll, result },
      };
      next = addLog(next, text, "combat");

      // Whenever the defender's hex ends up empty — it retreated, or it was eliminated — a
      // surviving adjacent attacker may take the ground.
      const vacatedKey = hexKey(defender.pos);
      const hexNowEmpty = !Object.values(units).some((u) => hexKey(u.pos) === vacatedKey);
      const survivingAdjacent = adjacentAttackers.filter((a) => units[a.id]);
      if (hexNowEmpty && survivingAdjacent.length) {
        const lead = [...survivingAdjacent].sort((a, b) => currentPower(units[b.id]) - currentPower(units[a.id]))[0];
        return { ...next, pendingAdvance: { attackerId: lead.id, hex: defender.pos } };
      }
      if (result === "Ar" && !bombardingOnly) {
        next = beginRetreats(next, adjacentAttackers.map((a) => a.id), defender.pos);
        return next.pendingRetreat ? next : finalizeCombatOutcome(next);
      }
      return finalizeCombatOutcome(next);
    }

    case "CHOOSE_RETREAT_HEX": {
      if (!state.pendingRetreat) return state;
      const { unitId, awayFrom, stepsTaken, queue } = state.pendingRetreat;
      const key = hexKey(action.hex);
      if (!(key in state.retreatOptions)) return state;
      const unit = state.units[unitId];
      if (!unit) return state;

      const units = { ...state.units, [unitId]: { ...unit, pos: action.hex, routed: true } };
      let next: GameState = { ...state, units };
      next = addLog(next, `${unitDisplayName(unit.faction, unit.kind)} falls back.`, "combat");

      const stepsSoFar = stepsTaken + 1;
      if (stepsSoFar < MAX_RETREAT_HEXES) {
        const moreOptions = retreatStepOptions(next, action.hex, awayFrom);
        if (moreOptions.length) {
          const retreatOptions: Record<string, true> = {};
          for (const o of moreOptions) retreatOptions[hexKey(o)] = true;
          return { ...next, pendingRetreat: { unitId, awayFrom, stepsTaken: stepsSoFar, queue }, retreatOptions };
        }
      }

      return resolveRetreatQueueAdvance(next, queue, awayFrom);
    }

    case "STOP_RETREAT": {
      if (!state.pendingRetreat) return state;
      if (state.pendingRetreat.stepsTaken < 1) return state;
      const { queue, awayFrom } = state.pendingRetreat;
      return resolveRetreatQueueAdvance(state, queue, awayFrom);
    }

    case "CONFIRM_ADVANCE": {
      if (!state.pendingAdvance) return state;
      const { attackerId, hex } = state.pendingAdvance;
      const unit = state.units[attackerId];
      if (!unit) return finalizeCombatOutcome({ ...state, pendingAdvance: null });
      const units = { ...state.units, [attackerId]: { ...unit, pos: hex } };
      let next: GameState = { ...state, units, pendingAdvance: null };
      next = addLog(next, `${unitDisplayName(unit.faction, unit.kind)} advances into the vacated ground.`, "combat");
      return finalizeCombatOutcome(next);
    }

    case "DECLINE_ADVANCE": {
      if (!state.pendingAdvance) return state;
      return finalizeCombatOutcome({ ...state, pendingAdvance: null });
    }

    case "END_PHASE": {
      if (state.phase === "player-resupply") {
        // Skipping forfeits whatever is left of this turn's allowance.
        return { ...state, phase: "player-cavalry-move", resupplyLeft: 0, selectedUnitId: null, reachable: {} };
      }

      if (state.phase === "player-cavalry-move") {
        return { ...state, phase: "player-combat", selectedUnitId: null, reachable: {} };
      }

      if (state.phase === "player-combat") {
        return { ...state, phase: "player-move", selectedUnitId: null, reachable: {}, combatTargetId: null, combatAttackerIds: [] };
      }

      if (state.phase === "player-move") {
        const defenderAlive = Object.values(state.units).some((u) => u.faction === state.defenderFaction);
        if (!defenderAlive) {
          const done = addLog({ ...state }, "The Coalition army has been annihilated — the Grande Armée overruns the field!", "victory");
          return finalizeVictory(done, state.attackerFaction, "annihilation-defender");
        }

        let next = addLog({ ...state, selectedUnitId: null, reachable: {} }, "— The Coalition responds —", "info");
        next = resetFactionFlags(next, next.aiFaction);
        // The Coalition's resupply sub-phase runs as a short to-do list: any scheduled draft
        // first, then its one resupply action if the schedule grants it one this turn.
        const resupplySteps: string[] = [];
        if (scheduledDrafts(next.aiFaction, next.turn).length) resupplySteps.push("draft");
        if (resupplyAllowance(next.aiFaction, next.turn) > 0) resupplySteps.push("action");

        next = {
          ...next,
          phase: "ai-turn",
          aiTurnState: { subPhase: "resupply", queue: resupplySteps, pendingAutoAdvance: null },
        };
        return next;
      }

      return state;
    }

    case "ADVANCE_AI_STEP": {
      if (state.phase !== "ai-turn" || !state.aiTurnState) return state;
      return advanceAiTurnOnce(state);
    }

    case "SKIP_AI_TURN": {
      if (state.phase !== "ai-turn" || !state.aiTurnState) return state;
      let working = state;
      const cap = Object.keys(state.units).length * 6 + 20;
      for (let i = 0; i < cap; i++) {
        if (working.phase !== "ai-turn" || !working.aiTurnState || working.pendingRetreat) break;
        working = advanceAiTurnOnce(working);
      }
      return working;
    }

    default:
      return state;
  }
}

/**
 * Advances the Coalition's turn by one visible step: pops queued units and applies their
 * move/attack, skipping any with nothing to do within the same call (so the visible pacing
 * only pauses on a real move, combat roll, or an interactive retreat it needs to hand off
 * to the player). Sub-phases run cavalry → combat → move, then hand off to `finalizeAiTurn`.
 */
function advanceAiTurnOnce(state: GameState): GameState {
  let working = state;

  while (working.aiTurnState) {
    const ats: AiTurnState = working.aiTurnState;

    // Resupply runs a short to-do list ("draft", "action") rather than a per-unit queue.
    if (ats.subPhase === "resupply") {
      if (ats.queue.length === 0) {
        working = {
          ...working,
          aiTurnState: { subPhase: "cavalry", queue: buildCavalryQueue(working), pendingAutoAdvance: null },
        };
        continue;
      }
      const step = ats.queue[0];
      const beforeUnits = working.units;
      const after = step === "draft" ? applyScheduledDrafts(working) : stepResupply(working);
      working = {
        ...after,
        aiTurnState: { subPhase: "resupply", queue: ats.queue.slice(1), pendingAutoAdvance: null },
      };
      if (after.units !== beforeUnits) return working;
      continue;
    }

    if (ats.queue.length === 0) {
      if (ats.subPhase === "cavalry") {
        working = { ...working, aiTurnState: { subPhase: "combat", queue: buildCombatQueue(working), pendingAutoAdvance: null } };
        continue;
      }
      if (ats.subPhase === "combat") {
        working = { ...working, aiTurnState: { subPhase: "move", queue: buildMoveQueue(working), pendingAutoAdvance: null } };
        continue;
      }
      return finalizeAiTurn(working);
    }

    const unitId = ats.queue[0];
    const restQueue = ats.queue.slice(1);
    const before = working.units;

    if (ats.subPhase === "cavalry" || ats.subPhase === "move") {
      const moveFlag = ats.subPhase === "cavalry" ? "hasCavalryMoved" : "hasMoved";
      const after = stepAdvance(working, unitId, moveFlag, ats.subPhase === "cavalry");
      working = { ...after, aiTurnState: { ...(after.aiTurnState ?? ats), queue: restQueue } };
      if (after.units !== before) return working;
      continue;
    }

    // combat
    const after = stepCombat(working, unitId);
    working = { ...after, aiTurnState: after.aiTurnState ? { ...after.aiTurnState, queue: restQueue } : { ...ats, queue: restQueue } };
    if (working.pendingRetreat) return working;
    if (after.units !== before) return working;
  }

  return working;
}

function finalizeAiTurn(state: GameState): GameState {
  let next = recomputeObjectiveControl(state);

  const attackerAlive = Object.values(next.units).some((u) => u.faction === next.attackerFaction);
  if (!attackerAlive) {
    next = addLog(next, "The Grande Armée has been wiped out — the Coalition holds the field!", "victory");
    return finalizeVictory({ ...next, aiTurnState: null }, next.defenderFaction, "annihilation-attacker");
  }

  const nextTurn = next.turn + 1;
  if (nextTurn > next.totalTurns) {
    if (attackerHasOverrun(next)) {
      next = addLog(next, "Every town has fallen — the Grande Armée has broken through!", "victory");
      return finalizeVictory({ ...next, aiTurnState: null }, next.attackerFaction, "overrun");
    }
    next = addLog(next, "The campaign clock runs out — the Coalition has held out!", "victory");
    return finalizeVictory({ ...next, aiTurnState: null }, next.defenderFaction, "held-out");
  }

  next = resetFactionFlags(next, next.playerFaction);
  return beginPlayerTurn({ ...next, aiTurnState: null }, nextTurn);
}

// --- Undo ---------------------------------------------------------------------------------
// Movement and resupply can be taken back, step by step, as far as the start of your turn.
// Combat cannot: confirming an attack commits the roll and wipes the history, so nobody can
// rewind a bad result and re-roll it. Handing the turn to the Coalition wipes it too.

export interface UndoableState {
  present: GameState;
  past: GameState[];
}

export type UndoableAction = Action | { type: "UNDO" };

/** Actions that leave a restore point behind them. */
const UNDOABLE = new Set<Action["type"]>(["MOVE_UNIT", "RESUPPLY_FLIP", "RESUPPLY_PLACE", "END_PHASE"]);
/** Actions that commit the game past the point of taking anything back. */
const IRREVERSIBLE = new Set<Action["type"]>(["CONFIRM_ATTACK", "ADVANCE_AI_STEP", "SKIP_AI_TURN", "RESET"]);

const MAX_HISTORY = 60;

export function initUndoableState(): UndoableState {
  return { present: initGameState(), past: [] };
}

export function undoableReducer(state: UndoableState, action: UndoableAction): UndoableState {
  if (action.type === "UNDO") {
    if (!state.past.length) return state;
    const past = [...state.past];
    const present = past.pop()!;
    return { present, past };
  }

  const next = gameReducer(state.present, action);
  if (next === state.present) return state; // rejected or no-op, nothing to record

  if (IRREVERSIBLE.has(action.type)) return { present: next, past: [] };
  if (!UNDOABLE.has(action.type)) return { present: next, past: state.past };
  // Ending the movement phase hands over to the Coalition — that's a one-way door.
  if (next.phase === "ai-turn") return { present: next, past: [] };

  return { present: next, past: [...state.past, state.present].slice(-MAX_HISTORY) };
}
