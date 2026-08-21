import { hexDistance, hexKey, type HexCoord } from "./hex";
import { TERRAIN_DEFS, buildMap } from "./mapData";
import { computeReachable, unitAt } from "./movement";
import { rollCombat } from "./combat";
import { computeRetreat, retreatStepOptions } from "./retreat";
import { ORDER_OF_BATTLE, UNIT_TYPES, attackRange, defensePower, isCavalryKind, unitDisplayName } from "./units";
import { runAiTurn } from "./ai";
import type { CombatLogEntry, Faction, GameState, PendingRetreat, Unit, UnitKind } from "./types";

const COALITION_DEPLOY: Array<[number, number]> = [
  [12, 1], [11, 2], [12, 4], [11, 5], [12, 7], [11, 8], [12, 10], [11, 11], [12, 12],
];

const RETREAT_HEXES = 2;

function isOnHill(state: GameState, pos: HexCoord): boolean {
  return state.map[hexKey(pos)]?.terrain === "hill";
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function newId(units: Record<string, Unit>, faction: Faction): string {
  const n = Object.values(units).filter((u) => u.faction === faction).length;
  return `${faction}-${n}`;
}

function terrainMultiplier(state: GameState, pos: HexCoord): number {
  const tile = state.map[hexKey(pos)];
  return tile ? TERRAIN_DEFS[tile.terrain].defenseMultiplier : 1;
}

/** Player units with a live enemy in range that haven't attacked yet — mandatory-attack obligations. */
export function getObligatedAttackerIds(state: GameState): Set<string> {
  const set = new Set<string>();
  if (state.phase !== "player-combat") return set;
  const enemies = Object.values(state.units).filter((u) => u.faction === state.aiFaction);
  for (const u of Object.values(state.units)) {
    if (u.faction !== state.playerFaction || u.hasAttacked || u.routed) continue;
    const range = attackRange(u.kind, isOnHill(state, u.pos));
    if (enemies.some((e) => hexDistance(u.pos, e.pos) <= range)) set.add(u.id);
  }
  return set;
}

/**
 * Pops units off `queue` one at a time, auto-eliminating any with nowhere at all to
 * retreat to, until it finds one with real options (left as the active `pendingRetreat`)
 * or the queue runs out (retreat sequence finished, `pendingRetreat` cleared).
 */
function beginRetreats(state: GameState, unitIds: string[], awayFrom: HexCoord): GameState {
  let working = state;
  const queue = [...unitIds];
  while (queue.length) {
    const id = queue.shift()!;
    const unit = working.units[id];
    if (!unit) continue;
    const options = retreatStepOptions(working, unit.pos, awayFrom);
    if (!options.length) {
      const { [id]: _drop, ...rest } = working.units;
      working = addLog(
        { ...working, units: rest },
        `${unitDisplayName(working.playerFaction, unit.kind)} has nowhere to fall back and is eliminated.`,
        "combat"
      );
      continue;
    }
    const retreatOptions: Record<string, true> = {};
    for (const o of options) retreatOptions[hexKey(o)] = true;
    return { ...working, pendingRetreat: { unitId: id, awayFrom, stepsTaken: 0, queue }, retreatOptions };
  }
  return { ...working, pendingRetreat: null, retreatOptions: {} };
}

function finalizeCombatOutcome(state: GameState): GameState {
  let next = recomputeObjectiveControl(state);
  if (!Object.values(next.units).some((u) => u.faction === next.defenderFaction)) {
    next = addLog(next, "The Coalition army has been annihilated — the Grande Armée overruns the field!", "victory");
    return finalizeVictory(next, next.attackerFaction, "annihilation-defender");
  }
  if (attackerHasOverrun(next)) {
    next = addLog(next, "Every town has fallen — the Grande Armée has broken through!", "victory");
    return finalizeVictory(next, next.attackerFaction, "overrun");
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

function addLog(state: GameState, text: string, kind: CombatLogEntry["kind"] = "info"): GameState {
  const entry: CombatLogEntry = { id: `${Date.now()}-${Math.random()}`, turn: state.turn, text, kind };
  return { ...state, log: [entry, ...state.log].slice(0, 40) };
}

export function initGameState(): GameState {
  const map = buildMap();
  // The Coalition defends and starts already holding every town.
  for (const tile of Object.values(map)) {
    if (tile.objective) tile.controlledBy = "coalition";
  }

  const units: Record<string, Unit> = {};
  ORDER_OF_BATTLE.forEach((kind, i) => {
    const [col, row] = COALITION_DEPLOY[i];
    const id = `coalition-${i}`;
    units[id] = { id, faction: "coalition", kind, pos: { col, row }, hasCavalryMoved: false, hasMoved: false, hasAttacked: false, routed: false };
  });

  return {
    map,
    units,
    turn: 1,
    totalTurns: 6,
    phase: "setup",
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
    log: [
      {
        id: "start",
        turn: 0,
        text: "The Coalition holds every town in the region. The Grande Armée must break through and take them all before the campaign's 6 turns run out — deploy on the western hexes to begin.",
        kind: "setup",
      },
    ],
    setupPool: { france: [...ORDER_OF_BATTLE], coalition: [] },
    winner: null,
    victoryReason: null,
    lastCombat: null,
  };
}

export type Action =
  | { type: "SETUP_PLACE"; kind: UnitKind; hex: HexCoord }
  | { type: "SELECT_UNIT"; unitId: string | null }
  | { type: "MOVE_UNIT"; hex: HexCoord }
  | { type: "SELECT_ATTACK_TARGET"; targetId: string }
  | { type: "CLEAR_ATTACK" }
  | { type: "CONFIRM_ATTACK" }
  | { type: "CHOOSE_RETREAT_HEX"; hex: HexCoord }
  | { type: "END_PHASE" }
  | { type: "RESET" };

export function gameReducer(state: GameState, action: Action): GameState {
  // While an attacker retreat is being interactively resolved, every other action is
  // blocked until the player finishes choosing where those units fall back to.
  if (state.pendingRetreat && action.type !== "CHOOSE_RETREAT_HEX" && action.type !== "RESET") return state;

  switch (action.type) {
    case "RESET":
      return initGameState();

    case "SETUP_PLACE": {
      if (state.phase !== "setup") return state;
      const pool = state.setupPool.france;
      const idx = pool.indexOf(action.kind);
      if (idx === -1) return state;
      const tile = state.map[hexKey(action.hex)];
      if (!tile || tile.deploymentFor !== "france") return state;
      if (unitAt(state.units, action.hex)) return state;

      const id = newId(state.units, "france");
      const units = {
        ...state.units,
        [id]: { id, faction: "france" as const, kind: action.kind, pos: action.hex, hasCavalryMoved: false, hasMoved: false, hasAttacked: false, routed: false },
      };
      const newPool = [...pool];
      newPool.splice(idx, 1);
      const setupPool = { ...state.setupPool, france: newPool };
      const done = newPool.length === 0;

      let next: GameState = { ...state, units, setupPool, phase: done ? "player-cavalry-move" : "setup" };
      next = addLog(next, `${unitDisplayName("france", action.kind)} deployed to ${tile.objectiveName ?? `hex ${action.hex.col}-${action.hex.row}`}.`, "setup");
      if (done) next = addLog(next, "Deployment complete. Turn 1 begins — cavalry advances first.", "info");
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
      if (attackerHasOverrun(next)) {
        next = addLog(next, "Every town has fallen — the Grande Armée has broken through!", "victory");
        return finalizeVictory(next, next.attackerFaction, "overrun");
      }
      return next;
    }

    case "CONFIRM_ATTACK": {
      if (state.phase !== "player-combat") return state;
      if (!state.combatTargetId || state.combatAttackerIds.length === 0) return state;
      const defender = state.units[state.combatTargetId];
      const attackers = state.combatAttackerIds.map((id) => state.units[id]).filter((u): u is Unit => !!u);
      if (!defender || !attackers.length) return state;
      if (defender.faction !== state.aiFaction) return state;

      const atk = attackers.reduce((sum, u) => sum + UNIT_TYPES[u.kind].power, 0);
      const def = defensePower(UNIT_TYPES[defender.kind].power, terrainMultiplier(state, defender.pos));
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
          for (const a of adjacentAttackers) delete units[a.id];
          text = `${attackerNames} attack ${defenderName} at ${odds} — repulsed and eliminated (roll ${roll}).`;
        }
      } else if (result === "DE") {
        delete units[defender.id];
        text = `${attackerNames} attack ${defenderName} at ${odds} — enemy eliminated (roll ${roll})!`;
      } else if (result === "EX") {
        delete units[defender.id];
        if (bombardingOnly) {
          text = `${attackerNames} bombard ${defenderName} at ${odds} — enemy eliminated (roll ${roll}).`;
        } else {
          const weakest = [...adjacentAttackers].sort((a, b) => UNIT_TYPES[a.kind].power - UNIT_TYPES[b.kind].power)[0];
          delete units[weakest.id];
          text = `${attackerNames} clash with ${defenderName} at ${odds} — both sides lose a unit (roll ${roll}).`;
        }
      } else if (result === "DR") {
        const vacatedPos = defender.pos;
        const retreat = computeRetreat(state, defender.pos, attackers.map((a) => a.pos), RETREAT_HEXES);
        if (retreat) {
          units[defender.id] = { ...defender, pos: retreat, routed: true };
          if (adjacentAttackers.length) {
            const lead = [...adjacentAttackers].sort((a, b) => UNIT_TYPES[b.kind].power - UNIT_TYPES[a.kind].power)[0];
            units[lead.id] = { ...units[lead.id], pos: vacatedPos };
          }
          text = `${attackerNames} attack ${defenderName} at ${odds} — enemy falls back (roll ${roll}).`;
        } else {
          delete units[defender.id];
          text = `${attackerNames} attack ${defenderName} at ${odds} — no room to retreat, enemy eliminated (roll ${roll}).`;
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
      next = addLog(next, `${unitDisplayName(next.playerFaction, unit.kind)} falls back.`, "combat");

      const stepsSoFar = stepsTaken + 1;
      if (stepsSoFar < RETREAT_HEXES) {
        const moreOptions = retreatStepOptions(next, action.hex, awayFrom);
        if (moreOptions.length) {
          const retreatOptions: Record<string, true> = {};
          for (const o of moreOptions) retreatOptions[hexKey(o)] = true;
          return { ...next, pendingRetreat: { unitId, awayFrom, stepsTaken: stepsSoFar, queue }, retreatOptions };
        }
      }

      next = beginRetreats(next, queue, awayFrom);
      return next.pendingRetreat ? next : finalizeCombatOutcome(next);
    }

    case "END_PHASE": {
      if (state.phase === "player-cavalry-move") {
        return { ...state, phase: "player-combat", selectedUnitId: null, reachable: {} };
      }

      if (state.phase === "player-combat") {
        const obligated = getObligatedAttackerIds(state);
        if (obligated.size > 0) {
          const plural = obligated.size > 1;
          return addLog(
            state,
            `${obligated.size} unit${plural ? "s" : ""} ${plural ? "have" : "has"} an enemy in range and must attack before this phase can end.`,
            "info"
          );
        }
        return { ...state, phase: "player-move", selectedUnitId: null, reachable: {}, combatTargetId: null, combatAttackerIds: [] };
      }

      if (state.phase === "player-move") {
        const defenderAlive = Object.values(state.units).some((u) => u.faction === state.defenderFaction);
        if (!defenderAlive) {
          const done = addLog({ ...state }, "The Coalition army has been annihilated — the Grande Armée overruns the field!", "victory");
          return finalizeVictory(done, state.attackerFaction, "annihilation-defender");
        }

        let next = addLog({ ...state, selectedUnitId: null, reachable: {} }, "— The Coalition responds —", "info");
        next = runAiTurn(next);

        const attackerAlive = Object.values(next.units).some((u) => u.faction === next.attackerFaction);
        if (!attackerAlive) {
          next = addLog(next, "The Grande Armée has been wiped out — the Coalition holds the field!", "victory");
          return finalizeVictory(next, next.defenderFaction, "annihilation-attacker");
        }

        const nextTurn = next.turn + 1;
        if (nextTurn > next.totalTurns) {
          next = addLog(next, "The campaign clock runs out — the Coalition has held out!", "victory");
          return finalizeVictory(next, next.defenderFaction, "held-out");
        }

        next = resetFactionFlags(next, next.playerFaction);
        next = { ...next, turn: nextTurn, phase: "player-cavalry-move" };
        next = addLog(next, `Turn ${nextTurn} begins — cavalry advances first.`, "info");
        return next;
      }

      return state;
    }

    default:
      return state;
  }
}
