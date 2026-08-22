"use client";

import { useState } from "react";
import { hexDistance, hexKey } from "@/lib/hex";
import { oddsColumnFor, type OddsColumn } from "@/lib/combat";
import { TERRAIN_DEFS } from "@/lib/mapData";
import { UNIT_TYPES, currentPower, defensePower, defenseValue, unitDisplayName } from "@/lib/units";
import type { GameState } from "@/lib/types";
import CrtTable from "./CrtTable";

function terrainMultiplier(state: GameState, pos: { col: number; row: number }): number {
  const tile = state.map[hexKey(pos)];
  return tile ? TERRAIN_DEFS[tile.terrain].defenseMultiplier : 1;
}

export default function CombatPreview({
  state,
  onConfirm,
  onClear,
}: {
  state: GameState;
  onConfirm: () => void;
  onClear: () => void;
}) {
  const [showCrt, setShowCrt] = useState(false);

  function frame(children: React.ReactNode, odds?: OddsColumn, border = "border-[#3a2f1c]") {
    return (
      <div className={`rounded-lg border ${border} bg-[#17130c] px-4 py-3 flex flex-col gap-2`}>
        {children}
        <div className="flex items-center">
          <button
            onClick={() => setShowCrt((v) => !v)}
            className="text-[11px] text-[#8a7f63] hover:text-[#f4d35e] transition underline decoration-dotted underline-offset-2"
          >
            {showCrt ? "Hide combat results table" : "🎲 Check combat results table"}
          </button>
        </div>
        {showCrt && (
          <div className="rounded-md border border-[#3a2f1c] bg-[#0f0c07] px-3 py-2">
            <CrtTable highlightOdds={odds} />
          </div>
        )}
      </div>
    );
  }

  if (!state.combatTargetId) {
    return frame(
      <div className="text-sm text-[#8a7f63]">
        Click an enemy unit to target it, then click your own units in range to commit them to the attack.
      </div>
    );
  }

  const target = state.units[state.combatTargetId];
  if (!target) return null;
  const attackers = state.combatAttackerIds.map((id) => state.units[id]).filter(Boolean);
  const targetName = unitDisplayName(state.aiFaction, target.kind);
  const defPower = defensePower(defenseValue(target), terrainMultiplier(state, target.pos));
  const bombardingOnly = attackers.length > 0 && attackers.every((u) => hexDistance(u.pos, target.pos) > 1);
  const gunsDugIn = target.kind === "artillery";

  if (!attackers.length) {
    return frame(
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-[#cbbf9c]">
          Targeting <span className="text-[#f4d35e] font-bold">{targetName}</span> (defends at {defPower}
          {gunsDugIn ? ", guns always defend at 2" : ""}) — click your units in range to commit them.
        </div>
        <button onClick={onClear} className="text-xs text-[#8a7f63] hover:text-[#cbbf9c] transition">
          Clear target
        </button>
      </div>,
      undefined,
      "border-[#f4d35e]"
    );
  }

  const atkPower = attackers.reduce((sum, u) => sum + currentPower(u), 0);
  const odds = oddsColumnFor(atkPower, defPower);
  const names = attackers.map((u) => unitDisplayName(state.playerFaction, u.kind)).join(", ");

  return frame(
    <>
      <div className="text-sm text-[#cbbf9c]">
        <span className="text-[#f4d35e] font-bold">{names}</span> ({atkPower} power) vs.{" "}
        <span className="text-[#d5595c] font-bold">{targetName}</span> (defends at {defPower}
        {gunsDugIn ? " — guns always defend at 2" : ""}) — Odds{" "}
        <span className="font-black text-[#f4d35e]">{odds}</span>
        {bombardingOnly && <span className="text-[#8a7f63]"> (bombarding — can't be eliminated or forced back by this attack)</span>}
      </div>
      <div className="flex items-center justify-end gap-3">
        <button onClick={onClear} className="text-xs text-[#8a7f63] hover:text-[#cbbf9c] transition">
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-2 rounded-md font-black text-sm tracking-wide bg-gradient-to-b from-[#d4a94a] to-[#a87d2c] text-[#1a1608] hover:brightness-110 transition"
        >
          ⚔ Attack ({odds})
        </button>
      </div>
    </>,
    odds,
    "border-[#f4d35e] border-2"
  );
}
