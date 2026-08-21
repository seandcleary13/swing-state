import { hexDistance, hexKey, type HexCoord } from "./hex";
import { TERRAIN_DEFS, buildMap } from "./mapData";
import { computeReachable, unitAt } from "./movement";
import { rollCombat } from "./combat";
import { ORDER_OF_BATTLE, UNIT_TYPES, isCavalryKind, unitDisplayName } from "./units";
import { runAiTurn } from "./ai";
import type { CombatLogEntry, Faction, GameState, Unit, UnitKind } from "./types";

const COALITION_DEPLOY: Array<[number, number]> = [
  [12, 1], [11, 2], [12, 4], [11, 5], [12, 7], [11, 8], [12, 10], [11, 11], [12, 12],
];

function newId(units: Record<string, Unit>, faction: Faction): string {
  const n = Object.values(units).filter((u) => u.faction === faction).length;
  return `${faction}-${n}`;
}

function terrainBonus(state: GameState, pos: HexCoord): number {
  const tile = state.map[hexKey(pos)];
  return tile ? TERRAIN_DEFS[tile.terrain].defenseBonus : 0;
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
  | { type: "ATTACK"; defenderId: string }
  | { type: "END_PHASE" }
  | { type: "RESET" };

export function gameReducer(state: GameState, action: Action): GameState {
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
      // player-combat: selection just marks the attacker, no movement range to show.
      return { ...state, selectedUnitId: action.unitId, reachable: {} };
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

    case "ATTACK": {
      if (state.phase !== "player-combat" || !state.selectedUnitId) return state;
      const attacker = state.units[state.selectedUnitId];
      const defender = state.units[action.defenderId];
      if (!attacker || !defender || attacker.hasAttacked || attacker.routed) return state;
      if (defender.faction !== state.aiFaction) return state;
      if (hexDistance(attacker.pos, defender.pos) !== 1) return state;

      const atk = UNIT_TYPES[attacker.kind].power;
      const def = UNIT_TYPES[defender.kind].power + terrainBonus(state, defender.pos);
      const roll = Math.floor(Math.random() * 6) + 1;
      const { odds, result } = rollCombat(atk, def, roll);
      const attackerName = unitDisplayName(state.playerFaction, attacker.kind);
      const defenderName = unitDisplayName(state.aiFaction, defender.kind);

      let units = { ...state.units };
      let text = "";
      if (result === "NE") {
        units[attacker.id] = { ...attacker, hasAttacked: true };
        text = `${attackerName} attacks ${defenderName} at ${odds} — no effect (roll ${roll}).`;
      } else if (result === "AE") {
        delete units[attacker.id];
        text = `${attackerName} attacks ${defenderName} at ${odds} — our unit is repulsed and eliminated (roll ${roll}).`;
      } else if (result === "DE") {
        delete units[defender.id];
        units[attacker.id] = { ...attacker, hasAttacked: true };
        text = `${attackerName} attacks ${defenderName} at ${odds} — enemy eliminated (roll ${roll})!`;
      } else if (result === "EX") {
        delete units[attacker.id];
        delete units[defender.id];
        text = `${attackerName} and ${defenderName} clash at ${odds} — both are destroyed (roll ${roll}).`;
      } else if (result === "DR") {
        units[attacker.id] = { ...attacker, hasAttacked: true };
        const retreatCandidates = Object.entries(state.map)
          .map(([, t]) => ({ col: t.col, row: t.row }))
          .filter((h) => {
            const tile = state.map[hexKey(h)];
            if (!tile) return false;
            if (unitAt(state.units, h)) return false;
            return hexDistance(h, attacker.pos) > 1 && hexDistance(h, defender.pos) === 1;
          });
        if (retreatCandidates.length) {
          const dest = retreatCandidates[0];
          units[defender.id] = { ...defender, pos: dest, routed: true };
          text = `${attackerName} attacks ${defenderName} at ${odds} — enemy falls back (roll ${roll}).`;
        } else {
          delete units[defender.id];
          text = `${attackerName} attacks ${defenderName} at ${odds} — no room to retreat, enemy eliminated (roll ${roll}).`;
        }
      }

      let next: GameState = { ...state, units, lastCombat: { attacker: attacker.id, defender: defender.id, odds, roll, result } };
      next = recomputeObjectiveControl(next);
      next = addLog(next, text, "combat");
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

    case "END_PHASE": {
      if (state.phase === "player-cavalry-move") {
        return { ...state, phase: "player-combat", selectedUnitId: null, reachable: {} };
      }

      if (state.phase === "player-combat") {
        return { ...state, phase: "player-move", selectedUnitId: null, reachable: {} };
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
