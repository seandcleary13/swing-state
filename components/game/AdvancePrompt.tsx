"use client";

import { unitDisplayName } from "@/lib/units";
import type { GameState } from "@/lib/types";

export default function AdvancePrompt({
  state,
  onConfirm,
  onDecline,
}: {
  state: GameState;
  onConfirm: () => void;
  onDecline: () => void;
}) {
  if (!state.pendingAdvance) return null;
  const unit = state.units[state.pendingAdvance.attackerId];
  if (!unit) return null;

  return (
    <div className="rounded-lg border-2 border-[#f4d35e] bg-[#17130c] px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="text-sm text-[#cbbf9c]">
        <span className="text-[#f4d35e] font-bold">{unitDisplayName(unit.faction, unit.kind)}</span> can advance into
        the ground the enemy just vacated.
      </div>
      <div className="flex items-center gap-3">
        <button onClick={onDecline} className="text-xs text-[#8a7f63] hover:text-[#cbbf9c] transition">
          Hold Position
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-2 rounded-md font-black text-sm tracking-wide bg-gradient-to-b from-[#d4a94a] to-[#a87d2c] text-[#1a1608] hover:brightness-110 transition"
        >
          Advance →
        </button>
      </div>
    </div>
  );
}
