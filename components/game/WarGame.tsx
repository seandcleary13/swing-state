"use client";

import { useMemo, useReducer, useState } from "react";
import { gameReducer, initGameState } from "@/lib/gameEngine";
import { hexDistance, hexKey, hexNeighbors, type HexCoord } from "@/lib/hex";
import { unitAt } from "@/lib/movement";
import { isCavalryKind } from "@/lib/units";
import type { UnitKind } from "@/lib/types";
import HexGrid from "./HexGrid";
import TurnBanner from "./TurnBanner";
import SetupTray from "./SetupTray";
import UnitInfoPanel from "./UnitInfoPanel";
import CombatLog from "./CombatLog";
import VictoryModal from "./VictoryModal";
import RulesPanel from "./RulesPanel";
import { cn } from "@/lib/utils";

export default function WarGame() {
  const [state, dispatch] = useReducer(gameReducer, undefined, initGameState);
  const [pendingKind, setPendingKind] = useState<UnitKind | null>(null);
  const [tab, setTab] = useState<"battle" | "rules">("battle");

  const attackableIds = useMemo(() => {
    const set = new Set<string>();
    if (state.phase !== "player-combat" || !state.selectedUnitId) return set;
    const attacker = state.units[state.selectedUnitId];
    if (!attacker || attacker.hasAttacked) return set;
    for (const n of hexNeighbors(attacker.pos)) {
      const enemy = unitAt(state.units, n);
      if (enemy && enemy.faction === state.aiFaction) set.add(enemy.id);
    }
    return set;
  }, [state]);

  function handleHexClick(hex: HexCoord) {
    const key = hexKey(hex);
    const tile = state.map[key];
    const occ = unitAt(state.units, hex);

    if (state.phase === "setup") {
      if (pendingKind && tile?.deploymentFor === "france" && !occ) {
        dispatch({ type: "SETUP_PLACE", kind: pendingKind, hex });
        setPendingKind(null);
      }
      return;
    }

    if (state.phase === "player-cavalry-move") {
      if (occ && occ.faction === state.playerFaction) {
        dispatch({ type: "SELECT_UNIT", unitId: isCavalryKind(occ.kind) && !occ.hasCavalryMoved ? occ.id : null });
      } else if (state.selectedUnitId && key in state.reachable) {
        dispatch({ type: "MOVE_UNIT", hex });
      } else {
        dispatch({ type: "SELECT_UNIT", unitId: null });
      }
      return;
    }

    if (state.phase === "player-move") {
      if (occ && occ.faction === state.playerFaction) {
        dispatch({ type: "SELECT_UNIT", unitId: occ.hasMoved ? null : occ.id });
      } else if (state.selectedUnitId && key in state.reachable) {
        dispatch({ type: "MOVE_UNIT", hex });
      } else {
        dispatch({ type: "SELECT_UNIT", unitId: null });
      }
      return;
    }

    if (state.phase === "player-combat") {
      if (occ && occ.faction === state.playerFaction) {
        dispatch({ type: "SELECT_UNIT", unitId: occ.hasAttacked ? null : occ.id });
      } else if (occ && occ.faction === state.aiFaction && state.selectedUnitId) {
        const attacker = state.units[state.selectedUnitId];
        if (attacker && hexDistance(attacker.pos, occ.pos) === 1) {
          dispatch({ type: "ATTACK", defenderId: occ.id });
        }
      } else {
        dispatch({ type: "SELECT_UNIT", unitId: null });
      }
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center py-4 px-3" style={{ background: "radial-gradient(ellipse at top, #1a140b 0%, #0c0a06 65%)" }}>
      <div className="w-full max-w-4xl flex flex-col gap-3">
        <div className="text-center">
          <h1 className="text-3xl font-black tracking-widest text-[#f4d35e]" style={{ textShadow: "0 0 24px rgba(212,169,74,0.35)" }}>
            1815: FIELD OF EAGLES
          </h1>
          <p className="text-xs tracking-widest text-[#8a7f63]">A NAPOLEONIC HEX WARGAME</p>
        </div>

        <div className="flex rounded-lg overflow-hidden border border-[#3a2f1c]">
          {(["battle", "rules"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-2 text-sm font-black tracking-widest transition",
                tab === t ? "bg-gradient-to-b from-[#d4a94a] to-[#a87d2c] text-[#1a1608]" : "bg-[#17130c] text-[#8a7f63]"
              )}
            >
              {t === "battle" ? "⚔ CAMPAIGN" : "📜 RULES"}
            </button>
          ))}
        </div>

        {tab === "rules" ? (
          <RulesPanel />
        ) : (
          <>
            <TurnBanner state={state} onEndPhase={() => dispatch({ type: "END_PHASE" })} />

            {state.phase === "setup" && (
              <SetupTray pool={state.setupPool.france} pending={pendingKind} onSelect={setPendingKind} />
            )}

            <div className="rounded-lg border border-[#3a2f1c] bg-[#0f0c07] p-2">
              <HexGrid state={state} onHexClick={handleHexClick} attackableIds={attackableIds} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <UnitInfoPanel state={state} />
              <CombatLog log={state.log} />
            </div>
          </>
        )}
      </div>

      {state.phase === "game-over" && <VictoryModal state={state} onRestart={() => dispatch({ type: "RESET" })} />}
    </div>
  );
}
