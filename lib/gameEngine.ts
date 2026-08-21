import { hexDistance, hexKey, type HexCoord } from "./hex";
import { TERRAIN_DEFS, buildMap } from "./mapData";
import { computeReachable, unitAt } from "./movement";
import { rollCombat } from "./combat";
import { ORDER_OF_BATTLE, UNIT_TYPES, unitDisplayName } from "./units";
import { runAiTurn } from "./ai";
import type { CombatLogEntry, Faction, GameState, Unit, UnitKind } from "./types";

const COALITION_DEPLOY: Array<[number, number]> = [
  [9, 1], [8, 2], [9, 4], [8, 5], [9, 7], [8, 8], [9, 10], [8, 11],
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
    if (u.faction === faction) units[id] = { ...u, hasMoved: false, hasAttacked: false, routed: false };
  }
  return { ...state, units };
}

function factionTownCount(state: GameState, faction: Faction): number {
  return Object.values(state.map).filter((t) => t.objective && t.controlledBy === faction).length;
}

function finalizeVictory(state: GameState): GameState {
  const p = factionTownCount(state, state.playerFaction);
  const a = factionTownCount(state, state.aiFaction);
  let winner: Faction | "draw";
  if (p > a) winner = state.playerFaction;
  else if (a > p) winner = state.aiFaction;
  else {
    const pUnits = Object.values(state.units).filter((u) => u.faction === state.playerFaction).length;
    const aUnits = Object.values(state.units).filter((u) => u.faction === state.aiFaction).length;
    winner = pUnits > aUnits ? state.playerFaction : aUnits > pUnits ? state.aiFaction : "draw";
  }
  return { ...state, phase: "game-over", winner };
}

function addLog(state: GameState, text: string, kind: CombatLogEntry["kind"] = "info"): GameState {
  const entry: CombatLogEntry = { id: `${Date.now()}-${Math.random()}`, turn: state.turn, text, kind };
  return { ...state, log: [entry, ...state.log].slice(0, 40) };
}

export function initGameState(): GameState {
  const map = buildMap();
  const units: Record<string, Unit> = {};
  ORDER_OF_BATTLE.forEach((kind, i) => {
    const [col, row] = COALITION_DEPLOY[i];
    const id = `coalition-${i}`;
    units[id] = { id, faction: "coalition", kind, pos: { col, row }, hasMoved: false, hasAttacked: false, routed: false };
  });

  return {
    map,
    units,
    turn: 1,
    totalTurns: 6,
    phase: "setup",
    playerFaction: "france",
    aiFaction: "coalition",
    selectedUnitId: null,
    reachable: {},
    log: [
      {
        id: "start",
        turn: 0,
        text: "The Coalition army has taken up positions in the east. Deploy the Grande Armée on the western hexes to begin the campaign.",
        kind: "setup",
      },
    ],
    setupPool: { france: [...ORDER_OF_BATTLE], coalition: [] },
    winner: null,
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
      const units = { ...state.units, [id]: { id, faction: "france" as const, kind: action.kind, pos: action.hex, hasMoved: false, hasAttacked: false, routed: false } };
      const newPool = [...pool];
      newPool.splice(idx, 1);
      const setupPool = { ...state.setupPool, france: newPool };
      const done = newPool.length === 0;

      let next: GameState = { ...state, units, setupPool, phase: done ? "player-move" : "setup" };
      next = addLog(next, `${unitDisplayName("france", action.kind)} deployed to ${tile.objectiveName ?? `hex ${action.hex.col}-${action.hex.row}`}.`, "setup");
      if (done) next = addLog(next, "Deployment complete. Turn 1 begins — move your units, then attack.", "info");
      return next;
    }

    case "SELECT_UNIT": {
      if (action.unitId === null) return { ...state, selectedUnitId: null, reachable: {} };
      const unit = state.units[action.unitId];
      if (!unit || unit.faction !== state.playerFaction) return state;
      const reachable = state.phase === "player-move" && !unit.hasMoved ? computeReachable(state, unit) : {};
      return { ...state, selectedUnitId: action.unitId, reachable };
    }

    case "MOVE_UNIT": {
      if (state.phase !== "player-move" || !state.selectedUnitId) return state;
      const unit = state.units[state.selectedUnitId];
      if (!unit || unit.hasMoved) return state;
      const key = hexKey(action.hex);
      if (!(key in state.reachable)) return state;
      const tile = state.map[key];
      const units = { ...state.units, [unit.id]: { ...unit, pos: action.hex, hasMoved: true } };
      let next: GameState = { ...state, units, selectedUnitId: null, reachable: {} };
      next = recomputeObjectiveControl(next);
      next = addLog(next, `${unitDisplayName(state.playerFaction, unit.kind)} advances to ${tile.objectiveName ?? `${TERRAIN_DEFS[tile.terrain].label} (${action.hex.col}-${action.hex.row})`}.`);
      return next;
    }

    case "ATTACK": {
      if (state.phase !== "player-combat" || !state.selectedUnitId) return state;
      const attacker = state.units[state.selectedUnitId];
      const defender = state.units[action.defenderId];
      if (!attacker || !defender || attacker.hasAttacked || attacker.routed) return state;
      if (defender.faction !== state.aiFaction) return state;
      if (hexDistance(attacker.pos, defender.pos) !== 1) return state;

      const atk = UNIT_TYPES[attacker.kind].attack;
      const def = UNIT_TYPES[defender.kind].defense + terrainBonus(state, defender.pos);
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
      return next;
    }

    case "END_PHASE": {
      if (state.phase === "player-move") {
        return { ...state, phase: "player-combat", selectedUnitId: null, reachable: {} };
      }

      if (state.phase === "player-combat") {
        const aiAlive = Object.values(state.units).some((u) => u.faction === state.aiFaction);
        if (!aiAlive) return finalizeVictory({ ...state });

        let next = addLog({ ...state, selectedUnitId: null, reachable: {} }, "— The Coalition responds —", "info");
        next = runAiTurn(next);

        const playerAlive = Object.values(next.units).some((u) => u.faction === next.playerFaction);
        if (!playerAlive) return finalizeVictory(next);

        const nextTurn = next.turn + 1;
        if (nextTurn > next.totalTurns) return finalizeVictory(next);

        next = resetFactionFlags(next, next.playerFaction);
        next = { ...next, turn: nextTurn, phase: "player-move" };
        next = addLog(next, `Turn ${nextTurn} begins.`, "info");
        return next;
      }

      return state;
    }

    default:
      return state;
  }
}
