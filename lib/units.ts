import type { UnitKind, UnitTypeDef } from "./types";

export const UNIT_TYPES: Record<UnitKind, UnitTypeDef> = {
  cavalry: { kind: "cavalry", name: "Cavalry", power: 3, movement: 5, symbol: "CAV" },
  "heavy-cavalry": { kind: "heavy-cavalry", name: "Heavy Cavalry", power: 6, movement: 5, symbol: "HCV" },
  infantry: { kind: "infantry", name: "Infantry", power: 4, movement: 4, symbol: "INF" },
  artillery: { kind: "artillery", name: "Artillery", power: 5, movement: 3, symbol: "ART" },
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

// Order of battle for each side — 9 units, small tutorial-scale scenario.
export const ORDER_OF_BATTLE: UnitKind[] = [
  "infantry",
  "infantry",
  "infantry",
  "infantry",
  "cavalry",
  "cavalry",
  "heavy-cavalry",
  "artillery",
  "artillery",
];
