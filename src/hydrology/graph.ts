/**
 * Graph builders and Voronoi helpers for the hydrology system.
 * Uses d3-delaunay for modern, efficient Voronoi computation.
 */

// @ts-ignore - CDN import
import { Delaunay } from "https://cdn.jsdelivr.net/npm/d3-delaunay@6/+esm";
import { Cell } from "./types.js";

/** Poisson-disc sampler (near Azgaar's; deterministic via RNG) */
export function poissonDisc(
  width: number, height: number, radius: number,
  rand: () => number
): [number, number][] {
  const k = 30; // max attempts
  const r2 = radius * radius;
  const R = 3 * r2;
  const cellSize = radius * Math.SQRT1_2;
  const gw = Math.ceil(width / cellSize);
  const gh = Math.ceil(height / cellSize);
  
  // Prevent array size overflow with more robust checking
  const gridSize = gw * gh;
  const maxGridSize = 1000000; // 1M cells max
  
  // Check for invalid array length (JavaScript array limit is ~2^32-1)
  if (gridSize > maxGridSize || gridSize < 0 || !isFinite(gridSize)) {
    throw new Error(`Grid too large: ${gw}x${gh} = ${gridSize} cells. Try increasing radius or decreasing map size.`);
  }
  
  const grid: ([number, number] | undefined)[] = new Array(gridSize);
  const queue: [number, number][] = [];
  let sampleSize = 0;

  function far(x: number, y: number) {
    const i = (x / cellSize) | 0;
    const j = (y / cellSize) | 0;
    const i0 = Math.max(i - 2, 0);
    const j0 = Math.max(j - 2, 0);
    const i1 = Math.min(i + 3, gw);
    const j1 = Math.min(j + 3, gh);
    for (let jj = j0; jj < j1; ++jj) {
      const o = jj * gw;
      for (let ii = i0; ii < i1; ++ii) {
        const s = grid[o + ii];
        if (s) {
          const dx = s[0] - x;
          const dy = s[1] - y;
          if (dx * dx + dy * dy < r2) return false;
        }
      }
    }
    return true;
  }

  function sample(x: number, y: number) {
    const s: [number, number] = [x, y];
    queue.push(s);
    grid[gw * ((y / cellSize) | 0) + ((x / cellSize) | 0)] = s;
    ++sampleSize;
    return s;
  }

  // first sample
  if (!sampleSize) sample(rand() * width, rand() * height);

  while (queue.length) {
    const i = (rand() * queue.length) | 0;
    const s = queue[i];
    let accepted = false;
    for (let j = 0; j < k; ++j) {
      const a = 2 * Math.PI * rand();
      const r = Math.sqrt(rand() * R + r2);
      const x = s[0] + r * Math.cos(a);
      const y = s[1] + r * Math.sin(a);
      if (0 <= x && x < width && 0 <= y && y < height && far(x, y)) {
        sample(x, y);
        accepted = true;
      }
    }
    if (!accepted) queue.splice(i, 1);
  }

  // return in array form
  const out: [number, number][] = [];
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const s = grid[j * gw + i];
      if (s) out.push(s);
    }
  }
  return out;
}

/** Build d3-delaunay Voronoi diagram from points */
export function buildDelaunay(points: [number, number][]) {
  const delaunay = Delaunay.from(points);
  const bounds: [number, number, number, number] = [
    0, 0,
    Math.max(...points.map(p => p[0])) || 1,
    Math.max(...points.map(p => p[1])) || 1
  ];
  const voronoi = delaunay.voronoi(bounds);
  
  return { delaunay, voronoi };
}

/** Build Cell[] from d3-delaunay Voronoi diagram (neighbors + polygons + initial scalars) */
export function buildCells(points: [number, number][], voronoi: any): Cell[] {
  const cells: Cell[] = [];
  const n = points.length;
  
  for (let i = 0; i < n; i++) {
    const poly = voronoi.cellPolygon(i) as [number, number][];
    if (!poly) continue;
    
    // Get neighbors via d3-delaunay's neighbors method
    const neighbors = Array.from(voronoi.delaunay.neighbors(i));

    cells.push({
      id: i,
      x: points[i][0],
      y: points[i][1],
      polygon: poly,
      neighbors,
      height: 0,
      precipitation: 0.02,
      flux: 0.02,
    } as Cell);
  }
  return cells;
}

/** Find cell at coordinates using d3-delaunay's find method */
export function makeFindCellAt(voronoi: any): (x: number, y: number) => number | null {
  return (x, y) => {
    const id = voronoi.delaunay.find(x, y);
    return (id == null ? null : id);
  };
}

/** Midpoint of the shared edge between neighboring cells (a <-> b) */
export function makeGetEdgeMidpoint(voronoi: any) {
  return (a: number, b: number): { x: number; y: number } => {
    const ringA = voronoi.cellPolygon(a) as [number, number][];
    const ringB = voronoi.cellPolygon(b) as [number, number][];
    
    if (!ringA || !ringB) {
      // fallback: midpoint between cell centers
      const centerA = getPolygonCenter(ringA || []);
      const centerB = getPolygonCenter(ringB || []);
      return { x: (centerA.x + centerB.x) / 2, y: (centerA.y + centerB.y) / 2 };
    }
    
    const mids: { x: number; y: number }[] = [];

    for (let i = 0; i < ringA.length - 1; i++) {
      const a1 = ringA[i], a2 = ringA[i + 1];
      for (let j = 0; j < ringB.length - 1; j++) {
        const b1 = ringB[j], b2 = ringB[j + 1];
        // same undirected edge if endpoints match (tolerant compare)
        if (sameEdge(a1, a2, b1, b2)) {
          mids.push({ x: (a1[0] + a2[0]) / 2, y: (a1[1] + a2[1]) / 2 });
        }
      }
    }
    
    if (mids.length) {
      const mx = mids.reduce((s, p) => s + p.x, 0) / mids.length;
      const my = mids.reduce((s, p) => s + p.y, 0) / mids.length;
      return { x: mx, y: my };
    }
    
    // fallback: midpoint between cell centers
    const centerA = getPolygonCenter(ringA);
    const centerB = getPolygonCenter(ringB);
    return { x: (centerA.x + centerB.x) / 2, y: (centerA.y + centerB.y) / 2 };
  };
}

/** Exact shared edge endpoints (for coastline chaining) */
export function makeGetSharedEdge(voronoi: any) {
  return (a: number, b: number): [{ x: number; y: number }, { x: number; y: number }] => {
    const ringA = voronoi.cellPolygon(a) as [number, number][];
    const ringB = voronoi.cellPolygon(b) as [number, number][];
    
    if (!ringA || !ringB) {
      // fallback: degenerate tiny segment between centers
      const centerA = getPolygonCenter(ringA || []);
      const centerB = getPolygonCenter(ringB || []);
      const mx = (centerA.x + centerB.x) / 2, my = (centerA.y + centerB.y) / 2;
      return [{ x: mx - 0.1, y: my - 0.1 }, { x: mx + 0.1, y: my + 0.1 }];
    }
    
    for (let i = 0; i < ringA.length - 1; i++) {
      const a1 = ringA[i], a2 = ringA[i + 1];
      for (let j = 0; j < ringB.length - 1; j++) {
        const b1 = ringB[j], b2 = ringB[j + 1];
        if (sameEdge(a1, a2, b1, b2)) {
          return [{ x: a1[0], y: a1[1] }, { x: a2[0], y: a2[1] }];
        }
      }
    }
    
    // fallback: degenerate tiny segment between centers
    const centerA = getPolygonCenter(ringA);
    const centerB = getPolygonCenter(ringB);
    const mx = (centerA.x + centerB.x) / 2, my = (centerA.y + centerB.y) / 2;
    return [{ x: mx - 0.1, y: my - 0.1 }, { x: mx + 0.1, y: my + 0.1 }];
  };
}

// Helper functions
function samePt(p: [number, number], q: [number, number], eps = 1e-6) {
  return Math.abs(p[0] - q[0]) <= eps && Math.abs(p[1] - q[1]) <= eps;
}

function sameEdge(a1: [number, number], a2: [number, number], b1: [number, number], b2: [number, number]) {
  return (samePt(a1, b1) && samePt(a2, b2)) || (samePt(a1, b2) && samePt(a2, b1));
}

function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point;
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  
  return inside;
}

function getPolygonCenter(polygon: [number, number][]): { x: number; y: number } {
  if (polygon.length === 0) return { x: 0, y: 0 };
  
  const x = polygon.reduce((sum, p) => sum + p[0], 0) / polygon.length;
  const y = polygon.reduce((sum, p) => sum + p[1], 0) / polygon.length;
  return { x, y };
}
