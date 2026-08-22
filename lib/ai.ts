import { hexDistance, hexKey, hexNeighbors, type HexCoord } from "./hex";
import { TERRAIN_DEFS } from "./mapData";
import { computeReachable, unitAt } from "./movement";
import { rollCombat } from "./combat";
import { computeRetreat, beginRetreats, MAX_RETREAT_HEXES } from "./retreat";
import { addLog } from "./log";
import { RESUPPLY_KINDS, UNIT_TYPES, applyCasualty, attackRange, currentPower, defensePower, defenseValue, isCavalryKind, unitDisplayName } from "./units";
import type { CasualtyOutcome } from "./units";
import { canTraceSupply, newUnitId, openHomeHexes, scheduledDrafts } from "./supply";
import type { Faction, GameState, Unit, UnitKind } from "./types";

function casualtyPhrase(outcome: CasualtyOutcome): string {
  return outcome === "eliminated" ? "eliminated" : "reduced to half strength";
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function terrainMultiplier(state: GameState, pos: HexCoord): number {
  const tile = state.map[hexKey(pos)];
  return tile ? TERRAIN_DEFS[tile.terrain].defenseMultiplier : 1;
}

function isOnHill(state: GameState, pos: HexCoord): boolean {
  return state.map[hexKey(pos)]?.terrain === "hill";
}

function recomputeObjectiveControl(state: GameState): GameState {
  const map = { ...state.map };
  for (const tile of Object.values(state.map)) {
    if (!tile.objective) continue;
    const occ = unitAt(state.units, { col: tile.col, row: tile.row });
    if (occ) map[hexKey({ col: tile.col, row: tile.row })] = { ...tile, controlledBy: occ.faction };
  }
  return { ...state, map };
}

// The Coalition defends: it already holds every town, so its priority is retaking any
// town the attacker has captured. Failing that, it garrisons its own towns rather than
// chasing the attacker across the map — a defensive posture, not a rush for open ground.
function nearestTargetDistance(state: GameState, from: HexCoord, aiFaction: Faction): number {
  const playerFaction: Faction = aiFaction === "france" ? "coalition" : "france";
  const lostObjectives = Object.values(state.map).filter((t) => t.objective && t.controlledBy !== aiFaction);
  const ownObjectives = Object.values(state.map).filter((t) => t.objective && t.controlledBy === aiFaction);

  const targets: HexCoord[] =
    lostObjectives.length > 0
      ? lostObjectives.map((t) => ({ col: t.col, row: t.row }))
      : ownObjectives.length > 0
      ? ownObjectives.map((t) => ({ col: t.col, row: t.row }))
      : Object.values(state.units)
          .filter((u) => u.faction === playerFaction)
          .map((u) => u.pos);
  if (!targets.length) return 0;
  return Math.min(...targets.map((t) => hexDistance(from, t)));
}

/**
 * Marches in the Coalition's scheduled draft for this turn, free of the turn's resupply action
 * and at FULL strength. Foot fills the forward home column and guns the rear one; if the home
 * edge is too crowded to take them all, whatever doesn't fit is lost.
 */
export function applyScheduledDrafts(state: GameState): GameState {
  const faction = state.aiFaction;
  const draft = scheduledDrafts(faction, state.turn);
  if (!draft.length) return state;

  const open = openHomeHexes(state, faction);
  if (!open.length) {
    return addLog(state, `Coalition reinforcements arrive but find no room on the line — they are turned away.`, "info");
  }

  // openHomeHexes runs front column first, so foot takes hexes from the front of the list and
  // guns from the back, keeping the same doctrine as the initial deployment.
  let head = 0;
  let tail = open.length - 1;
  const units = { ...state.units };
  const arrived: UnitKind[] = [];

  for (const kind of draft) {
    if (head > tail) break;
    const pos = kind === "artillery" ? open[tail--] : open[head++];
    const id = newUnitId(units, faction);
    units[id] = { id, faction, kind, pos, hasCavalryMoved: false, hasMoved: false, hasAttacked: false, routed: false, reduced: false };
    arrived.push(kind);
  }

  if (!arrived.length) return state;

  const names = arrived.map((k) => unitDisplayName(faction, k)).join(", ");
  const lost = draft.length - arrived.length;
  const text =
    lost > 0
      ? `Coalition reinforcements reach the front at full strength: ${names}. ${lost} more found no room and were turned away.`
      : `Coalition reinforcements reach the front at full strength: ${names}.`;
  return addLog({ ...state, units }, text, "info");
}

/**
 * The Coalition's single resupply action for the turn: bring its most valuable in-supply unit
 * back up to strength if it can, otherwise raise a fresh half-strength formation of whichever
 * arm it is shortest of. Returns `state` unchanged (same `units` reference) when it can do
 * neither, which the caller reads as a no-op.
 */
export function stepResupply(state: GameState): GameState {
  const faction = state.aiFaction;

  const recoverable = Object.values(state.units)
    .filter((u) => u.faction === faction && u.reduced && canTraceSupply(state, u))
    .sort((a, b) => UNIT_TYPES[b.kind].power - UNIT_TYPES[a.kind].power);

  if (recoverable.length) {
    const unit = recoverable[0];
    return addLog(
      { ...state, units: { ...state.units, [unit.id]: { ...unit, reduced: false } } },
      `${unitDisplayName(faction, unit.kind)} draws supply and is back up to full strength.`,
      "info"
    );
  }

  const open = openHomeHexes(state, faction);
  if (!open.length) return state;

  const counts = new Map<UnitKind, number>(RESUPPLY_KINDS.map((k) => [k, 0]));
  for (const u of Object.values(state.units)) {
    if (u.faction === faction && counts.has(u.kind)) counts.set(u.kind, counts.get(u.kind)! + 1);
  }
  const kind = [...counts.entries()].sort((a, b) => a[1] - b[1])[0][0];
  const id = newUnitId(state.units, faction);

  return addLog(
    {
      ...state,
      units: {
        ...state.units,
        [id]: { id, faction, kind, pos: open[0], hasCavalryMoved: false, hasMoved: false, hasAttacked: false, routed: false, reduced: true },
      },
    },
    `A fresh ${unitDisplayName(faction, kind)} formation musters at half strength.`,
    "info"
  );
}

/** AI cavalry, movement-descending — mirrors the order the opening cavalry-move sub-phase resolves in. */
export function buildCavalryQueue(state: GameState): string[] {
  return Object.values(state.units)
    .filter((u) => u.faction === state.aiFaction && isCavalryKind(u.kind))
    .sort((a, b) => UNIT_TYPES[b.kind].movement - UNIT_TYPES[a.kind].movement)
    .map((u) => u.id);
}

/** Every AI unit, movement-descending — mirrors the closing general-move sub-phase. */
export function buildMoveQueue(state: GameState): string[] {
  return Object.values(state.units)
    .filter((u) => u.faction === state.aiFaction)
    .sort((a, b) => UNIT_TYPES[b.kind].movement - UNIT_TYPES[a.kind].movement)
    .map((u) => u.id);
}

/** Every AI unit, native order — mirrors the combat sub-phase's original attack order. */
export function buildCombatQueue(state: GameState): string[] {
  return Object.values(state.units)
    .filter((u) => u.faction === state.aiFaction)
    .map((u) => u.id);
}

/**
 * Advances a single AI unit one hex-move closer to its nearest objective/enemy, if it has
 * a beneficial move available. Returns `state` unchanged (same `units` reference) when the
 * unit has nothing worth doing — the caller uses that to detect a no-op and keep stepping.
 */
export function stepAdvance(
  state: GameState,
  unitId: string,
  moveFlag: "hasCavalryMoved" | "hasMoved",
  skipIfGoodFight: boolean
): GameState {
  const live = state.units[unitId];
  if (!live || live[moveFlag]) return state;
  const aiFaction = state.aiFaction;
  const playerFaction = state.playerFaction;

  if (skipIfGoodFight) {
    const adjEnemies = hexNeighbors(live.pos)
      .map((n) => unitAt(state.units, n))
      .filter((u): u is Unit => !!u && u.faction === playerFaction);
    const goodFight = adjEnemies.some((e) => {
      const atk = currentPower(live);
      const def = defensePower(defenseValue(e), terrainMultiplier(state, e.pos));
      return atk / Math.max(def, 0.5) >= 1;
    });
    if (goodFight) return state; // stay and fight this combat phase
  }

  const reachable = computeReachable(state, live);
  const currentDist = nearestTargetDistance(state, live.pos, aiFaction);
  let best: { hex: HexCoord; dist: number; cost: number } | null = null;
  for (const [key, cost] of Object.entries(reachable)) {
    const [c, r] = key.split(",").map(Number);
    const dist = nearestTargetDistance(state, { col: c, row: r }, aiFaction);
    if (dist < currentDist && (!best || dist < best.dist || (dist === best.dist && cost < best.cost))) {
      best = { hex: { col: c, row: r }, dist, cost };
    }
  }
  if (!best) return state;

  const units = { ...state.units, [unitId]: { ...live, pos: best.hex, [moveFlag]: true } };
  return recomputeObjectiveControl({ ...state, units });
}

/**
 * Resolves a single AI unit's attack, if it has a live target in range. Returns `state`
 * unchanged (same `units` reference) when there's nothing to attack — a no-op the caller
 * uses to keep stepping without pausing. When the result is a Defender Retreat, the
 * defender is player-owned, so the retreat is handed off to the same interactive
 * `beginRetreats` flow the player's own Ar-retreats use, pausing the AI turn.
 */
export function stepCombat(state: GameState, unitId: string): GameState {
  const aiFaction = state.aiFaction;
  const playerFaction = state.playerFaction;
  const live = state.units[unitId];
  if (!live || live.hasAttacked || live.faction !== aiFaction) return state;

  const range = attackRange(live.kind, isOnHill(state, live.pos));
  const targets = Object.values(state.units).filter(
    (u) => u.faction === playerFaction && hexDistance(live.pos, u.pos) <= range
  );
  if (!targets.length) return state;

  let bestTarget: Unit | null = null;
  let bestRatio = -Infinity;
  for (const t of targets) {
    const atk = currentPower(live);
    const def = defensePower(defenseValue(t), terrainMultiplier(state, t.pos));
    const ratio = atk / Math.max(def, 0.5);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestTarget = t;
    }
  }
  // Attacking is optional for both sides, so the Coalition declines fights it doesn't like:
  // it only commits when its best available odds are at least even.
  if (!bestTarget || bestRatio < 1) return state;

  const attackerName = unitDisplayName(aiFaction, live.kind);
  const defenderName = unitDisplayName(playerFaction, bestTarget.kind);
  const atk = currentPower(live);
  const def = defensePower(defenseValue(bestTarget), terrainMultiplier(state, bestTarget.pos));
  const roll = randomInt(1, 6);
  const { odds, result } = rollCombat(atk, def, roll);
  const wasAdjacent = hexDistance(live.pos, bestTarget.pos) === 1;
  const vacatedPos = bestTarget.pos;
  // Bombarding artillery (firing from beyond adjacency) never suffers combat results itself.
  const bombarding = !wasAdjacent;

  let next: GameState = {
    ...state,
    units: { ...state.units, [live.id]: { ...live, hasAttacked: true } },
    lastCombat: { attackers: [live.id], defender: bestTarget.id, odds, roll, result },
  };

  if (result === "NE") {
    next = addLog(next, `${attackerName} attacks ${defenderName} at ${odds} — no effect (roll ${roll}).`, "combat");
  } else if (result === "AE") {
    if (bombarding) {
      next = addLog(next, `${attackerName} bombards ${defenderName} at ${odds} — the barrage goes wide (roll ${roll}).`, "combat");
    } else {
      const r = applyCasualty(next.units, live.id);
      next = addLog({ ...next, units: r.units }, `${attackerName} attacks ${defenderName} at ${odds} — attacker ${casualtyPhrase(r.outcome)} (roll ${roll}).`, "combat");
    }
  } else if (result === "Ar") {
    if (bombarding) {
      next = addLog(next, `${attackerName} bombards ${defenderName} at ${odds} — no effect (roll ${roll}).`, "combat");
    } else {
      const retreat = computeRetreat(next, live.pos, [bestTarget.pos], MAX_RETREAT_HEXES);
      if (retreat) {
        next = addLog(
          { ...next, units: { ...next.units, [live.id]: { ...next.units[live.id], pos: retreat } } },
          `${attackerName} attacks ${defenderName} at ${odds} — attacker falls back (roll ${roll}).`,
          "combat"
        );
      } else {
        const r = applyCasualty(next.units, live.id);
        next = addLog({ ...next, units: r.units }, `${attackerName} attacks ${defenderName} at ${odds} — no room to retreat, attacker ${casualtyPhrase(r.outcome)} (roll ${roll}).`, "combat");
      }
    }
  } else if (result === "DE") {
    const r = applyCasualty(next.units, bestTarget.id);
    next = addLog({ ...next, units: r.units }, `${attackerName} attacks ${defenderName} at ${odds} — defender ${casualtyPhrase(r.outcome)} (roll ${roll})!`, "combat");
  } else if (result === "EX") {
    const defResult = applyCasualty(next.units, bestTarget.id);
    next = { ...next, units: defResult.units };
    if (bombarding) {
      next = addLog(next, `${attackerName} bombards ${defenderName} at ${odds} — defender ${casualtyPhrase(defResult.outcome)} (roll ${roll}).`, "combat");
    } else {
      const atkResult = applyCasualty(next.units, live.id);
      next = addLog(
        { ...next, units: atkResult.units },
        `${attackerName} and ${defenderName} clash at ${odds} — ${defenderName} is ${casualtyPhrase(defResult.outcome)}, and ${attackerName} is ${casualtyPhrase(atkResult.outcome)} (roll ${roll}).`,
        "combat"
      );
    }
  } else if (result === "DR") {
    next = addLog(next, `${attackerName} attacks ${defenderName} at ${odds} — defender falls back (roll ${roll}).`, "combat");
    const pendingAutoAdvance = wasAdjacent ? { attackerId: live.id, hex: vacatedPos } : null;
    next = beginRetreats(next, [bestTarget.id], live.pos);
    if (next.aiTurnState) {
      next = { ...next, aiTurnState: { ...next.aiTurnState, pendingAutoAdvance: next.pendingRetreat ? pendingAutoAdvance : null } };
    }
  }

  // Whenever the ground the defender held ends up empty — it fell back, or it was destroyed —
  // a surviving adjacent attacker takes it. A retreat the player is still choosing waits for
  // `pendingAutoAdvance` to be applied once they finish.
  if (!next.pendingRetreat && wasAdjacent && next.units[live.id]) {
    const vacatedKey = hexKey(vacatedPos);
    const occupied = Object.values(next.units).some((u) => hexKey(u.pos) === vacatedKey);
    if (!occupied) {
      next = recomputeObjectiveControl({
        ...next,
        units: { ...next.units, [live.id]: { ...next.units[live.id], pos: vacatedPos } },
      });
    }
  }

  return next;
}
