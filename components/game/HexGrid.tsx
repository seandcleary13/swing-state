"use client";

import { hexCenter, hexCorners, hexKey, hexNeighbors, type HexCoord } from "@/lib/hex";
import { COLS, ROWS, TERRAIN_DEFS } from "@/lib/mapData";
import { UNIT_TYPES } from "@/lib/units";
import type { Faction, GameState, Unit } from "@/lib/types";
import { cn } from "@/lib/utils";

const TERRAIN_FILL: Record<string, string> = {
  clear: "#a9bd77",
  forest: "#3f5a30",
  hill: "#9c8253",
  town: "#c7a24a",
  marsh: "#5f7259",
};

const FACTION_COLOR: Record<Faction, { fill: string; ring: string; text: string }> = {
  france: { fill: "#1f3f73", ring: "#6ea3e8", text: "#dce8fb" },
  coalition: { fill: "#5c1417", ring: "#d5595c", text: "#fbe0e0" },
};

interface Props {
  state: GameState;
  onHexClick: (hex: HexCoord) => void;
  attackableIds: Set<string>;
}

export default function HexGrid({ state, onHexClick, attackableIds }: Props) {
  const { map, units, selectedUnitId, reachable, phase, playerFaction } = state;
  const width = COLS * 51 + 60;
  const height = ROWS * 59 + 90;

  const unitByHex = new Map<string, Unit>();
  for (const u of Object.values(units)) unitByHex.set(hexKey(u.pos), u);

  const roadSegments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const tile of Object.values(map)) {
    if (!tile.road) continue;
    const here: HexCoord = { col: tile.col, row: tile.row };
    for (const n of hexNeighbors(here)) {
      if (n.col < here.col || (n.col === here.col && n.row < here.row)) continue;
      const nTile = map[hexKey(n)];
      if (nTile?.road) {
        const a = hexCenter(here);
        const b = hexCenter(n);
        roadSegments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      }
    }
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none" style={{ maxHeight: "72vh" }}>
      {roadSegments.map((s, i) => (
        <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#6b4a26" strokeWidth={4} strokeDasharray="1 7" strokeLinecap="round" opacity={0.75} />
      ))}

      {Object.values(map).map((tile) => {
        const hex: HexCoord = { col: tile.col, row: tile.row };
        const key = hexKey(hex);
        const { x, y } = hexCenter(hex);
        const points = hexCorners(x, y);
        const isReachable = key in reachable;
        const unit = unitByHex.get(key);
        const deployHighlight = phase === "setup" && tile.deploymentFor === "france" && !unit;

        return (
          <g key={key} data-hex={key} data-deploy={tile.deploymentFor ?? ""} onClick={() => onHexClick(hex)} className="cursor-pointer">
            <polygon
              points={points}
              fill={TERRAIN_FILL[tile.terrain]}
              stroke="#1a1608"
              strokeWidth={1.2}
              opacity={tile.deploymentFor ? 0.95 : 1}
            />
            {tile.deploymentFor && (
              <polygon
                points={points}
                fill={tile.deploymentFor === "france" ? FACTION_COLOR.france.fill : FACTION_COLOR.coalition.fill}
                opacity={0.16}
              />
            )}
            {deployHighlight && <polygon points={points} fill="#f4d35e" opacity={0.28} />}
            {isReachable && <polygon points={points} fill="#f4d35e" opacity={0.35} stroke="#f4d35e" strokeWidth={1.5} />}
            {tile.terrain === "forest" && (
              <text x={x} y={y + 4} textAnchor="middle" fontSize={14} opacity={0.8}>
                🌲
              </text>
            )}
            {tile.terrain === "hill" && (
              <polygon points={`${x - 9},${y + 6} ${x},${y - 8} ${x + 9},${y + 6}`} fill="#6e5638" opacity={0.6} />
            )}
            {tile.objective && (
              <>
                <rect x={x - 7} y={y - 6} width={14} height={11} fill="#3a2f1c" opacity={0.85} rx={1} />
                <text x={x} y={y - 10} textAnchor="middle" fontSize={9} fill="#3a2f1c" fontWeight={700}>
                  ★
                </text>
              </>
            )}
            {tile.controlledBy && (
              <circle cx={x + 15} cy={y - 16} r={5} fill={FACTION_COLOR[tile.controlledBy].fill} stroke="#1a1608" strokeWidth={1} />
            )}
          </g>
        );
      })}

      {Object.values(map)
        .filter((t) => t.objective)
        .map((t) => {
          const { x, y } = hexCenter({ col: t.col, row: t.row });
          return (
            <text key={`label-${t.col}-${t.row}`} x={x} y={y + 22} textAnchor="middle" fontSize={9} fill="#2a2013" fontWeight={700} style={{ paintOrder: "stroke", stroke: "#ece2c8", strokeWidth: 2 }}>
              {t.objectiveName}
            </text>
          );
        })}

      {Object.values(units).map((unit) => {
        const { x, y } = hexCenter(unit.pos);
        const colors = FACTION_COLOR[unit.faction];
        const def = UNIT_TYPES[unit.kind];
        const isSelected = selectedUnitId === unit.id;
        const isAttackable = attackableIds.has(unit.id);
        const isPlayer = unit.faction === playerFaction;
        const dimmed =
          (phase === "player-cavalry-move" && isPlayer && (unit.kind !== "cavalry" || unit.hasCavalryMoved)) ||
          (phase === "player-combat" && isPlayer && unit.hasAttacked) ||
          (phase === "player-move" && isPlayer && unit.hasMoved);

        return (
          <g key={unit.id} data-unit={unit.id} data-hex={hexKey(unit.pos)} onClick={(e) => { e.stopPropagation(); onHexClick(unit.pos); }} className="cursor-pointer">
            <rect
              x={x - 19}
              y={y - 17}
              width={38}
              height={34}
              rx={4}
              fill={colors.fill}
              stroke={isSelected ? "#f4d35e" : isAttackable ? "#ff6b6b" : "#1a1608"}
              strokeWidth={isSelected || isAttackable ? 3 : 1.4}
              opacity={dimmed ? 0.55 : 1}
              strokeDasharray={unit.routed ? "3 2" : undefined}
            />
            <text x={x} y={y - 4} textAnchor="middle" fontSize={13} fontWeight={800} fill={colors.text}>
              {def.symbol}
            </text>
            <text x={x} y={y + 11} textAnchor="middle" fontSize={10.5} fontWeight={600} fill={colors.text} opacity={0.95}>
              {def.power}-{def.movement}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
