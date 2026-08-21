"use client";

import type { CombatLogEntry } from "@/lib/types";

const KIND_COLOR: Record<CombatLogEntry["kind"], string> = {
  info: "#cbbf9c",
  combat: "#d5595c",
  victory: "#f4d35e",
  setup: "#6ea3e8",
};

export default function CombatLog({ log }: { log: CombatLogEntry[] }) {
  return (
    <div className="rounded-lg border border-[#3a2f1c] bg-[#0f0c07] px-4 py-3 h-40 overflow-y-auto flex flex-col gap-1">
      {log.map((entry, i) => (
        <div key={entry.id} style={{ color: KIND_COLOR[entry.kind], opacity: i === 0 ? 1 : 0.65 }} className="text-xs leading-snug">
          {entry.text}
        </div>
      ))}
    </div>
  );
}
