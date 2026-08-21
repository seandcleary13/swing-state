// Flat-top hex grid, "odd-q" vertical offset layout (columns offset down on odd columns).
// Matches the classic hex-and-counter wargame look: columns run west->east, rows north->south.

export interface HexCoord {
  col: number;
  row: number;
}

export function hexKey(h: HexCoord): string {
  return `${h.col},${h.row}`;
}

export function hexEquals(a: HexCoord, b: HexCoord): boolean {
  return a.col === b.col && a.row === b.row;
}

interface Cube {
  x: number;
  y: number;
  z: number;
}

function offsetToCube(h: HexCoord): Cube {
  const x = h.col;
  const z = h.row - (h.col - (h.col & 1)) / 2;
  const y = -x - z;
  return { x, y, z };
}

function cubeToOffset(c: Cube): HexCoord {
  const col = c.x;
  const row = c.z + (c.x - (c.x & 1)) / 2;
  return { col, row };
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  const ac = offsetToCube(a);
  const bc = offsetToCube(b);
  return Math.max(
    Math.abs(ac.x - bc.x),
    Math.abs(ac.y - bc.y),
    Math.abs(ac.z - bc.z)
  );
}

const EVEN_COL_DIRS = [
  [1, 0], [1, -1], [0, -1],
  [-1, -1], [-1, 0], [0, 1],
];
const ODD_COL_DIRS = [
  [1, 1], [1, 0], [0, -1],
  [-1, 0], [-1, 1], [0, 1],
];

export function hexNeighbors(h: HexCoord): HexCoord[] {
  const dirs = h.col & 1 ? ODD_COL_DIRS : EVEN_COL_DIRS;
  return dirs.map(([dc, dr]) => ({ col: h.col + dc, row: h.row + dr }));
}

export function hexLerpCube(a: HexCoord, b: HexCoord, t: number): HexCoord {
  const ac = offsetToCube(a);
  const bc = offsetToCube(b);
  const x = ac.x + (bc.x - ac.x) * t;
  const y = ac.y + (bc.y - ac.y) * t;
  const z = ac.z + (bc.z - ac.z) * t;
  // cube round
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return cubeToOffset({ x: rx, y: ry, z: rz });
}

export const HEX_SIZE = 34;

export function hexCenter(h: HexCoord): { x: number; y: number } {
  const x = HEX_SIZE * 1.5 * h.col;
  const y = HEX_SIZE * Math.sqrt(3) * (h.row + 0.5 * (h.col & 1));
  return { x: x + HEX_SIZE * 1.6, y: y + HEX_SIZE * 1.4 };
}

export function hexCorners(cx: number, cy: number, size = HEX_SIZE): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    pts.push(`${(cx + size * Math.cos(angle)).toFixed(2)},${(cy + size * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(" ");
}
