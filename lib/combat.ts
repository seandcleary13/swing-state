export type CombatResult = "AE" | "Ar" | "DR" | "EX" | "DE" | "NE";

export const RESULT_LABELS: Record<CombatResult, string> = {
  AE: "Attacker Eliminated",
  Ar: "Attacker Retreats",
  DR: "Defender Retreats",
  EX: "Exchange (one unit lost on each side)",
  DE: "Defender Eliminated",
  NE: "No Effect",
};

// Odds columns, weakest to strongest for the attacker.
export const ODDS_COLUMNS = ["1:3", "1:2", "1:1", "2:1", "3:1", "4:1", "5:1"] as const;
export type OddsColumn = (typeof ODDS_COLUMNS)[number];

// Combat Results Table: [odds column][die roll 1-6]
// Softer than a classic CRT: more retreats, fewer clean eliminations, and the
// defender specifically is harder to wipe out outright (no DE below 2:1 odds).
// Attacker Eliminated is reserved for the single worst roll at the worst odds —
// otherwise a bad attack just falls back (Ar) rather than being destroyed.
export const CRT: Record<OddsColumn, CombatResult[]> = {
  "1:3": ["AE", "Ar", "Ar", "DR", "DR", "NE"],
  "1:2": ["Ar", "Ar", "DR", "DR", "EX", "NE"],
  "1:1": ["Ar", "DR", "DR", "DR", "EX", "EX"],
  "2:1": ["DR", "DR", "DR", "EX", "EX", "DE"],
  "3:1": ["DR", "DR", "EX", "EX", "DE", "DE"],
  "4:1": ["DR", "EX", "DE", "DE", "DE", "DE"],
  "5:1": ["EX", "DE", "DE", "DE", "DE", "DE"],
};

// Odds always round down toward the defender's favor — a ratio only reaches a column
// once it actually meets that threshold (e.g. 1.8 stays "1:1", it does not round up to "2:1").
export function oddsColumnFor(attack: number, defense: number): OddsColumn {
  const ratio = attack / Math.max(defense, 0.5);
  if (ratio >= 5) return "5:1";
  if (ratio >= 4) return "4:1";
  if (ratio >= 3) return "3:1";
  if (ratio >= 2) return "2:1";
  if (ratio >= 1) return "1:1";
  if (ratio >= 0.5) return "1:2";
  return "1:3";
}

export function rollCombat(attack: number, defense: number, roll: number): { odds: OddsColumn; result: CombatResult } {
  const odds = oddsColumnFor(attack, defense);
  const idx = Math.min(Math.max(roll - 1, 0), 5);
  return { odds, result: CRT[odds][idx] };
}
