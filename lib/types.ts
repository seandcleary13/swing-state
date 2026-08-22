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
  defenseMultiplier: number; // defender's Power is multiplied by this when attacked in this terrain
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

export type UnitKind = "cavalry" | "heavy-cavalry" | "infantry" | "artillery";

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
  // Took a first casualty result and now fights at half base power; a second such hit
  // eliminates it. Persistent battlefield damage, not a per-turn flag — never cleared by
  // resetFactionFlags, only removed by taking the unit off the board entirely.
  reduced: boolean;
}

// Turn order: resupply, then cavalry advances alone, then everyone fights, then everyone
// (incl. cavalry again) repositions.
export type GamePhase =
  | "player-resupply"
  | "player-cavalry-move"
  | "player-combat"
  | "player-move"
  | "ai-turn"
  | "game-over";

export interface CombatLogEntry {
  id: string;
  turn: number;
  text: string;
  kind: "info" | "combat" | "victory" | "setup";
}

export type VictoryReason = "overrun" | "annihilation-defender" | "annihilation-attacker" | "held-out";

/** An attacker-retreat in progress: the player is choosing hexes, one unit at a time. */
export interface PendingRetreat {
  unitId: string;
  awayFrom: HexCoord;
  stepsTaken: number;
  queue: string[]; // remaining unit ids that still need to retreat after this one
}

/** Offered after a Defender Retreat the player's own attack caused: advance into the vacated hex, or hold. */
export interface PendingAdvance {
  attackerId: string;
  hex: HexCoord;
}

/** Drives the Coalition's turn one step at a time instead of resolving it all at once. */
export interface AiTurnState {
  subPhase: "resupply" | "cavalry" | "combat" | "move";
  queue: string[];
  pendingAutoAdvance: { attackerId: string; hex: HexCoord } | null;
}

export interface GameState {
  map: Record<string, HexTile>;
  units: Record<string, Unit>;
  turn: number;
  totalTurns: number;
  phase: GamePhase;
  playerFaction: Faction;
  aiFaction: Faction;
  /** France attacks, Coalition defends. The attacker must capture every town before the turns run out; the defender just has to hold out. */
  attackerFaction: Faction;
  defenderFaction: Faction;
  selectedUnitId: string | null;
  reachable: Record<string, number>; // hexKey -> remaining MP cost map for highlight
  /** Combined-attack staging: an enemy targeted this combat phase, and the player units committed against it. */
  combatTargetId: string | null;
  combatAttackerIds: string[];
  /** Interactive attacker-retreat: set while the player is choosing where their falling-back units go. */
  pendingRetreat: PendingRetreat | null;
  retreatOptions: Record<string, true>;
  /** Offered after the player's own attack forces a Defender Retreat: advance into the vacated hex, or hold. */
  pendingAdvance: PendingAdvance | null;
  /** Non-null only during phase "ai-turn": drives the Coalition's turn one step at a time. */
  aiTurnState: AiTurnState | null;
  log: CombatLogEntry[];
  winner: Faction | "draw" | null;
  victoryReason: VictoryReason | null;
  lastCombat: { attackers: string[]; defender: string; odds: string; roll: number; result: string } | null;
}
