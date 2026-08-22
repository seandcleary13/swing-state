import { hexDistance, hexKey, hexNeighbors, type HexCoord } from "./hex";
import { TERRAIN_DEFS } from "./mapData";
import { computeReachable, unitAt } from "./movement";
import { rollCombat } from "./combat";
import { computeRetreat, beginRetreats, MAX_RETREAT_HEXES } from "./retreat";
import { addLog } from "./log";
import { UNIT_TYPES, attackRange, defensePower, isCavalryKind, unitDisplayName } from "./units";
import type { Faction, GameState, Unit } from "./types";

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
      const atk = UNIT_TYPES[live.kind].power;
      const def = defensePower(UNIT_TYPES[e.kind].power, terrainMultiplier(state, e.pos));
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
    const atk = UNIT_TYPES[live.kind].power;
    const def = defensePower(UNIT_TYPES[t.kind].power, terrainMultiplier(state, t.pos));
    const ratio = atk / Math.max(def, 0.5);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestTarget = t;
    }
  }
  // Mandatory attack: any unit with a live target in range must fight, even at bad odds —
  // it just picks its best available odds rather than skipping the fight entirely.
  if (!bestTarget) return state;

  const attackerName = unitDisplayName(aiFaction, live.kind);
  const defenderName = unitDisplayName(playerFaction, bestTarget.kind);
  const atk = UNIT_TYPES[live.kind].power;
  const def = defensePower(UNIT_TYPES[bestTarget.kind].power, terrainMultiplier(state, bestTarget.pos));
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
      const { [live.id]: _drop, ...rest } = next.units;
      next = addLog({ ...next, units: rest }, `${attackerName} attacks ${defenderName} at ${odds} — attacker eliminated (roll ${roll}).`, "combat");
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
        const { [live.id]: _drop, ...rest } = next.units;
        next = addLog({ ...next, units: rest }, `${attackerName} attacks ${defenderName} at ${odds} — no room to retreat, attacker eliminated (roll ${roll}).`, "combat");
      }
    }
  } else if (result === "DE") {
    const { [bestTarget.id]: _drop, ...rest } = next.units;
    next = addLog({ ...next, units: rest }, `${attackerName} attacks ${defenderName} at ${odds} — defender eliminated (roll ${roll})!`, "combat");
  } else if (result === "EX") {
    const { [bestTarget.id]: _drop, ...rest } = next.units;
    next = { ...next, units: rest };
    if (bombarding) {
      next = addLog(next, `${attackerName} bombards ${defenderName} at ${odds} — defender eliminated (roll ${roll}).`, "combat");
    } else {
      const { [live.id]: _d1, ...rest2 } = next.units;
      next = addLog({ ...next, units: rest2 }, `${attackerName} and ${defenderName} clash at ${odds} — both eliminated (roll ${roll}).`, "combat");
    }
  } else if (result === "DR") {
    next = addLog(next, `${attackerName} attacks ${defenderName} at ${odds} — defender falls back (roll ${roll}).`, "combat");
    const pendingAutoAdvance = wasAdjacent ? { attackerId: live.id, hex: vacatedPos } : null;
    next = beginRetreats(next, [bestTarget.id], live.pos);
    if (next.aiTurnState) {
      next = { ...next, aiTurnState: { ...next.aiTurnState, pendingAutoAdvance: next.pendingRetreat ? pendingAutoAdvance : null } };
    }
  }

  return next;
}
