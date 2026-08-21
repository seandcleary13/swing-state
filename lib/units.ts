import type { UnitKind, UnitTypeDef } from "./types";

export const UNIT_TYPES: Record<UnitKind, UnitTypeDef> = {
  "guard-infantry": { kind: "guard-infantry", name: "Guard Infantry", attack: 6, defense: 6, movement: 4, symbol: "GD" },
  "line-infantry": { kind: "line-infantry", name: "Line Infantry", attack: 4, defense: 4, movement: 4, symbol: "IN" },
  "light-infantry": { kind: "light-infantry", name: "Light Infantry", attack: 3, defense: 3, movement: 5, symbol: "LI" },
  "heavy-cavalry": { kind: "heavy-cavalry", name: "Heavy Cavalry", attack: 5, defense: 3, movement: 8, symbol: "HC" },
  "light-cavalry": { kind: "light-cavalry", name: "Light Cavalry", attack: 4, defense: 2, movement: 9, symbol: "LC" },
  "horse-artillery": { kind: "horse-artillery", name: "Horse Artillery", attack: 4, defense: 2, movement: 6, symbol: "HA" },
  "foot-artillery": { kind: "foot-artillery", name: "Foot Artillery", attack: 5, defense: 2, movement: 3, symbol: "FA" },
};

// Faction-flavored display names for the same unit kinds.
export const FACTION_UNIT_NAMES: Record<"france" | "coalition", Partial<Record<UnitKind, string>>> = {
  france: {
    "guard-infantry": "Imperial Guard",
    "line-infantry": "Line Infantry",
    "light-infantry": "Voltigeurs",
    "heavy-cavalry": "Cuirassiers",
    "light-cavalry": "Hussars",
    "horse-artillery": "Horse Artillery",
    "foot-artillery": "Foot Artillery",
  },
  coalition: {
    "guard-infantry": "Foot Guards",
    "line-infantry": "Line Infantry",
    "light-infantry": "Jäger",
    "heavy-cavalry": "Dragoons",
    "light-cavalry": "Uhlans",
    "horse-artillery": "Horse Artillery",
    "foot-artillery": "Foot Artillery",
  },
};

export function unitDisplayName(faction: "france" | "coalition", kind: UnitKind): string {
  return FACTION_UNIT_NAMES[faction][kind] ?? UNIT_TYPES[kind].name;
}

// Order of battle for each side — 8 units, small tutorial-scale scenario.
export const ORDER_OF_BATTLE: UnitKind[] = [
  "guard-infantry",
  "line-infantry",
  "line-infantry",
  "light-infantry",
  "heavy-cavalry",
  "light-cavalry",
  "horse-artillery",
  "foot-artillery",
];
