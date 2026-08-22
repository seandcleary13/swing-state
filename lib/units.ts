import type { Unit, UnitKind, UnitTypeDef } from "./types";

// Base Power is doubled from the original tutorial numbers so a reduced (half-strength)
// unit has room to land exactly back on those original values — see currentPower below.
export const UNIT_TYPES: Record<UnitKind, UnitTypeDef> = {
  cavalry: { kind: "cavalry", name: "Cavalry", power: 6, movement: 5, symbol: "CAV" },
  "heavy-cavalry": { kind: "heavy-cavalry", name: "Heavy Cavalry", power: 12, movement: 5, symbol: "HCV" },
  infantry: { kind: "infantry", name: "Infantry", power: 8, movement: 4, symbol: "INF" },
  artillery: { kind: "artillery", name: "Artillery", power: 10, movement: 3, symbol: "ART" },
};

// Faction-flavored display names for the same unit kinds.
export const FACTION_UNIT_NAMES: Record<"france" | "coalition", Record<UnitKind, string>> = {
  france: {
    cavalry: "Hussars",
    "heavy-cavalry": "Cuirassiers",
    infantry: "Line Infantry",
    artillery: "Grande Battery",
  },
  coalition: {
    cavalry: "Uhlans",
    "heavy-cavalry": "Dragoons",
    infantry: "Line Infantry",
    artillery: "Foot Battery",
  },
};

export function unitDisplayName(faction: "france" | "coalition", kind: UnitKind): string {
  return FACTION_UNIT_NAMES[faction][kind] ?? UNIT_TYPES[kind].name;
}

// Both cavalry kinds get the opening cavalry-only movement phase (and a second move later).
export function isCavalryKind(kind: UnitKind): boolean {
  return kind === "cavalry" || kind === "heavy-cavalry";
}

// Every unit can attack an adjacent hex. Artillery can also fire at range 2 — or 3 while it holds a hill.
export function attackRange(kind: UnitKind, attackerOnHill: boolean): number {
  if (kind !== "artillery") return 1;
  return attackerOnHill ? 3 : 2;
}

// Terrain multiplies a defender's Power rather than adding a flat bonus, so it scales with the unit's own strength.
export function defensePower(basePower: number, terrainMultiplier: number): number {
  return Math.floor(basePower * terrainMultiplier);
}

// A reduced unit fights at half its base Power until a second hit eliminates it. All four
// doubled base values are even, so this never needs rounding.
export function currentPower(unit: Unit): number {
  const base = UNIT_TYPES[unit.kind].power;
  return unit.reduced ? base / 2 : base;
}

export type CasualtyOutcome = "reduced" | "eliminated";

/**
 * The single step-reduction resolver: a full-strength unit's first casualty result reduces
 * it to half power instead of destroying it; a second hit (already reduced) removes it from
 * `units` entirely. Used at every AE/DE/EX casualty and every "no room to retreat" fallback.
 */
export function applyCasualty(
  units: Record<string, Unit>,
  unitId: string
): { units: Record<string, Unit>; outcome: CasualtyOutcome } {
  const unit = units[unitId];
  if (!unit) return { units, outcome: "eliminated" };
  if (unit.reduced) {
    const { [unitId]: _drop, ...rest } = units;
    return { units: rest, outcome: "eliminated" };
  }
  return { units: { ...units, [unitId]: { ...unit, reduced: true } }, outcome: "reduced" };
}

// Order of battle for each side — 15 units. Ordered infantry → cavalry → heavy → artillery
// to match the deployment tables, which put the foot in front and the guns at the back.
export const ORDER_OF_BATTLE: UnitKind[] = [
  "infantry",
  "infantry",
  "infantry",
  "infantry",
  "infantry",
  "infantry",
  "infantry",
  "cavalry",
  "cavalry",
  "cavalry",
  "heavy-cavalry",
  "heavy-cavalry",
  "artillery",
  "artillery",
  "artillery",
];

// Resupply can raise fresh formations of the common arms — elite Heavy Cavalry can't be replaced.
export const RESUPPLY_KINDS: UnitKind[] = ["infantry", "cavalry", "artillery"];
