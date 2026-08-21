"use client";

import { TERRAIN_DEFS } from "@/lib/mapData";
import { UNIT_TYPES, unitDisplayName } from "@/lib/units";
import type { GameState } from "@/lib/types";
import { hexKey } from "@/lib/hex";

export default function UnitInfoPanel({ state }: { state: GameState }) {
  const unit = state.selectedUnitId ? state.units[state.selectedUnitId] : null;
  if (!unit) {
    return (
      <div className="rounded-lg border border-[#3a2f1c] bg-[#17130c] px-4 py-3 text-sm text-[#8a7f63]">
        {state.phase === "player-move" && "Select one of your units to see movement range."}
        {state.phase === "player-combat" && "Select one of your units to attack an adjacent enemy."}
        {state.phase === "setup" && "Choose a unit from the tray, then place it."}
        {state.phase === "game-over" && "The campaign has ended."}
      </div>
    );
  }
  const def = UNIT_TYPES[unit.kind];
  const tile = state.map[hexKey(unit.pos)];

  return (
    <div className="rounded-lg border border-[#f4d35e] bg-[#17130c] px-4 py-3">
      <div className="font-black text-[#f4d35e] text-sm mb-1">{unitDisplayName(unit.faction, unit.kind)}</div>
      <div className="text-xs text-[#cbbf9c] flex gap-3 mb-1">
        <span>ATK {def.attack}</span>
        <span>DEF {def.defense}</span>
        <span>MOV {def.movement}</span>
      </div>
      <div className="text-xs text-[#8a7f63]">
        On {TERRAIN_DEFS[tile.terrain].label}
        {tile.objectiveName ? ` — ${tile.objectiveName}` : ""}
      </div>
      <div className="text-xs mt-1 flex gap-2">
        {unit.hasMoved && <span className="text-[#8a7f63]">Moved</span>}
        {unit.hasAttacked && <span className="text-[#8a7f63]">Attacked</span>}
        {unit.routed && <span className="text-[#d5595c]">Disordered</span>}
      </div>
    </div>
  );
}
