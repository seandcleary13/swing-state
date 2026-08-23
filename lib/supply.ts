import { hexKey, hexNeighbors, type HexCoord } from "./hex";
import { isEnemyZoc, unitAt } from "./movement";
import type { Faction, GameState, Unit, UnitKind } from "./types";

/** A hex a faction can draw supply from: one of its own home-edge hexes, or a town it controls. */
function isSupplySource(state: GameState, pos: HexCoord, faction: Faction): boolean {
  const tile = state.map[hexKey(pos)];
  if (!tile) return false;
  if (tile.deploymentFor === faction) return true;
  return !!tile.objective && tile.controlledBy === faction;
}

/**
 * Whether `unit` can trace a line of supply back to a town its side controls or to its own
 * side of the board. The line runs hex to hex, starting from the unit's own hex, and may not
 * pass through enemy units or the Zones of Control they project. That applies uniformly —
 * a unit adjacent to even a single enemy is cut off, whether it's alone in the open or holding
 * a town: standing on a supply source doesn't help if the enemy is standing right next to you.
 * Friendly units pass supply along freely.
 */
export function canTraceSupply(state: GameState, unit: Unit): boolean {
  if (isEnemyZoc(state, unit.pos, unit.faction)) return false;
  if (isSupplySource(state, unit.pos, unit.faction)) return true;

  const seen = new Set<string>([hexKey(unit.pos)]);
  const frontier: HexCoord[] = [unit.pos];

  while (frontier.length) {
    const current = frontier.shift()!;
    for (const n of hexNeighbors(current)) {
      const k = hexKey(n);
      if (seen.has(k)) continue;
      seen.add(k);
      if (!state.map[k]) continue;

      const occupant = unitAt(state.units, n);
      if (occupant && occupant.faction !== unit.faction) continue; // enemy troops sever the line
      if (isEnemyZoc(state, n, unit.faction)) continue; // so do the zones they control

      if (isSupplySource(state, n, unit.faction)) return true;
      frontier.push(n);
    }
  }

  return false;
}

/** Reduced units of `faction` that are in supply and could be brought back to full strength. */
export function resupplyableUnitIds(state: GameState, faction: Faction): Set<string> {
  const set = new Set<string>();
  for (const u of Object.values(state.units)) {
    if (u.faction !== faction || !u.reduced) continue;
    if (canTraceSupply(state, u)) set.add(u.id);
  }
  return set;
}

/** Empty hexes on `faction`'s own side of the board, where a fresh formation may be raised. */
export function openHomeHexes(state: GameState, faction: Faction): HexCoord[] {
  return Object.values(state.map)
    .filter((t) => t.deploymentFor === faction && !unitAt(state.units, { col: t.col, row: t.row }))
    .map((t) => ({ col: t.col, row: t.row }));
}

/**
 * An unused id for a newly raised formation. Casualties leave gaps in the numbering, so this
 * skips past any id still in use rather than reusing one and overwriting a live unit.
 */
export function newUnitId(units: Record<string, Unit>, faction: Faction): string {
  let n = Object.values(units).filter((u) => u.faction === faction).length;
  while (`${faction}-${n}` in units) n++;
  return `${faction}-${n}`;
}

// --- The reinforcement schedule -------------------------------------------------------------
// The two sides' clocks run in opposite directions. France starts flush and dries up; the
// Coalition starts with nothing and its depots open as the campaign wears on.

const RESUPPLY_SCHEDULE: Record<Faction, number[]> = {
  //          T1 T2 T3 T4 T5 T6 T7 T8
  france:    [ 2, 2, 1, 1, 1, 1, 0, 0],
  coalition: [ 0, 0, 0, 1, 1, 1, 1, 1],
};

/** How many resupply actions `faction` may take on `turn`. */
export function resupplyAllowance(faction: Faction, turn: number): number {
  return RESUPPLY_SCHEDULE[faction][turn - 1] ?? 0;
}

// Free Coalition drafts, over and above the turn's resupply action. These arrive at FULL
// strength, unlike anything mustered by a resupply action.
const SCHEDULED_DRAFTS: Record<number, UnitKind[]> = {
  5: ["infantry", "infantry", "artillery"],
  6: ["infantry", "infantry", "artillery"],
};

/** Formations that march in free at the start of the Coalition's resupply phase on `turn`. */
export function scheduledDrafts(faction: Faction, turn: number): UnitKind[] {
  if (faction !== "coalition") return [];
  return SCHEDULED_DRAFTS[turn] ?? [];
}
