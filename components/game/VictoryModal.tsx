"use client";

import type { GameState } from "@/lib/types";

function townCount(state: GameState, faction: "france" | "coalition") {
  return Object.values(state.map).filter((t) => t.objective && t.controlledBy === faction).length;
}

export default function VictoryModal({ state, onRestart }: { state: GameState; onRestart: () => void }) {
  const franceTowns = townCount(state, "france");
  const coalitionTowns = townCount(state, "coalition");
  const title =
    state.winner === "france"
      ? "Victory for France!"
      : state.winner === "coalition"
      ? "The Coalition Prevails"
      : "A Bloody Stalemate";

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="rounded-xl border-2 border-[#d4a94a] bg-[#17130c] px-8 py-6 max-w-sm text-center">
        <div className="text-2xl font-black text-[#f4d35e] mb-2">{title}</div>
        <div className="text-sm text-[#cbbf9c] mb-4">
          France holds {franceTowns} towns · Coalition holds {coalitionTowns} towns
        </div>
        <button
          onClick={onRestart}
          className="px-5 py-2 rounded-lg font-black text-sm bg-gradient-to-b from-[#d4a94a] to-[#a87d2c] text-[#1a1608] hover:brightness-110 transition"
        >
          New Campaign
        </button>
      </div>
    </div>
  );
}
