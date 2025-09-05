// src/modules/rivers.js
// Minimal river generation:
// 1) route downhill per cell to its lowest neighbor (steepest descent)
// 2) accumulate flux from precipitation (and a small base runoff)
// 3) mark "river" cells where flux >= dynamic threshold
//
// Exposed fields on each polygon (cell):
//   p.down   : index of downhill neighbor, or -1 if sink/ocean
//   p.flux   : accumulated flow (arbitrary units)
//   p.isRiver: boolean
//   p.isMouth: boolean (river that drains into ocean or sink)
//   p.inDeg  : number of upstream river parents (for stats)

function centroidXY(poly) {
  let x = 0, y = 0, n = 0;
  for (const pt of poly) if (pt && pt.length >= 2) { x += pt[0]; y += pt[1]; n++; }
  return n ? [x / n, y / n] : [0, 0];
}

function ensureNeighborList(polygons) {
  // Soft check: assume a .neighbors array exists (built in your geometry step).
  // If not, we quietly skip routing for those cells.
  return Array.isArray(polygons) && polygons.length && 'neighbors' in polygons[0];
}

function quantile(arr, q) {
  if (!arr.length) return NaN;
  const a = arr.slice().sort((m, n) => m - n);
  const i = (a.length - 1) * q;
  const lo = Math.floor(i), hi = Math.ceil(i);
  if (lo === hi) return a[lo];
  const t = i - lo;
  return a[lo] * (1 - t) + a[hi] * t;
}

export function generateRivers(polygons, {
  seaLevel = 0.2,
  baseRunoff = 0.02,        // tiny base flow so small catchments can start streams
  fluxQuantile = 0.92,      // dynamic threshold = q92 of flux over land
  minSegments = 1           // ignore super-short 1-seg "rivers" if you want >1 later
} = {}) {
  if (!Array.isArray(polygons) || !polygons.length) return {segments: 0, sources: 0, confluences: 0, mouths: 0, threshold: 0};

  const hasNeighbors = ensureNeighborList(polygons);

  // Reset fields
  for (const p of polygons) {
    p.down = -1;
    p.flux = 0;
    p.isRiver = false;
    p.isMouth = false;
    p.inDeg = 0;
  }

  // 1) Route downhill (steepest descent among neighbors)
  if (hasNeighbors) {
    for (let i = 0; i < polygons.length; i++) {
      const p = polygons[i];
      const h = p.height;
      if (!Number.isFinite(h)) continue;
      if (h < seaLevel) { p.down = -1; continue; } // water: treated as sinks/outlets

      let best = -1;
      let bestH = h;
      const nb = p.neighbors || [];
      for (const j of nb) {
        const nj = polygons[j];
        if (!nj) continue;
        const hj = nj.height;
        if (!Number.isFinite(hj)) continue;
        if (hj < bestH) { bestH = hj; best = j; }
      }
      p.down = best; // -1 if all neighbors are >= h (local pit / flat)
    }
  }

  // 2) Accumulate flux topologically (multi-pass relaxation)
  // Start with base runoff + precipitation
  for (let i = 0; i < polygons.length; i++) {
    const p = polygons[i];
    const overWater = Number.isFinite(p.height) && p.height < seaLevel;
    const runoff = (overWater ? 0 : baseRunoff) + Math.max(0, p.prec || 0);
    p.flux = runoff;
  }

  // Iterative pushes downstream (simple relaxation ~20 passes is plenty on ~10k cells)
  const passes = 20;
  for (let k = 0; k < passes; k++) {
    for (let i = 0; i < polygons.length; i++) {
      const p = polygons[i];
      const d = p.down;
      if (d >= 0) polygons[d].flux += p.flux * 0.05; // small fraction per pass
    }
  }

  // Compute in-degree for stats and confluence marking
  for (let i = 0; i < polygons.length; i++) {
    const d = polygons[i].down;
    if (d >= 0) polygons[d].inDeg++;
  }

  // 3) Mark rivers by dynamic threshold over land
  const landFluxes = [];
  for (const p of polygons) if (Number.isFinite(p.height) && p.height >= seaLevel) landFluxes.push(p.flux);
  const dynThreshold = quantile(landFluxes, fluxQuantile) || 0;

  for (let i = 0; i < polygons.length; i++) {
    const p = polygons[i];
    if (p.height >= seaLevel && p.flux >= dynThreshold && p.down !== -1) {
      p.isRiver = true;
    }
  }

  // River-only indegree: count upstream parents that are also rivers
  for (let i = 0; i < polygons.length; i++) polygons[i].riverInDeg = 0;
  for (let i = 0; i < polygons.length; i++) {
    const p = polygons[i];
    if (!p.isRiver) continue;
    const d = p.down;
    if (d >= 0 && polygons[d].isRiver) polygons[d].riverInDeg++;
  }

  // Identify mouths (river cell that flows into ocean/water or no downhill)
  for (let i = 0; i < polygons.length; i++) {
    const p = polygons[i];
    if (!p.isRiver) continue;
    const d = p.down;
    if (d < 0 || polygons[d].height < seaLevel) p.isMouth = true;
  }

  // Stats & cleanup: count sources, confluences, mouths, segments
  let sources = 0, confluences = 0, mouths = 0, segments = 0;
  for (let i = 0; i < polygons.length; i++) {
    const p = polygons[i];
    if (p.isRiver) {
      segments++;
      if (p.riverInDeg === 0) sources++;
      if (p.riverInDeg >= 2) confluences++;
      if (p.isMouth) mouths++;
    }
  }

  // (Optional) prune one-segment stubs if requested
  if (minSegments > 1) {
    // lightweight pass: drop isolated singletons (no upstream & mouth immediately)
    for (let i = 0; i < polygons.length; i++) {
      const p = polygons[i];
      if (!p.isRiver) continue;
      const d = p.down;
      if (p.riverInDeg === 0 && (d < 0 || polygons[d].height < seaLevel)) {
        p.isRiver = false; p.isMouth = false; segments--; sources--; mouths--;
      }
    }
  }

  return {segments, sources, confluences, mouths, threshold: dynThreshold};
}
