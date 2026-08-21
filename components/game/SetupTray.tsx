"use client";

import { UNIT_TYPES, unitDisplayName } from "@/lib/units";
import type { UnitKind } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  pool: UnitKind[];
  pending: UnitKind | null;
  onSelect: (kind: UnitKind) => void;
}

export default function SetupTray({ pool, pending, onSelect }: Props) {
  const counts = new Map<UnitKind, number>();
  for (const k of pool) counts.set(k, (counts.get(k) ?? 0) + 1);

  return (
    <div className="rounded-lg border border-[#3a2f1c] bg-[#17130c] px-4 py-3">
      <div className="text-xs tracking-widest text-[#cbbf9c] mb-2">
        {pool.length > 0 ? `SELECT A UNIT, THEN CLICK A BLUE DEPLOYMENT HEX (${pool.length} LEFT)` : "DEPLOYMENT COMPLETE"}
      </div>
      <div className="flex flex-wrap gap-2">
        {[...counts.entries()].map(([kind, count]) => (
          <button
            key={kind}
            onClick={() => onSelect(kind)}
            className={cn(
              "px-3 py-2 rounded-md border text-xs font-bold flex flex-col items-center gap-0.5 transition",
              pending === kind ? "border-[#f4d35e] bg-[#2e5fa6] text-white scale-105" : "border-[#3a2f1c] bg-[#1f3f73] text-[#dce8fb] hover:brightness-110"
            )}
          >
            <span>{unitDisplayName("france", kind)} ×{count}</span>
            <span className="text-[10px] opacity-80">
              {UNIT_TYPES[kind].attack}-{UNIT_TYPES[kind].defense}-{UNIT_TYPES[kind].movement}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
