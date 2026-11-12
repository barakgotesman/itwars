/**
 * Walking navigation over the map: a 0.5 m grid of cells a standing player can occupy, breadth-first
 * reachability (used by `verify:map`) and A* path finding with line-of-walkability smoothing (used by bots).
 * Built from the STATIC solids only, so doorways are always walkable and a bot opens the door itself.
 * Pure data and math: no Node or DOM, no randomness.
 */
import { PLAYER_HEIGHT, PLAYER_RADIUS } from '@shared/core/constants';
import type { Aabb } from '@shared/core/physics';

/** Cell edge in metres. */
export const NAV_CELL = 0.5;
/** World x of the grid's west edge. */
export const NAV_X0 = -50;
/** World z of the grid's north edge. */
export const NAV_Z0 = -35;
/** Grid width in cells (100 m). */
export const NAV_NX = Math.round(100 / NAV_CELL);
/** Grid height in cells (70 m). */
export const NAV_NZ = Math.round(70 / NAV_CELL);

/** A point on the floor plan. */
export interface Pt {
  x: number;
  z: number;
}

/** Walkability of every cell, plus a cost penalty that keeps paths off walls and furniture corners. */
export interface NavGrid {
  /** 1 where a standing player centred on the cell overlaps no solid. */
  readonly walkable: Uint8Array;
  /** Extra cost (0 or `EDGE_PENALTY`) for walkable cells that touch a blocked one. */
  readonly edge: Uint8Array;
}

/** Added to the step cost of cells next to an obstacle, where bots would otherwise snag. */
const EDGE_PENALTY = 2;
/** Default cap on A* expansions, so one search is bounded (about a millisecond). */
export const NAV_MAX_EXPAND = 6000;
/** Greedy weight on the A* heuristic: slightly longer paths, far fewer nodes expanded (fine for bots). */
const HEURISTIC_WEIGHT = 1.5;

/** World x of the centre of column `i`. */
export const cellX = (i: number): number => NAV_X0 + (i + 0.5) * NAV_CELL;
/** World z of the centre of row `j`. */
export const cellZ = (j: number): number => NAV_Z0 + (j + 0.5) * NAV_CELL;
/** Flat index of column `i`, row `j`. */
export const cellIdx = (i: number, j: number): number => j * NAV_NX + i;

/**
 * Flat index of the cell containing a world point.
 * @returns The index, or -1 when the point is outside the grid.
 */
export function cellAt(x: number, z: number): number {
  const i = Math.floor((x - NAV_X0) / NAV_CELL);
  const j = Math.floor((z - NAV_Z0) / NAV_CELL);
  return i < 0 || j < 0 || i >= NAV_NX || j >= NAV_NZ ? -1 : cellIdx(i, j);
}

/** True if a standing player centred at x/z (feet on the floor) overlaps no solid. */
export function standingFree(solids: readonly Aabb[], x: number, z: number): boolean {
  for (const b of solids) {
    if (
      x + PLAYER_RADIUS > b.minX && x - PLAYER_RADIUS < b.maxX &&
      z + PLAYER_RADIUS > b.minZ && z - PLAYER_RADIUS < b.maxZ &&
      PLAYER_HEIGHT > b.minY && 0 < b.maxY
    ) return false;
  }
  return true;
}

/** One grid per solids array: every room on the same map shares it. */
const cache = new WeakMap<readonly Aabb[], NavGrid>();

/**
 * Builds (or fetches the cached) navigation grid for a set of static solids.
 * @param solids - Static collision boxes; pass the list BEFORE door panels are appended.
 */
export function buildNavGrid(solids: readonly Aabb[]): NavGrid {
  const hit = cache.get(solids);
  if (hit) return hit;
  const walkable = new Uint8Array(NAV_NX * NAV_NZ);
  for (let j = 0; j < NAV_NZ; j++) for (let i = 0; i < NAV_NX; i++) walkable[cellIdx(i, j)] = standingFree(solids, cellX(i), cellZ(j)) ? 1 : 0;
  const edge = new Uint8Array(NAV_NX * NAV_NZ);
  for (let j = 0; j < NAV_NZ; j++) {
    for (let i = 0; i < NAV_NX; i++) {
      if (!walkable[cellIdx(i, j)]) continue;
      for (let dj = -1; dj <= 1 && !edge[cellIdx(i, j)]; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= NAV_NX || nj >= NAV_NZ || !walkable[cellIdx(ni, nj)]) { edge[cellIdx(i, j)] = EDGE_PENALTY; break; }
        }
      }
    }
  }
  const grid = { walkable, edge };
  cache.set(solids, grid);
  return grid;
}

/** Orthogonal neighbour offsets, then diagonals (the diagonals need both side cells free). */
const DI = [1, -1, 0, 0, 1, 1, -1, -1] as const;
const DJ = [0, 0, 1, -1, 1, -1, 1, -1] as const;

/**
 * Breadth-first flood fill over walkable cells (4-neighbour).
 * @param from - Flat index of the start cell.
 * @returns 1 for every cell reachable from the start.
 */
export function reachable(grid: NavGrid, from: number): Uint8Array {
  const seen = new Uint8Array(NAV_NX * NAV_NZ);
  if (from < 0 || !grid.walkable[from]) return seen;
  const queue = [from];
  seen[from] = 1;
  for (let q = 0; q < queue.length; q++) {
    const cur = queue[q]!;
    const i = cur % NAV_NX;
    const j = Math.floor(cur / NAV_NX);
    for (let k = 0; k < 4; k++) {
      const ni = i + DI[k]!, nj = j + DJ[k]!;
      if (ni < 0 || nj < 0 || ni >= NAV_NX || nj >= NAV_NZ) continue;
      const n = cellIdx(ni, nj);
      if (seen[n] || !grid.walkable[n]) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return seen;
}

/**
 * Finds the walkable cell centre nearest to a point, searching outward in rings.
 * @param maxRing - How many cells out to look.
 * @returns The point, or null if nothing walkable is that close.
 */
export function nearestWalkable(grid: NavGrid, x: number, z: number, maxRing = 12): Pt | null {
  const c = cellAt(x, z);
  if (c >= 0 && grid.walkable[c]) return { x, z };
  const ci = Math.min(NAV_NX - 1, Math.max(0, Math.floor((x - NAV_X0) / NAV_CELL)));
  const cj = Math.min(NAV_NZ - 1, Math.max(0, Math.floor((z - NAV_Z0) / NAV_CELL)));
  for (let r = 1; r <= maxRing; r++) {
    let best: Pt | null = null;
    let bestD = Infinity;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= NAV_NX || j >= NAV_NZ || !grid.walkable[cellIdx(i, j)]) continue;
        const d = Math.hypot(cellX(i) - x, cellZ(j) - z);
        if (d < bestD) { bestD = d; best = { x: cellX(i), z: cellZ(j) }; }
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * True if a straight walk between two points stays on walkable cells (sampled every 0.2 m).
 * @param clear - Also refuse cells next to an obstacle (except near the two ends). A cell is only known to be free
 * at its centre, so a leg through such cells can clip a corner by up to a quarter cell; smoothing and corner
 * cutting ask for clearance, plain reachability checks do not.
 */
export function lineWalkable(grid: NavGrid, ax: number, az: number, bx: number, bz: number, clear = false): boolean {
  const dist = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(dist / 0.2));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const c = cellAt(ax + (bx - ax) * t, az + (bz - az) * t);
    if (c < 0 || !grid.walkable[c]) return false;
    if (clear && grid.edge[c] && s * 0.2 > END_SLACK && dist - s * 0.2 > END_SLACK) return false;
  }
  return true;
}

/** Distance (m) from either end of a leg where `lineWalkable` with clearance tolerates cells beside obstacles. */
const END_SLACK = 0.6;

// Scratch space reused by every search; generation stamps avoid clearing 28k entries per call.
const SIZE = NAV_NX * NAV_NZ;
const gScore = new Float32Array(SIZE);
const cameFrom = new Int32Array(SIZE);
const stamp = new Uint32Array(SIZE);
const closed = new Uint32Array(SIZE);
let generation = 0;
const heapNode: number[] = [];
const heapKey: number[] = [];

/** Pushes a node on the binary min-heap. */
function heapPush(node: number, key: number): void {
  let i = heapNode.length;
  heapNode.push(node);
  heapKey.push(key);
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heapKey[p]! <= key) break;
    heapNode[i] = heapNode[p]!;
    heapKey[i] = heapKey[p]!;
    i = p;
  }
  heapNode[i] = node;
  heapKey[i] = key;
}

/** Pops the lowest-key node from the heap. */
function heapPop(): number {
  const top = heapNode[0]!;
  const lastNode = heapNode.pop()!;
  const lastKey = heapKey.pop()!;
  const n = heapNode.length;
  if (n > 0) {
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= n) break;
      if (c + 1 < n && heapKey[c + 1]! < heapKey[c]!) c++;
      if (heapKey[c]! >= lastKey) break;
      heapNode[i] = heapNode[c]!;
      heapKey[i] = heapKey[c]!;
      i = c;
    }
    heapNode[i] = lastNode;
    heapKey[i] = lastKey;
  }
  return top;
}

/** Octile distance between two cells, in cells. */
function octile(a: number, b: number): number {
  const dx = Math.abs((a % NAV_NX) - (b % NAV_NX));
  const dz = Math.abs(Math.floor(a / NAV_NX) - Math.floor(b / NAV_NX));
  return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
}

/**
 * A* over the grid from one point to another, then smoothed into a few straight legs.
 * @param maxExpand - Node cap; when hit, the path leads to the closest cell found, so the cost stays bounded.
 * @returns Waypoints from (not including) the start to the goal, or null if either end cannot be placed on the grid.
 */
export function findPath(grid: NavGrid, fx: number, fz: number, tx: number, tz: number, maxExpand = NAV_MAX_EXPAND): Pt[] | null {
  const from = nearestWalkable(grid, fx, fz);
  const to = nearestWalkable(grid, tx, tz);
  if (!from || !to) return null;
  const start = cellAt(from.x, from.z);
  const goal = cellAt(to.x, to.z);
  if (start < 0 || goal < 0) return null;
  if (start === goal) return [{ x: to.x, z: to.z }];

  generation++;
  heapNode.length = 0;
  heapKey.length = 0;
  gScore[start] = 0;
  stamp[start] = generation;
  cameFrom[start] = -1;
  heapPush(start, HEURISTIC_WEIGHT * octile(start, goal));

  let best = start;
  let bestH = octile(start, goal);
  let expanded = 0;
  let found = false;
  while (heapNode.length > 0 && expanded < maxExpand) {
    const cur = heapPop();
    if (closed[cur] === generation) continue;
    closed[cur] = generation;
    if (cur === goal) { found = true; best = goal; break; }
    expanded++;
    const h = octile(cur, goal);
    if (h < bestH) { bestH = h; best = cur; }
    const ci = cur % NAV_NX;
    const cj = Math.floor(cur / NAV_NX);
    for (let k = 0; k < 8; k++) {
      const ni = ci + DI[k]!, nj = cj + DJ[k]!;
      if (ni < 0 || nj < 0 || ni >= NAV_NX || nj >= NAV_NZ) continue;
      const n = cellIdx(ni, nj);
      if (!grid.walkable[n] || closed[n] === generation) continue;
      // No corner cutting: a diagonal step needs both orthogonal neighbours free.
      if (k >= 4 && (!grid.walkable[cellIdx(ci + DI[k]!, cj)] || !grid.walkable[cellIdx(ci, cj + DJ[k]!)])) continue;
      const g = gScore[cur]! + (k >= 4 ? 1.4142 : 1) * (1 + grid.edge[n]!);
      if (stamp[n] !== generation || g < gScore[n]!) {
        stamp[n] = generation;
        gScore[n] = g;
        cameFrom[n] = cur;
        heapPush(n, g + HEURISTIC_WEIGHT * octile(n, goal));
      }
    }
  }

  const cells: number[] = [];
  for (let c = best; c !== -1; c = cameFrom[c]!) cells.push(c);
  cells.reverse();
  const pts: Pt[] = cells.map((c) => ({ x: cellX(c % NAV_NX), z: cellZ(Math.floor(c / NAV_NX)) }));
  // The goal keeps its exact (snapped) position when the search finished.
  if (found) pts[pts.length - 1] = { x: to.x, z: to.z };
  return smooth(grid, pts);
}

/**
 * String-pulling: drops every waypoint a straight, walkable line can skip, so bots walk lines instead of staircases.
 * @param pts - Cell-centre path including the start point.
 * @returns The path without its start point.
 */
function smooth(grid: NavGrid, pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !lineWalkable(grid, pts[i]!.x, pts[i]!.z, pts[j]!.x, pts[j]!.z, true)) j--;
    out.push(pts[j]!);
    i = j;
  }
  return out;
}
