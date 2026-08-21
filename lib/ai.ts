import { hexDistance, hexKey, hexNeighbors, type HexCoord } from "./hex";
import { TERRAIN_DEFS } from "./mapData";
import { computeReachable, unitAt } from "./movement";
import { rollCombat } from "./combat";
import { UNIT_TYPES } from "./units";
import { unitDisplayName } from "./units";
import type { CombatLogEntry, Faction, GameState, Unit } from "./types";

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function terrainBonus(state: GameState, pos: HexCoord): number {
  const tile = state.map[hexKey(pos)];
  return tile ? TERRAIN_DEFS[tile.terrain].defenseBonus : 0;
}

function findRetreatHex(state: GameState, defender: Unit, attacker: Unit): HexCoord | null {
  const options = hexNeighbors(defender.pos).filter((n) => {
    const tile = state.map[hexKey(n)];
    if (!tile) return false;
    if (unitAt(state.units, n)) return false;
    return hexDistance(n, attacker.pos) > hexDistance(defender.pos, attacker.pos);
  });
  if (!options.length) return null;
  options.sort((a, b) => hexDistance(b, attacker.pos) - hexDistance(a, attacker.pos));
  return options[0];
}

function nearestTargetDistance(state: GameState, from: HexCoord, aiFaction: Faction): number {
  const playerFaction: Faction = aiFaction === "france" ? "coalition" : "france";
  const uncontrolledObjectives = Object.values(state.map).filter(
    (t) => t.objective && t.controlledBy !== aiFaction
  );
  const targets: HexCoord[] =
    uncontrolledObjectives.length > 0
      ? uncontrolledObjectives.map((t) => ({ col: t.col, row: t.row }))
      : Object.values(state.units)
          .filter((u) => u.faction === playerFaction)
          .map((u) => u.pos);
  if (!targets.length) return 0;
  return Math.min(...targets.map((t) => hexDistance(from, t)));
}

export function runAiTurn(state: GameState): GameState {
  const aiFaction = state.aiFaction;
  const playerFaction = state.playerFaction;
  const units: Record<string, Unit> = {};
  for (const [id, u] of Object.entries(state.units)) {
    units[id] = { ...u, hasMoved: u.faction === aiFaction ? false : u.hasMoved, hasAttacked: u.faction === aiFaction ? false : u.hasAttacked, routed: u.faction === aiFaction ? false : u.routed };
  }
  const map = Object.fromEntries(Object.entries(state.map).map(([k, v]) => [k, { ...v }]));
  const log: CombatLogEntry[] = [...state.log];
  let working: GameState = { ...state, units, map, log };

  const addLog = (text: string, kind: CombatLogEntry["kind"] = "info") => {
    working = { ...working, log: [{ id: `${Date.now()}-${Math.random()}`, turn: working.turn, text, kind }, ...working.log].slice(0, 40) };
  };

  // --- Movement ---
  const aiUnits = Object.values(working.units)
    .filter((u) => u.faction === aiFaction)
    .sort((a, b) => UNIT_TYPES[b.kind].movement - UNIT_TYPES[a.kind].movement);

  for (const unit of aiUnits) {
    const live = working.units[unit.id];
    if (!live) continue;

    const adjEnemies = hexNeighbors(live.pos)
      .map((n) => unitAt(working.units, n))
      .filter((u): u is Unit => !!u && u.faction === playerFaction);
    const goodFight = adjEnemies.some((e) => {
      const atk = UNIT_TYPES[live.kind].attack;
      const def = UNIT_TYPES[e.kind].defense + terrainBonus(working, e.pos);
      return atk / Math.max(def, 0.5) >= 1;
    });
    if (goodFight) continue; // stay and fight this combat phase

    const reachable = computeReachable(working, live);
    const currentDist = nearestTargetDistance(working, live.pos, aiFaction);
    let best: { hex: HexCoord; dist: number; cost: number } | null = null;
    for (const [key, cost] of Object.entries(reachable)) {
      const [c, r] = key.split(",").map(Number);
      const dist = nearestTargetDistance(working, { col: c, row: r }, aiFaction);
      if (dist < currentDist && (!best || dist < best.dist || (dist === best.dist && cost < best.cost))) {
        best = { hex: { col: c, row: r }, dist, cost };
      }
    }
    if (best) {
      working.units[unit.id] = { ...live, pos: best.hex, hasMoved: true };
    }
  }

  // --- Combat ---
  for (const unit of Object.values(working.units).filter((u) => u.faction === aiFaction)) {
    const live = working.units[unit.id];
    if (!live || live.hasAttacked) continue;
    const targets = hexNeighbors(live.pos)
      .map((n) => unitAt(working.units, n))
      .filter((u): u is Unit => !!u && u.faction === playerFaction);
    if (!targets.length) continue;

    let bestTarget: Unit | null = null;
    let bestRatio = -Infinity;
    for (const t of targets) {
      const atk = UNIT_TYPES[live.kind].attack;
      const def = UNIT_TYPES[t.kind].defense + terrainBonus(working, t.pos);
      const ratio = atk / Math.max(def, 0.5);
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestTarget = t;
      }
    }
    if (!bestTarget || bestRatio < 1) continue;

    const attackerName = unitDisplayName(aiFaction, live.kind);
    const defenderName = unitDisplayName(playerFaction, bestTarget.kind);
    const atk = UNIT_TYPES[live.kind].attack;
    const def = UNIT_TYPES[bestTarget.kind].defense + terrainBonus(working, bestTarget.pos);
    const roll = randomInt(1, 6);
    const { odds, result } = rollCombat(atk, def, roll);
    working = { ...working, lastCombat: { attacker: live.id, defender: bestTarget.id, odds, roll, result } };

    if (result === "NE") {
      addLog(`${attackerName} attacks ${defenderName} at ${odds} — no effect (roll ${roll}).`, "combat");
    } else if (result === "AE") {
      const { [live.id]: _drop, ...rest } = working.units;
      working = { ...working, units: rest };
      addLog(`${attackerName} attacks ${defenderName} at ${odds} — attacker eliminated (roll ${roll}).`, "combat");
      continue;
    } else if (result === "DE") {
      const { [bestTarget.id]: _drop, ...rest } = working.units;
      working = { ...working, units: rest };
      addLog(`${attackerName} attacks ${defenderName} at ${odds} — defender eliminated (roll ${roll}).`, "combat");
    } else if (result === "EX") {
      const { [live.id]: _d1, [bestTarget.id]: _d2, ...rest } = working.units;
      working = { ...working, units: rest };
      addLog(`${attackerName} and ${defenderName} clash at ${odds} — both eliminated (roll ${roll}).`, "combat");
      continue;
    } else if (result === "DR") {
      const retreat = findRetreatHex(working, bestTarget, live);
      if (retreat) {
        working.units[bestTarget.id] = { ...bestTarget, pos: retreat, routed: true };
        addLog(`${attackerName} attacks ${defenderName} at ${odds} — defender retreats (roll ${roll}).`, "combat");
      } else {
        const { [bestTarget.id]: _drop, ...rest } = working.units;
        working = { ...working, units: rest };
        addLog(`${attackerName} attacks ${defenderName} at ${odds} — no retreat possible, defender eliminated (roll ${roll}).`, "combat");
      }
    }
    working.units[live.id] = { ...working.units[live.id], hasAttacked: true };
  }

  // --- Update objective control ---
  const map2 = { ...working.map };
  for (const tile of Object.values(map2)) {
    if (!tile.objective) continue;
    const occ = unitAt(working.units, { col: tile.col, row: tile.row });
    if (occ) map2[hexKey({ col: tile.col, row: tile.row })] = { ...tile, controlledBy: occ.faction };
  }
  working = { ...working, map: map2 };

  return working;
}
