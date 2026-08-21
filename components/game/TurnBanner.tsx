"use client";

import type { GameState } from "@/lib/types";

const PHASE_LABEL: Record<string, string> = {
  setup: "Deployment",
  "player-cavalry-move": "1. Cavalry Moves",
  "player-combat": "2. Announce Attacks",
  "player-move": "3. All Units Move",
  "game-over": "Campaign Over",
};

const PHASE_BUTTON_LABEL: Record<string, string> = {
  "player-cavalry-move": "End Cavalry Move →",
  "player-combat": "End Attacks →",
  "player-move": "End Turn →",
};

function townCount(state: GameState, faction: "france" | "coalition") {
  return Object.values(state.map).filter((t) => t.objective && t.controlledBy === faction).length;
}

export default function TurnBanner({ state, onEndPhase }: { state: GameState; onEndPhase: () => void }) {
  const totalTowns = Object.values(state.map).filter((t) => t.objective).length;
  const franceTowns = townCount(state, "france");
  const coalitionTowns = townCount(state, "coalition");

  return (
    <div className="rounded-lg border border-[#3a2f1c] bg-[#17130c] px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-xs tracking-widest text-[#cbbf9c]">18 JUNE 1815 · TURN {state.turn} / {state.totalTurns}</div>
          <div className="text-lg font-black tracking-wide text-[#f4d35e]">{PHASE_LABEL[state.phase]}</div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-center">
            <div className="font-black text-[#6ea3e8]">{franceTowns}</div>
            <div className="text-[10px] text-[#8a7f63]">FRANCE · ATTACKER</div>
          </div>
          <div className="text-[#8a7f63]">of {totalTowns} towns must fall</div>
          <div className="text-center">
            <div className="font-black text-[#d5595c]">{coalitionTowns}</div>
            <div className="text-[10px] text-[#8a7f63]">COALITION · DEFENDER</div>
          </div>
        </div>
        {state.phase in PHASE_BUTTON_LABEL && (
          <button
            onClick={onEndPhase}
            className="px-4 py-2 rounded-md font-black text-sm tracking-wide bg-gradient-to-b from-[#d4a94a] to-[#a87d2c] text-[#1a1608] hover:brightness-110 transition"
          >
            {PHASE_BUTTON_LABEL[state.phase]}
          </button>
        )}
      </div>
    </div>
  );
}
