"use client";

import { RESUPPLY_KINDS, UNIT_TYPES, unitDisplayName } from "@/lib/units";
import type { GameState, UnitKind } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  state: GameState;
  /** Reduced units in supply that could be brought back to full strength. */
  resupplyableIds: Set<string>;
  /** Unit kind staged for mustering, awaiting a home hex click. */
  pendingKind: UnitKind | null;
  onSelectKind: (kind: UnitKind | null) => void;
  onFlip: (unitId: string) => void;
  onSkip: () => void;
}

export default function ResupplyPrompt({ state, resupplyableIds, pendingKind, onSelectKind, onFlip, onSkip }: Props) {
  const recoverable = [...resupplyableIds].map((id) => state.units[id]).filter(Boolean);
  const reducedTotal = Object.values(state.units).filter((u) => u.faction === state.playerFaction && u.reduced).length;
  const cutOff = reducedTotal - recoverable.length;

  return (
    <div className="rounded-lg border-2 border-[#7fa86e] bg-[#17130c] px-4 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-[#cbbf9c]">
          <span className="text-[#7fa86e] font-bold">Resupply</span> — bring a worn unit back to full strength, or
          muster a fresh half-strength formation on your side of the board.
        </div>
        <div
          data-resupply-left={state.resupplyLeft}
          className="text-xs font-black tracking-widest text-[#7fa86e] border border-[#7fa86e] rounded-md px-2.5 py-1 whitespace-nowrap"
        >
          {state.resupplyLeft} ACTION{state.resupplyLeft === 1 ? "" : "S"} LEFT
        </div>
      </div>

      {recoverable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] tracking-widest text-[#8a7f63]">BACK TO FULL STRENGTH</span>
          {recoverable.map((u) => (
            <button
              key={u.id}
              onClick={() => onFlip(u.id)}
              className="px-3 py-1.5 rounded-md border border-[#7fa86e] text-xs font-bold text-[#cbbf9c] hover:bg-[#7fa86e] hover:text-[#17130c] transition"
            >
              {unitDisplayName(u.faction, u.kind)} ({u.pos.col}-{u.pos.row})
            </button>
          ))}
        </div>
      )}

      {reducedTotal === 0 && <div className="text-xs text-[#8a7f63]">No worn units to bring back up — the army is at full strength.</div>}
      {cutOff > 0 && (
        <div className="text-xs text-[#8a7f63]">
          {cutOff} reduced unit{cutOff > 1 ? "s are" : " is"} cut off — in an enemy Zone of Control, or with no clear line back to
          a town you hold or your own edge of the board.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] tracking-widest text-[#8a7f63]">MUSTER (HALF STRENGTH)</span>
        {RESUPPLY_KINDS.map((kind) => (
          <button
            key={kind}
            onClick={() => onSelectKind(pendingKind === kind ? null : kind)}
            className={cn(
              "px-3 py-1.5 rounded-md border text-xs font-bold transition",
              pendingKind === kind
                ? "border-[#f4d35e] bg-[#2e5fa6] text-white"
                : "border-[#3a2f1c] bg-[#1f3f73] text-[#dce8fb] hover:brightness-110"
            )}
          >
            {unitDisplayName(state.playerFaction, kind)} {UNIT_TYPES[kind].power / 2}-{UNIT_TYPES[kind].movement}
          </button>
        ))}
        <button onClick={onSkip} className="ml-auto text-xs text-[#8a7f63] hover:text-[#cbbf9c] transition">
          Skip resupply →
        </button>
      </div>

      {pendingKind && (
        <div className="text-xs text-[#f4d35e]">
          Click a highlighted hex on your side of the board to muster the {unitDisplayName(state.playerFaction, pendingKind)}.
        </div>
      )}
    </div>
  );
}
