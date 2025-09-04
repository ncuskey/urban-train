// src/labels/anchors-water.js

export const MAX_WATER_ANCHORS_PER_COMPONENT = 1;

function hashComponentsSummary(summary) {
  // summary: {oceans, seas, lakes, total}
  return `${summary.oceans}|${summary.seas}|${summary.lakes}|${summary.total}`;
}

function enforceAnchorCap(anchors, maxPerComp = MAX_WATER_ANCHORS_PER_COMPONENT) {
  // Group by componentId, keep top-scoring anchors (lowest label cost / highest area / your score field)
  const byComp = new Map();
  for (const a of anchors) {
    // Expect a.componentId (or a.featureId). If your field is different, adjust the key below.
    const key = a.componentId ?? a.featureId ?? a.compId ?? a.id;
    if (key == null) continue;
    if (!byComp.has(key)) byComp.set(key, []);
    byComp.get(key).push(a);
  }
  const kept = [];
  for (const [, list] of byComp) {
    // Sort descending by your existing ranking metric; fall back to area, then stable
    list.sort((u, v) => (v.score ?? v.area ?? 0) - (u.score ?? u.area ?? 0));
    kept.push(...list.slice(0, maxPerComp));
  }
  return kept;
}

// Module-scope cache of the most recent water anchors.
// Shape: { oceans: Anchor[], seas: Anchor[], lakes: Anchor[], total: number }
let __lastWaterAnchors = null;
export function getLastWaterAnchors() {
  return __lastWaterAnchors;
}

function centroid(poly) {
  if (typeof d3 !== "undefined" && d3.polygonCentroid) return d3.polygonCentroid(poly);
  let sx = 0, sy = 0, n = poly?.length || 0;
  for (let i = 0; i < n; i++) { sx += poly[i][0]; sy += poly[i][1]; }
  return n ? [sx / n, sy / n] : [0, 0];
}

function areaAbs(poly) {
  if (typeof d3 !== "undefined" && d3.polygonArea) return Math.abs(d3.polygonArea(poly));
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  }
  return Math.abs(a / 2);
}

/** Area-weighted centroid of a component via its polygon indices. */
function componentCentroid(comp, polygons) {
  let Ax = 0, Ay = 0, A = 0;
  for (const i of comp.indices || []) {
    const poly = polygons?.[i];
    if (!Array.isArray(poly)) continue;
    const a = areaAbs(poly);
    const [cx, cy] = centroid(poly);
    Ax += a * cx; Ay += a * cy; A += a;
  }
  return A ? [Ax / A, Ay / A] : null;
}

/**
 * Compute bounding box for a set of world-space points.
 * Returns { x, y, w, h, cx, cy } in world coordinates.
 */
function quickBBox(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  return { 
    x: minX, y: minY, 
    w: maxX - minX, h: maxY - minY, 
    cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 
  };
}

/**
 * Compute polygon centroid using shoelace formula.
 * Falls back to bbox center if degenerate.
 */
function polygonCentroid(points) {
  // Shoelace centroid; falls back to bbox center if degenerate
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = points.length, j = n - 1; i < n; j = i++) {
    const p0 = points[j], p1 = points[i];
    const f = (p0.x * p1.y) - (p1.x * p0.y);
    a += f; cx += (p0.x + p1.x) * f; cy += (p0.y + p1.y) * f;
  }
  if (a === 0) return null;
  a *= 0.5;
  return { cx: cx / (6 * a), cy: cy / (6 * a) };
}

/**
 * Build one anchor per water component (ocean/sea/lake).
 * Returns the anchors array and also sets window.__waterAnchors.
 */
export function buildWaterAnchors({ components = [], polygons = [], mapW = 640, mapH = 360, seaLevel }) {
  const mapA = mapW * mapH;
  const normAreaPx = a => {
    if (a == null) return 0;
    // If looks like a fraction (0..1), scale to px; else treat as px.
    return a > 0 && a <= 1 ? a * mapA : a;
  };

  const counters = { ocean: 0, sea: 0, lake: 0 };
  const anchors = [];

  const used = { centroid: 0, centroidPx: 0, cxcy: 0, bbox: 0, rings: 0, indices: 0, fallback: 0 };

  const getXY = (c) => {
    if (Array.isArray(c.centroid) && c.centroid.length === 2) { used.centroid++; return c.centroid; }
    if (Array.isArray(c.centroidPx) && c.centroidPx.length === 2) { used.centroidPx++; return c.centroidPx; }
    if (typeof c.cx === 'number' && typeof c.cy === 'number') { used.cxcy++; return [c.cx, c.cy]; }
    if (c.bbox && typeof c.bbox.x0 === 'number' && typeof c.bbox.x1 === 'number') {
      used.bbox++; return [(c.bbox.x0 + c.bbox.x1) / 2, (c.bbox.y0 + c.bbox.y1) / 2];
    }
    if (Array.isArray(c.rings) && c.rings.length) {
      let sx = 0, sy = 0, n = 0;
      for (const ring of c.rings) for (const pt of ring) { sx += pt[0]; sy += pt[1]; n++; }
      if (n) { used.rings++; return [sx / n, sy / n]; }
    }
    const cc = componentCentroid(c, polygons);
    if (cc) { used.indices++; return cc; }

    used.fallback++;
    return [mapW / 2, mapH / 2];
  };

  for (const c of components) {
    if (!c || !['ocean', 'sea', 'lake'].includes(c.kind)) continue;

    let [x, y] = getXY(c);
    // Normalize 0..1 coords to pixels
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) { x *= mapW; y *= mapH; }

    const areaPx = normAreaPx(c.areaPx ?? c.area ?? 0);
    const id = c.id ?? `${c.kind}-${counters[c.kind]++}`;

    // Tiers: forgiving thresholds so tiny seas/lakes still show up for QA
    const tier =
      c.kind === 'ocean' ? 't1' :
      c.kind === 'sea'   ? (areaPx > mapA * 0.012 ? 't1' : 't2') :
                           (areaPx > 1400 ? 't3' : 't4');

    const lod = {
      minK: c.kind === 'ocean' ? 1.0 : c.kind === 'sea' ? 1.1 : 1.2,
      maxK: 32
    };

    // Compute centroid and bbox for ocean anchors
    let cx = x, cy = y, bbox = null;
    if (c.kind === 'ocean' && c.points && Array.isArray(c.points)) {
      const pts = c.points; // world-space points for this water component
      const bb = quickBBox(pts);
      const cen = polygonCentroid(pts) || { cx: bb.cx, cy: bb.cy };
      cx = cen.cx; cy = cen.cy;
      bbox = { x: bb.x, y: bb.y, w: bb.w, h: bb.h };
    }

    anchors.push({
      id,
      kind: c.kind,
      tier,
      x, y,
      cx, cy, bbox, // Add centroid and bbox fields
      lod,
      category: 'waterArea',
      text: c.label || c.kind.toUpperCase()
    });
  }

  // Safety: if everything got filtered somehow, give QA one low-priority anchor
  if (!anchors.length && components.length) {
    const best = [...components].sort(
      (a, b) => normAreaPx((b.areaPx ?? b.area ?? 0)) - normAreaPx((a.areaPx ?? a.area ?? 0))
    )[0];
    let [x, y] = getXY(best);
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) { x *= mapW; y *= mapH; }
    
    // Compute centroid and bbox for fallback anchor if it has points
    let cx = x, cy = y, bbox = null;
    if (best.points && Array.isArray(best.points)) {
      const pts = best.points;
      const bb = quickBBox(pts);
      const cen = polygonCentroid(pts) || { cx: bb.cx, cy: bb.cy };
      cx = cen.cx; cy = cen.cy;
      bbox = { x: bb.x, y: bb.y, w: bb.w, h: bb.h };
    }
    
    anchors.push({
      id: best.id ?? `${best.kind || 'water'}-fallback`,
      kind: best.kind || 'water',
      tier: 't4',
      x, y,
      cx, cy, bbox, // Add centroid and bbox fields
      lod: { minK: 1.2, maxK: 32 },
      category: 'waterArea',
      text: best.label || (best.kind ? best.kind.toUpperCase() : 'WATER')
    });
  }

  // Cap anchors per component (defensive)
  const capped = enforceAnchorCap(anchors, MAX_WATER_ANCHORS_PER_COMPONENT);

  // Meta for cache validation
  const summary = {oceans: 0, seas: 0, lakes: 0, total: 0};
  for (const a of capped) {
    if (a.kind === 'ocean') summary.oceans++;
    else if (a.kind === 'sea') summary.seas++;
    else if (a.kind === 'lake') summary.lakes++;
  }
  summary.total = summary.oceans + summary.seas + summary.lakes;
  
  const meta = {
    seaLevel: seaLevel ?? 0.2,
    polygonsCount: Array.isArray(polygons) ? polygons.length : 0,
    componentsHash: hashComponentsSummary(summary)
  };

  if (capped.length > (summary.total * MAX_WATER_ANCHORS_PER_COMPONENT)) {
    console.warn('[water:anchors] over-emit detected; trimming', {emitted: anchors.length, kept: capped.length, summary, MAX_WATER_ANCHORS_PER_COMPONENT});
  }

  window.__waterAnchors = capped;

  const result = { 
    oceans: capped.filter(a => a.kind === 'ocean'), 
    seas: capped.filter(a => a.kind === 'sea'), 
    lakes: capped.filter(a => a.kind === 'lake'), 
    total: capped.length 
  };

  console.log('[water:anchors] built',
    {
      oceans: result.oceans.length,
      seas:   result.seas.length,
      lakes:  result.lakes.length,
      total:  result.total
    },
    { count: capped.length, meta, sample: capped.slice(0, 5), used }
  );

  __lastWaterAnchors = result;
  return {anchors: capped, meta};
}

export function areWaterAnchorsValid(cached, {seaLevel, polygonsCount, components}) {
  if (!cached || !cached.meta) return false;
  const want = {
    seaLevel: seaLevel ?? 0.2,
    polygonsCount: polygonsCount ?? 0,
    componentsHash: hashComponentsSummary({
      oceans: components?.oceans ?? 0,
      seas: components?.seas ?? 0,
      lakes: components?.lakes ?? 0,
      total: components?.total ?? ((components?.oceans ?? 0) + (components?.seas ?? 0) + (components?.lakes ?? 0))
    })
  };
  const ok = cached.meta.seaLevel === want.seaLevel
          && cached.meta.polygonsCount === want.polygonsCount
          && cached.meta.componentsHash === want.componentsHash;
  if (!ok) {
    console.debug('[water:anchors] cache invalid', {have: cached.meta, want});
  }
  return ok;
}
