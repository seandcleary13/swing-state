"use client";

import { hexDistance, hexKey } from "@/lib/hex";
import { oddsColumnFor } from "@/lib/combat";
import { TERRAIN_DEFS } from "@/lib/mapData";
import { UNIT_TYPES, defensePower, unitDisplayName } from "@/lib/units";
import type { GameState } from "@/lib/types";

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
  if (!state.combatTargetId) {
    return (
      <div className="rounded-lg border border-[#3a2f1c] bg-[#17130c] px-4 py-3 text-sm text-[#8a7f63]">
        Click an enemy unit to target it, then click your own units in range to commit them to the attack.
      </div>
    );
  }

  const target = state.units[state.combatTargetId];
  if (!target) return null;
  const attackers = state.combatAttackerIds.map((id) => state.units[id]).filter(Boolean);
  const targetName = unitDisplayName(state.aiFaction, target.kind);
  const defPower = defensePower(UNIT_TYPES[target.kind].power, terrainMultiplier(state, target.pos));
  const bombardingOnly = attackers.length > 0 && attackers.every((u) => hexDistance(u.pos, target.pos) > 1);

  if (!attackers.length) {
    return (
      <div className="rounded-lg border border-[#f4d35e] bg-[#17130c] px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-[#cbbf9c]">
          Targeting <span className="text-[#f4d35e] font-bold">{targetName}</span> ({defPower} power) — click your units in range to commit them.
        </div>
        <button onClick={onClear} className="text-xs text-[#8a7f63] hover:text-[#cbbf9c] transition">
          Clear target
        </button>
      </div>
    );
  }

  const atkPower = attackers.reduce((sum, u) => sum + UNIT_TYPES[u.kind].power, 0);
  const odds = oddsColumnFor(atkPower, defPower);
  const names = attackers.map((u) => unitDisplayName(state.playerFaction, u.kind)).join(", ");

  return (
    <div className="rounded-lg border-2 border-[#f4d35e] bg-[#17130c] px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="text-sm text-[#cbbf9c]">
        <span className="text-[#f4d35e] font-bold">{names}</span> ({atkPower} power) vs.{" "}
        <span className="text-[#d5595c] font-bold">{targetName}</span> ({defPower} power) — Odds{" "}
        <span className="font-black text-[#f4d35e]">{odds}</span>
        {bombardingOnly && <span className="text-[#8a7f63]"> (bombarding — can't be eliminated or forced back by this attack)</span>}
      </div>
      <div className="flex items-center gap-3">
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
    </div>
  );
}
