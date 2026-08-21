export type CombatResult = "AE" | "DR" | "EX" | "DE" | "NE";

export const RESULT_LABELS: Record<CombatResult, string> = {
  AE: "Attacker Eliminated",
  DR: "Defender Retreats",
  EX: "Exchange (both eliminated)",
  DE: "Defender Eliminated",
  NE: "No Effect",
};

// Odds columns, weakest to strongest for the attacker.
const ODDS_COLUMNS = ["1:3", "1:2", "1:1", "2:1", "3:1", "4:1", "5:1"] as const;
export type OddsColumn = (typeof ODDS_COLUMNS)[number];

// Combat Results Table: [odds column][die roll 1-6]
// Softer than a classic CRT: more retreats, fewer clean eliminations, and the
// defender specifically is harder to wipe out outright (no DE below 2:1 odds).
const CRT: Record<OddsColumn, CombatResult[]> = {
  "1:3": ["AE", "AE", "DR", "DR", "DR", "NE"],
  "1:2": ["AE", "DR", "DR", "DR", "EX", "NE"],
  "1:1": ["AE", "DR", "DR", "DR", "EX", "EX"],
  "2:1": ["DR", "DR", "DR", "EX", "EX", "DE"],
  "3:1": ["DR", "DR", "EX", "EX", "DE", "DE"],
  "4:1": ["DR", "EX", "DE", "DE", "DE", "DE"],
  "5:1": ["EX", "DE", "DE", "DE", "DE", "DE"],
};

export function oddsColumnFor(attack: number, defense: number): OddsColumn {
  const ratio = attack / Math.max(defense, 0.5);
  if (ratio < 0.4) return "1:3";
  if (ratio < 0.75) return "1:2";
  if (ratio < 1.5) return "1:1";
  if (ratio < 2.5) return "2:1";
  if (ratio < 3.5) return "3:1";
  if (ratio < 4.5) return "4:1";
  return "5:1";
}

export function rollCombat(attack: number, defense: number, roll: number): { odds: OddsColumn; result: CombatResult } {
  const odds = oddsColumnFor(attack, defense);
  const idx = Math.min(Math.max(roll - 1, 0), 5);
  return { odds, result: CRT[odds][idx] };
}
