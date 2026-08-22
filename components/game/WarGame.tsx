"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { gameReducer, getObligatedAttackerIds, initGameState } from "@/lib/gameEngine";
import { hexDistance, hexKey, type HexCoord } from "@/lib/hex";
import { unitAt } from "@/lib/movement";
import { attackRange, isCavalryKind } from "@/lib/units";
import type { UnitKind } from "@/lib/types";
import HexGrid from "./HexGrid";
import TurnBanner from "./TurnBanner";
import SetupTray from "./SetupTray";
import UnitInfoPanel from "./UnitInfoPanel";
import CombatLog from "./CombatLog";
import CombatPreview from "./CombatPreview";
import RetreatPrompt from "./RetreatPrompt";
import AdvancePrompt from "./AdvancePrompt";
import VictoryModal from "./VictoryModal";
import RulesPanel from "./RulesPanel";
import { cn } from "@/lib/utils";

const AI_STEP_DELAY_MS = 600;

export default function WarGame() {
  const [state, dispatch] = useReducer(gameReducer, undefined, initGameState);
  const [pendingKind, setPendingKind] = useState<UnitKind | null>(null);
  const [tab, setTab] = useState<"battle" | "rules">("battle");

  const isOnHill = (pos: HexCoord) => state.map[hexKey(pos)]?.terrain === "hill";

  // Enemies that at least one un-attacked player unit could target (for the red "can be attacked" ring).
  const targetableEnemyIds = useMemo(() => {
    const set = new Set<string>();
    if (state.phase !== "player-combat") return set;
    const mine = Object.values(state.units).filter(
      (u) => u.faction === state.playerFaction && !u.hasAttacked && !u.routed
    );
    for (const e of Object.values(state.units)) {
      if (e.faction !== state.aiFaction) continue;
      if (mine.some((m) => hexDistance(m.pos, e.pos) <= attackRange(m.kind, isOnHill(m.pos)))) set.add(e.id);
    }
    return set;
  }, [state]);

  // Player units in range of the currently-targeted enemy, available to add to the attack.
  const eligibleAttackerIds = useMemo(() => {
    const set = new Set<string>();
    if (state.phase !== "player-combat" || !state.combatTargetId) return set;
    const target = state.units[state.combatTargetId];
    if (!target) return set;
    for (const u of Object.values(state.units)) {
      if (u.faction !== state.playerFaction || u.hasAttacked || u.routed) continue;
      if (hexDistance(u.pos, target.pos) <= attackRange(u.kind, isOnHill(u.pos))) set.add(u.id);
    }
    return set;
  }, [state]);

  // Units with a live enemy in range that haven't attacked yet — must fight before the phase can end.
  const obligatedAttackerIds = useMemo(() => getObligatedAttackerIds(state), [state]);

  // Steps the Coalition's turn forward on a timer, pausing whenever an interactive retreat
  // choice is handed to the player mid-turn.
  useEffect(() => {
    if (state.phase !== "ai-turn" || state.pendingRetreat) return;
    const t = setTimeout(() => dispatch({ type: "ADVANCE_AI_STEP" }), AI_STEP_DELAY_MS);
    return () => clearTimeout(t);
  }, [state]);

  function handleHexClick(hex: HexCoord) {
    const key = hexKey(hex);
    const tile = state.map[key];
    const occ = unitAt(state.units, hex);

    if (state.pendingRetreat) {
      if (key in state.retreatOptions) dispatch({ type: "CHOOSE_RETREAT_HEX", hex });
      return;
    }

    if (state.pendingAdvance) return;

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
      if (occ && occ.faction === state.aiFaction) {
        dispatch({ type: "SELECT_ATTACK_TARGET", targetId: occ.id });
      } else if (occ && occ.faction === state.playerFaction) {
        dispatch({ type: "SELECT_UNIT", unitId: occ.id });
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
            <TurnBanner
              state={state}
              onEndPhase={() => dispatch({ type: "END_PHASE" })}
              onSkip={() => dispatch({ type: "SKIP_AI_TURN" })}
            />

            {state.phase === "setup" && (
              <SetupTray pool={state.setupPool.france} pending={pendingKind} onSelect={setPendingKind} />
            )}

            {state.pendingRetreat ? (
              <RetreatPrompt state={state} onStop={() => dispatch({ type: "STOP_RETREAT" })} />
            ) : state.pendingAdvance ? (
              <AdvancePrompt
                state={state}
                onConfirm={() => dispatch({ type: "CONFIRM_ADVANCE" })}
                onDecline={() => dispatch({ type: "DECLINE_ADVANCE" })}
              />
            ) : state.phase === "player-combat" ? (
              <CombatPreview
                state={state}
                onConfirm={() => dispatch({ type: "CONFIRM_ATTACK" })}
                onClear={() => dispatch({ type: "CLEAR_ATTACK" })}
              />
            ) : null}

            <div className="rounded-lg border border-[#3a2f1c] bg-[#0f0c07] p-2">
              <HexGrid
                state={state}
                onHexClick={handleHexClick}
                attackableIds={targetableEnemyIds}
                eligibleAttackerIds={eligibleAttackerIds}
                obligatedAttackerIds={obligatedAttackerIds}
              />
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
