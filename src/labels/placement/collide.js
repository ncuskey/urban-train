// src/labels/placement/collide.js
// Greedy AABB collision pruning with a tiny grid index. No DOM here.

/** axis-aligned bbox intersect */
function intersects(a, b) {
  return !(a.x1 <= b.x0 || a.x0 >= b.x1 || a.y1 <= b.y0 || a.y0 >= b.y1);
}

/** simple priority: higher tier first; optional kind boost */
function rank(c) {
  const tierScore = { t1: 400, t2: 300, t3: 200, t4: 100 }[c.tier || "t3"] || 0;
  const kindBoost = { ocean: 40, sea: 30, lake: 20, region: 10 }[c.kind || ""] || 0;
  // Larger boxes later (prefer concise labels in tight spaces): negative area
  const area = Math.max(1, (c.x1 - c.x0) * (c.y1 - c.y0));
  return tierScore + kindBoost - area * 0.001; // very small area penalty
}

/** tiny uniform grid for fast candidate neighborhood queries */
class GridIndex {
  constructor(cell = 64) {
    this.cell = cell;
    this.cells = new Map(); // "ix,iy" -> Set of items
  }
  _key(ix, iy) { return `${ix},${iy}`; }
  _rangeKeys(b) {
    const cs = this.cell;
    const ix0 = Math.floor(b.x0 / cs), iy0 = Math.floor(b.y0 / cs);
    const ix1 = Math.floor((b.x1 - 1) / cs), iy1 = Math.floor((b.y1 - 1) / cs);
    const keys = [];
    for (let ix = ix0; ix <= ix1; ix++) for (let iy = iy0; iy <= iy1; iy++) keys.push(this._key(ix, iy));
    return keys;
  }
  insert(box) {
    for (const k of this._rangeKeys(box)) {
      if (!this.cells.has(k)) this.cells.set(k, new Set());
      this.cells.get(k).add(box);
    }
  }
  query(box) {
    const out = new Set();
    for (const k of this._rangeKeys(box)) {
      const bin = this.cells.get(k);
      if (!bin) continue;
      for (const it of bin) out.add(it);
    }
    return [...out];
  }
}

/**
 * Greedy placement: highest rank first; keep if no overlap with accepted.
 * Returns { placed, rejected }
 */
export function greedyPlace(candidates, { cell = 64 } = {}) {
  const placed = [];
  const rejected = [];
  const grid = new GridIndex(cell);

  const sorted = [...(candidates || [])].sort((a, b) => rank(b) - rank(a));
  for (const c of sorted) {
    const neighbors = grid.query(c);
    let hit = false;
    for (const n of neighbors) {
      if (intersects(c, n)) { hit = true; break; }
    }
    if (!hit) {
      placed.push(c);
      grid.insert(c);
    } else {
      rejected.push({ ...c, _reason: "overlap" });
    }
  }
  return { placed, rejected };
}
