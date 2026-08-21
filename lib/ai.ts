import { hexDistance, hexKey, hexNeighbors, type HexCoord } from "./hex";
import { TERRAIN_DEFS } from "./mapData";
import { computeReachable, unitAt } from "./movement";
import { rollCombat } from "./combat";
import { computeRetreat } from "./retreat";
import { UNIT_TYPES, attackRange, defensePower, isCavalryKind, unitDisplayName } from "./units";
import type { CombatLogEntry, Faction, GameState, Unit } from "./types";

const RETREAT_HEXES = 2;

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
 * Advances every eligible AI unit one hex-move closer to its nearest objective/enemy.
 * `moveFlag` selects which per-unit flag records that the move was spent (cavalry get
 * two independent move flags per turn: one for the opening cavalry phase, one for the
 * closing general movement phase all unit types share).
 */
function advanceUnits(
  working: GameState,
  aiFaction: Faction,
  playerFaction: Faction,
  eligible: (u: Unit) => boolean,
  moveFlag: "hasCavalryMoved" | "hasMoved",
  skipIfGoodFight: boolean
): GameState {
  const units = Object.values(working.units)
    .filter((u) => u.faction === aiFaction && eligible(u))
    .sort((a, b) => UNIT_TYPES[b.kind].movement - UNIT_TYPES[a.kind].movement);

  for (const unit of units) {
    const live = working.units[unit.id];
    if (!live) continue;

    if (skipIfGoodFight) {
      const adjEnemies = hexNeighbors(live.pos)
        .map((n) => unitAt(working.units, n))
        .filter((u): u is Unit => !!u && u.faction === playerFaction);
      const goodFight = adjEnemies.some((e) => {
        const atk = UNIT_TYPES[live.kind].power;
        const def = defensePower(UNIT_TYPES[e.kind].power, terrainMultiplier(working, e.pos));
        return atk / Math.max(def, 0.5) >= 1;
      });
      if (goodFight) continue; // stay and fight this combat phase
    }

    const reachable = computeReachable(working, live);
    const currentDist = nearestTargetDistance(working, live.pos, aiFaction);
    let best: { hex: HexCoord; dist: number; cost: number } | null = null;
    for (const [key, cost] of Object.entries(reachable)) {
      const [c, r] = key.split(",").map(Number);
      const dist = nearestTargetDistance(working, { col: c, row: r }, aiFaction);
      if (dist < currentDist && (!best || dist < best.dist || (dist === best.dist && cost < best.cost))) {
        best = { hex: { col: c, row: r }, dist, cost };
      }
    }
    if (best) {
      working.units[unit.id] = { ...live, pos: best.hex, [moveFlag]: true };
    }
  }
  return working;
}

export function runAiTurn(state: GameState): GameState {
  const aiFaction = state.aiFaction;
  const playerFaction = state.playerFaction;
  const units: Record<string, Unit> = {};
  for (const [id, u] of Object.entries(state.units)) {
    const isAi = u.faction === aiFaction;
    units[id] = {
      ...u,
      hasCavalryMoved: isAi ? false : u.hasCavalryMoved,
      hasMoved: isAi ? false : u.hasMoved,
      hasAttacked: isAi ? false : u.hasAttacked,
      routed: isAi ? false : u.routed,
    };
  }
  const map = Object.fromEntries(Object.entries(state.map).map(([k, v]) => [k, { ...v }]));
  const log: CombatLogEntry[] = [...state.log];
  let working: GameState = { ...state, units, map, log };

  const addLog = (text: string, kind: CombatLogEntry["kind"] = "info") => {
    working = { ...working, log: [{ id: `${Date.now()}-${Math.random()}`, turn: working.turn, text, kind }, ...working.log].slice(0, 40) };
  };

  // --- Phase 1: cavalry advances alone ---
  working = advanceUnits(working, aiFaction, playerFaction, (u) => isCavalryKind(u.kind), "hasCavalryMoved", true);

  // --- Phase 2: everyone attacks ---
  for (const unit of Object.values(working.units).filter((u) => u.faction === aiFaction)) {
    const live = working.units[unit.id];
    if (!live || live.hasAttacked) continue;
    const range = attackRange(live.kind, isOnHill(working, live.pos));
    const targets = Object.values(working.units).filter(
      (u) => u.faction === playerFaction && hexDistance(live.pos, u.pos) <= range
    );
    if (!targets.length) continue;

    let bestTarget: Unit | null = null;
    let bestRatio = -Infinity;
    for (const t of targets) {
      const atk = UNIT_TYPES[live.kind].power;
      const def = defensePower(UNIT_TYPES[t.kind].power, terrainMultiplier(working, t.pos));
      const ratio = atk / Math.max(def, 0.5);
      if (ratio > bestRatio) {
        bestRatio = ratio;
        bestTarget = t;
      }
    }
    // Mandatory attack: any unit with a live target in range must fight, even at bad odds —
    // it just picks its best available odds rather than skipping the fight entirely.
    if (!bestTarget) continue;

    const attackerName = unitDisplayName(aiFaction, live.kind);
    const defenderName = unitDisplayName(playerFaction, bestTarget.kind);
    const atk = UNIT_TYPES[live.kind].power;
    const def = defensePower(UNIT_TYPES[bestTarget.kind].power, terrainMultiplier(working, bestTarget.pos));
    const roll = randomInt(1, 6);
    const { odds, result } = rollCombat(atk, def, roll);
    working = { ...working, lastCombat: { attackers: [live.id], defender: bestTarget.id, odds, roll, result } };
    const wasAdjacent = hexDistance(live.pos, bestTarget.pos) === 1;
    const vacatedPos = bestTarget.pos;
    // Bombarding artillery (firing from beyond adjacency) never suffers combat results itself.
    const bombarding = !wasAdjacent;

    if (result === "NE") {
      addLog(`${attackerName} attacks ${defenderName} at ${odds} — no effect (roll ${roll}).`, "combat");
    } else if (result === "AE") {
      if (bombarding) {
        addLog(`${attackerName} bombards ${defenderName} at ${odds} — the barrage goes wide (roll ${roll}).`, "combat");
      } else {
        const { [live.id]: _drop, ...rest } = working.units;
        working = { ...working, units: rest };
        addLog(`${attackerName} attacks ${defenderName} at ${odds} — attacker eliminated (roll ${roll}).`, "combat");
        continue;
      }
    } else if (result === "Ar") {
      if (bombarding) {
        addLog(`${attackerName} bombards ${defenderName} at ${odds} — no effect (roll ${roll}).`, "combat");
      } else {
        const retreat = computeRetreat(working, live.pos, [bestTarget.pos], RETREAT_HEXES);
        if (retreat) {
          working.units[live.id] = { ...live, pos: retreat };
          addLog(`${attackerName} attacks ${defenderName} at ${odds} — attacker falls back (roll ${roll}).`, "combat");
        } else {
          const { [live.id]: _drop, ...rest } = working.units;
          working = { ...working, units: rest };
          addLog(`${attackerName} attacks ${defenderName} at ${odds} — no room to retreat, attacker eliminated (roll ${roll}).`, "combat");
          continue;
        }
      }
    } else if (result === "DE") {
      const { [bestTarget.id]: _drop, ...rest } = working.units;
      working = { ...working, units: rest };
      addLog(`${attackerName} attacks ${defenderName} at ${odds} — defender eliminated (roll ${roll}).`, "combat");
    } else if (result === "EX") {
      const { [bestTarget.id]: _drop, ...rest } = working.units;
      working = { ...working, units: rest };
      if (bombarding) {
        addLog(`${attackerName} bombards ${defenderName} at ${odds} — defender eliminated (roll ${roll}).`, "combat");
      } else {
        const { [live.id]: _d1, ...rest2 } = working.units;
        working = { ...working, units: rest2 };
        addLog(`${attackerName} and ${defenderName} clash at ${odds} — both eliminated (roll ${roll}).`, "combat");
        continue;
      }
    } else if (result === "DR") {
      const retreat = computeRetreat(working, bestTarget.pos, [live.pos], RETREAT_HEXES);
      if (retreat) {
        working.units[bestTarget.id] = { ...bestTarget, pos: retreat, routed: true };
        addLog(`${attackerName} attacks ${defenderName} at ${odds} — defender retreats (roll ${roll}).`, "combat");
        if (wasAdjacent) working.units[live.id] = { ...working.units[live.id], pos: vacatedPos };
      } else {
        const { [bestTarget.id]: _drop, ...rest } = working.units;
        working = { ...working, units: rest };
        addLog(`${attackerName} attacks ${defenderName} at ${odds} — no retreat possible, defender eliminated (roll ${roll}).`, "combat");
      }
    }
    working.units[live.id] = { ...working.units[live.id], hasAttacked: true };
  }

  // --- Phase 3: everyone (cavalry included, a second time) repositions ---
  working = advanceUnits(working, aiFaction, playerFaction, () => true, "hasMoved", false);

  // --- Update objective control ---
  const map2 = { ...working.map };
  for (const tile of Object.values(map2)) {
    if (!tile.objective) continue;
    const occ = unitAt(working.units, { col: tile.col, row: tile.row });
    if (occ) map2[hexKey({ col: tile.col, row: tile.row })] = { ...tile, controlledBy: occ.faction };
  }
  working = { ...working, map: map2 };

  return working;
}
