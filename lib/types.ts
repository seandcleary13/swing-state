import type { HexCoord } from "./hex";

export type Faction = "france" | "coalition";

export type TerrainType =
  | "clear"
  | "forest"
  | "hill"
  | "town"
  | "marsh";

export interface TerrainDef {
  moveCost: number;
  defenseBonus: number; // added to defender's strength when attacked in this terrain
  label: string;
}

export interface HexTile {
  col: number;
  row: number;
  terrain: TerrainType;
  road: boolean;
  objective: boolean;
  objectiveName?: string;
  /** Which faction currently controls this objective (starts as home side, flips when captured). */
  controlledBy?: Faction;
  deploymentFor?: Faction;
}

export type UnitKind = "cavalry" | "infantry" | "artillery";

export interface UnitTypeDef {
  kind: UnitKind;
  name: string;
  power: number; // single stat used as both attack and defense
  movement: number;
  symbol: string; // short glyph shown on the counter
}

export interface Unit {
  id: string;
  faction: Faction;
  kind: UnitKind;
  pos: HexCoord;
  hasCavalryMoved: boolean; // consumed only by the opening cavalry-only movement phase
  hasMoved: boolean; // consumed by the general movement phase (every unit type, incl. cavalry again)
  hasAttacked: boolean;
  routed: boolean; // retreated this turn, disordered until its side's next cavalry-move phase
}

// Turn order: cavalry advances alone, then everyone fights, then everyone (incl. cavalry again) repositions.
export type GamePhase =
  | "setup"
  | "player-cavalry-move"
  | "player-combat"
  | "player-move"
  | "game-over";

export interface CombatLogEntry {
  id: string;
  turn: number;
  text: string;
  kind: "info" | "combat" | "victory" | "setup";
}

export interface GameState {
  map: Record<string, HexTile>;
  units: Record<string, Unit>;
  turn: number;
  totalTurns: number;
  phase: GamePhase;
  playerFaction: Faction;
  aiFaction: Faction;
  selectedUnitId: string | null;
  reachable: Record<string, number>; // hexKey -> remaining MP cost map for highlight
  log: CombatLogEntry[];
  setupPool: Record<Faction, UnitKind[]>; // remaining units to deploy
  winner: Faction | "draw" | null;
  lastCombat: { attacker: string; defender: string; odds: string; roll: number; result: string } | null;
}
