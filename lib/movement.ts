import { hexKey, hexNeighbors, type HexCoord } from "./hex";
import { TERRAIN_DEFS } from "./mapData";
import type { Faction, GameState, Unit } from "./types";
import { UNIT_TYPES } from "./units";

function otherFaction(f: Faction): Faction {
  return f === "france" ? "coalition" : "france";
}

export function unitAt(units: Record<string, Unit>, pos: HexCoord): Unit | undefined {
  const k = hexKey(pos);
  for (const u of Object.values(units)) {
    if (hexKey(u.pos) === k) return u;
  }
  return undefined;
}

function isEnemyZoc(state: GameState, pos: HexCoord, faction: Faction): boolean {
  const enemy = otherFaction(faction);
  return hexNeighbors(pos).some((n) => {
    const u = unitAt(state.units, n);
    return u && u.faction === enemy && !u.routed;
  });
}

function edgeCost(state: GameState, from: HexCoord, to: HexCoord): number {
  const fromTile = state.map[hexKey(from)];
  const toTile = state.map[hexKey(to)];
  if (!toTile) return Infinity;
  if (fromTile?.road && toTile.road) return 1;
  return TERRAIN_DEFS[toTile.terrain].moveCost;
}

/** Dijkstra over the hex grid honoring terrain cost, roads, no-stacking, and simplified ZOC (movement ends on entering an enemy ZOC hex). */
export function computeReachable(state: GameState, unit: Unit): Record<string, number> {
  const allowance = UNIT_TYPES[unit.kind].movement;
  const startKey = hexKey(unit.pos);
  const cost: Record<string, number> = { [startKey]: 0 };
  const stopped = new Set<string>(); // hexes where movement must end (entered enemy ZOC)
  const frontier: HexCoord[] = [unit.pos];

  if (isEnemyZoc(state, unit.pos, unit.faction)) {
    // Starting already adjacent to the enemy: can still make one move.
  }

  while (frontier.length) {
    frontier.sort((a, b) => cost[hexKey(a)] - cost[hexKey(b)]);
    const current = frontier.shift()!;
    const curKey = hexKey(current);
    if (stopped.has(curKey) && curKey !== startKey) continue;

    for (const n of hexNeighbors(current)) {
      const nKey = hexKey(n);
      const tile = state.map[nKey];
      if (!tile) continue;
      const occupant = unitAt(state.units, n);
      if (occupant) continue; // no stacking, friend or foe

      const step = edgeCost(state, current, n);
      const isFirstStep = curKey === startKey;
      let newCost = cost[curKey] + step;
      if (isFirstStep && step > allowance) newCost = allowance; // minimum-move exception

      if (newCost > allowance) continue;
      if (nKey in cost && cost[nKey] <= newCost) continue;

      cost[nKey] = newCost;
      if (isEnemyZoc(state, n, unit.faction)) {
        stopped.add(nKey);
      } else {
        frontier.push(n);
      }
    }
  }

  delete cost[startKey];
  return cost;
}

export function adjacentEnemies(state: GameState, unit: Unit): Unit[] {
  const enemy = otherFaction(unit.faction);
  return hexNeighbors(unit.pos)
    .map((n) => unitAt(state.units, n))
    .filter((u): u is Unit => !!u && u.faction === enemy);
}

export { otherFaction };
