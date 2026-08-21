import type { Faction, HexTile, TerrainDef, TerrainType } from "./types";
import { hexKey } from "./hex";

export const COLS = 13;
export const ROWS = 14;

export const TERRAIN_DEFS: Record<TerrainType, TerrainDef> = {
  clear: { moveCost: 1, defenseMultiplier: 1, label: "Open Field" },
  forest: { moveCost: 2, defenseMultiplier: 2, label: "Forest" },
  hill: { moveCost: 2, defenseMultiplier: 2, label: "Hill" },
  town: { moveCost: 1, defenseMultiplier: 2, label: "Village" },
  marsh: { moveCost: 3, defenseMultiplier: 1.5, label: "Marsh" },
};

interface TownDef {
  col: number;
  row: number;
  name: string;
}

export const TOWNS: TownDef[] = [
  { col: 2, row: 3, name: "Rocheval" },
  { col: 6, row: 2, name: "Saint-Aubry" },
  { col: 6, row: 7, name: "Hauteclaire" },
  { col: 9, row: 10, name: "Marbecourt" },
  { col: 4, row: 11, name: "Vieuxpont" },
];

const HILL_HEXES: Array<[number, number]> = [
  [8, 0], [8, 1], [8, 2], [7, 4], [7, 5],
  [4, 7], [4, 8], [4, 9], [3, 11], [3, 12],
  [9, 4], [9, 5], [10, 5], [1, 9], [1, 10], [10, 8], [10, 9],
];

const MARSH_HEXES: Array<[number, number]> = [[4, 6], [3, 9]];

const ROAD_ROWS = [2, 7];

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildMap(): Record<string, HexTile> {
  const rng = mulberry32(1815);
  const hillSet = new Set(HILL_HEXES.map(([c, r]) => `${c},${r}`));
  const marshSet = new Set(MARSH_HEXES.map(([c, r]) => `${c},${r}`));
  const townMap = new Map(TOWNS.map((t) => [`${t.col},${t.row}`, t]));

  const map: Record<string, HexTile> = {};

  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const key = `${col},${row}`;
      const isDeployFrance = col <= 1;
      const isDeployCoalition = col >= COLS - 2;
      const onRoad = ROAD_ROWS.includes(row);

      let terrain: TerrainType = "clear";
      let objective = false;
      let objectiveName: string | undefined;
      let controlledBy: Faction | undefined;

      const town = townMap.get(key);
      if (town) {
        terrain = "town";
        objective = true;
        objectiveName = town.name;
      } else if (hillSet.has(key)) {
        terrain = "hill";
      } else if (marshSet.has(key)) {
        terrain = "marsh";
      } else if (!isDeployFrance && !isDeployCoalition && rng() < 0.2) {
        terrain = "forest";
      }

      const tile: HexTile = {
        col,
        row,
        terrain,
        road: onRoad && terrain !== "marsh",
        objective,
        objectiveName,
        controlledBy,
        deploymentFor: isDeployFrance ? "france" : isDeployCoalition ? "coalition" : undefined,
      };
      map[hexKey({ col, row })] = tile;
    }
  }

  return map;
}
