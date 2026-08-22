"use client";

import { unitDisplayName } from "@/lib/units";
import type { GameState } from "@/lib/types";

export default function RetreatPrompt({ state, onStop }: { state: GameState; onStop: () => void }) {
  if (!state.pendingRetreat) return null;
  const unit = state.units[state.pendingRetreat.unitId];
  if (!unit) return null;
  const canStop = state.pendingRetreat.stepsTaken >= 1;

  return (
    <div className="rounded-lg border-2 border-[#d5595c] bg-[#17130c] px-4 py-3 flex items-center justify-between gap-3 flex-wrap text-sm text-[#cbbf9c]">
      <div>
        <span className="text-[#d5595c] font-bold">{unitDisplayName(unit.faction, unit.kind)}</span> was repulsed and
        must fall back — click one of the highlighted hexes to choose its retreat, up to 3 hexes.
        {state.pendingRetreat.queue.length > 0 && (
          <span className="text-[#8a7f63]"> ({state.pendingRetreat.queue.length} more unit{state.pendingRetreat.queue.length > 1 ? "s" : ""} waiting.)</span>
        )}
      </div>
      {canStop && (
        <button
          onClick={onStop}
          className="px-3 py-1.5 rounded-md text-xs font-black tracking-wide border border-[#d5595c] text-[#d5595c] hover:bg-[#d5595c] hover:text-[#17130c] transition"
        >
          Stop Retreating
        </button>
      )}
    </div>
  );
}
