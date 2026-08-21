import type { UnitKind, UnitTypeDef } from "./types";

export const UNIT_TYPES: Record<UnitKind, UnitTypeDef> = {
  cavalry: { kind: "cavalry", name: "Cavalry", attack: 5, defense: 3, movement: 8, symbol: "CAV" },
  infantry: { kind: "infantry", name: "Infantry", attack: 4, defense: 4, movement: 4, symbol: "INF" },
  artillery: { kind: "artillery", name: "Artillery", attack: 5, defense: 2, movement: 3, symbol: "ART" },
};

// Faction-flavored display names for the same unit kinds.
export const FACTION_UNIT_NAMES: Record<"france" | "coalition", Record<UnitKind, string>> = {
  france: {
    cavalry: "Cuirassiers",
    infantry: "Line Infantry",
    artillery: "Grande Battery",
  },
  coalition: {
    cavalry: "Dragoons",
    infantry: "Line Infantry",
    artillery: "Foot Battery",
  },
};

export function unitDisplayName(faction: "france" | "coalition", kind: UnitKind): string {
  return FACTION_UNIT_NAMES[faction][kind] ?? UNIT_TYPES[kind].name;
}

// Order of battle for each side — 8 units, small tutorial-scale scenario.
export const ORDER_OF_BATTLE: UnitKind[] = [
  "infantry",
  "infantry",
  "infantry",
  "infantry",
  "cavalry",
  "cavalry",
  "artillery",
  "artillery",
];
