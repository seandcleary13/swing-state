import type { CombatLogEntry, GameState } from "./types";

export function addLog(state: GameState, text: string, kind: CombatLogEntry["kind"] = "info"): GameState {
  const entry: CombatLogEntry = { id: `${Date.now()}-${Math.random()}`, turn: state.turn, text, kind };
  return { ...state, log: [entry, ...state.log].slice(0, 40) };
}
