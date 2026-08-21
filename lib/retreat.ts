import { hexDistance, hexKey, hexNeighbors, type HexCoord } from "./hex";
import { unitAt } from "./movement";
import type { GameState } from "./types";

/**
 * Retreats a defender up to `steps` hexes away from the nearest attacking unit.
 * Each step must strictly increase the defender's distance to its closest attacker.
 * Returns the final hex, or null if the very first step has nowhere to go
 * (the defender is eliminated instead of retreating). A defender that manages
 * at least one step but gets boxed in on a later one simply stops early.
 */
export function computeRetreat(
  state: GameState,
  defenderPos: HexCoord,
  attackerPositions: HexCoord[],
  steps: number
): HexCoord | null {
  const minDistToAttackers = (h: HexCoord) => Math.min(...attackerPositions.map((a) => hexDistance(h, a)));

  let current = defenderPos;
  let advanced = false;

  for (let i = 0; i < steps; i++) {
    const currentDist = minDistToAttackers(current);
    const options = hexNeighbors(current).filter((n) => {
      const tile = state.map[hexKey(n)];
      if (!tile) return false;
      if (unitAt(state.units, n)) return false;
      return minDistToAttackers(n) > currentDist;
    });
    if (!options.length) {
      if (i === 0) return null;
      break;
    }
    options.sort((a, b) => minDistToAttackers(b) - minDistToAttackers(a));
    current = options[0];
    advanced = true;
  }

  return advanced ? current : null;
}

/**
 * Every legal single-hop retreat destination from `currentPos`, away from `awayFrom`.
 * Used to let a player choose their own retreat direction one hop at a time,
 * rather than the engine picking automatically.
 */
export function retreatStepOptions(state: GameState, currentPos: HexCoord, awayFrom: HexCoord): HexCoord[] {
  const currentDist = hexDistance(currentPos, awayFrom);
  return hexNeighbors(currentPos).filter((n) => {
    const tile = state.map[hexKey(n)];
    if (!tile) return false;
    if (unitAt(state.units, n)) return false;
    return hexDistance(n, awayFrom) > currentDist;
  });
}
