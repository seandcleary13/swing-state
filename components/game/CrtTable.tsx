"use client";

import { CRT, ODDS_COLUMNS, RESULT_LABELS, type CombatResult, type OddsColumn } from "@/lib/combat";
import { cn } from "@/lib/utils";

const RESULT_COLOR: Record<CombatResult, string> = {
  AE: "text-[#ff6b6b]",
  Ar: "text-[#ffa96b]",
  DR: "text-[#9fd28a]",
  EX: "text-[#e0c46b]",
  DE: "text-[#6ea3e8]",
  NE: "text-[#8a7f63]",
};

/** The full Combat Results Table, optionally with the row for a pending attack picked out. */
export default function CrtTable({ highlightOdds }: { highlightOdds?: OddsColumn }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[320px]">
          <thead>
            <tr>
              <th className="text-left py-1 pr-2 font-black text-[#8a7f63] tracking-widest text-[10px]">ODDS</th>
              {[1, 2, 3, 4, 5, 6].map((r) => (
                <th key={r} className="py-1 px-1 font-black text-[#8a7f63] tracking-widest text-[10px]">
                  ⚄{r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ODDS_COLUMNS.map((odds) => {
              const isHit = highlightOdds === odds;
              return (
                <tr key={odds} className={cn(isHit && "bg-[#f4d35e]/15")}>
                  <td
                    className={cn(
                      "py-1 pr-2 font-black whitespace-nowrap",
                      isHit ? "text-[#f4d35e]" : "text-[#cbbf9c]"
                    )}
                  >
                    {isHit ? "▶ " : ""}
                    {odds}
                  </td>
                  {CRT[odds].map((result, i) => (
                    <td key={i} className={cn("py-1 px-1 text-center font-bold", RESULT_COLOR[result])}>
                      {result}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] leading-tight">
        {(Object.keys(RESULT_LABELS) as CombatResult[]).map((r) => (
          <span key={r} className="text-[#8a7f63]">
            <span className={cn("font-black", RESULT_COLOR[r])}>{r}</span> {RESULT_LABELS[r]}
          </span>
        ))}
      </div>
      <p className="text-[10px] leading-relaxed text-[#8a7f63]">
        Odds round down in the defender's favour. A first Eliminated or Exchange result reduces a unit to half Power
        rather than removing it; only a second such hit destroys it.
      </p>
    </div>
  );
}
