import type { Faction } from "./types";
import type { CasualtyOutcome } from "./units";

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

// --- Combat log narration -------------------------------------------------------------------
// Every combat log line leads with the named CRT result, then states plainly which side lost
// what — "Defender Eliminated — Coalition loses Foot Battery" — instead of burying that in
// attack-narrative prose the reader has to parse to find out who actually lost a unit.

export interface CombatLoss {
  faction: Faction;
  unitLabel: string;
  outcome: CasualtyOutcome;
}

export interface CombatFallback {
  faction: Faction;
  unitLabel: string;
}

function factionLabel(f: Faction): string {
  return f === "france" ? "France" : "Coalition";
}

function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]}, and ${parts[1]}`;
  return `${parts.slice(0, -1).join("; ")}; and ${parts[parts.length - 1]}`;
}

export function narrateCombat(opts: {
  result: CombatResult;
  odds: OddsColumn;
  roll: number;
  /** Units that took a casualty (reduced or eliminated) as a direct result of this roll. */
  losses: CombatLoss[];
  /** A side that fell back with no casualty this roll — the retreat itself logs separately. */
  fellBack?: CombatFallback | null;
  /** Override the body clause entirely, for bombarding no-effect cases ("the barrage goes wide"). */
  note?: string;
}): string {
  const lead = RESULT_LABELS[opts.result];
  let body: string;
  if (opts.note) {
    body = opts.note;
  } else if (opts.losses.length) {
    body = joinClauses(
      opts.losses.map(
        (l) => `${factionLabel(l.faction)} loses ${l.unitLabel}${l.outcome === "reduced" ? " (reduced to half strength)" : ""}`
      )
    );
  } else if (opts.fellBack) {
    body = `${factionLabel(opts.fellBack.faction)}'s ${opts.fellBack.unitLabel} falls back`;
  } else {
    body = "no casualties";
  }
  return `${lead} — ${body} (${opts.odds}, roll ${opts.roll}).`;
}
