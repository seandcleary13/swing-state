"use client";

import { unitDisplayName } from "@/lib/units";
import type { GameState } from "@/lib/types";

export default function RetreatPrompt({ state }: { state: GameState }) {
  if (!state.pendingRetreat) return null;
  const unit = state.units[state.pendingRetreat.unitId];
  if (!unit) return null;

  return (
    <div className="rounded-lg border-2 border-[#d5595c] bg-[#17130c] px-4 py-3 text-sm text-[#cbbf9c]">
      <span className="text-[#d5595c] font-bold">{unitDisplayName(unit.faction, unit.kind)}</span> was repulsed and must
      fall back — click one of the highlighted hexes to choose its retreat.
      {state.pendingRetreat.queue.length > 0 && (
        <span className="text-[#8a7f63]"> ({state.pendingRetreat.queue.length} more unit{state.pendingRetreat.queue.length > 1 ? "s" : ""} waiting.)</span>
      )}
    </div>
  );
}
