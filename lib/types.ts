import type { HexCoord } from "./hex";

export type Faction = "france" | "coalition";

export type TerrainType =
  | "clear"
  | "forest"
  | "hill"
  | "town"
  | "river"
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

export type UnitKind =
  | "guard-infantry"
  | "line-infantry"
  | "light-infantry"
  | "heavy-cavalry"
  | "light-cavalry"
  | "horse-artillery"
  | "foot-artillery";

export interface UnitTypeDef {
  kind: UnitKind;
  name: string;
  attack: number;
  defense: number;
  movement: number;
  symbol: string; // short glyph shown on the counter
}

export interface Unit {
  id: string;
  faction: Faction;
  kind: UnitKind;
  pos: HexCoord;
  hasMoved: boolean;
  hasAttacked: boolean;
  routed: boolean; // retreated this turn, disordered until its side's next move phase
}

export type GamePhase = "setup" | "player-move" | "player-combat" | "game-over";

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
