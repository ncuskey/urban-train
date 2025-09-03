// src/labels/anchors-water.js

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
 * Build one anchor per water component (ocean/sea/lake).
 * Returns the anchors array and also sets window.__waterAnchors.
 */
export function buildWaterAnchors({ components = [], polygons = [], mapW = 640, mapH = 360 }) {
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

    anchors.push({
      id,
      kind: c.kind,
      tier,
      x, y,
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
    anchors.push({
      id: best.id ?? `${best.kind || 'water'}-fallback`,
      kind: best.kind || 'water',
      tier: 't4',
      x, y,
      lod: { minK: 1.2, maxK: 32 },
      category: 'waterArea',
      text: best.label || (best.kind ? best.kind.toUpperCase() : 'WATER')
    });
  }

  window.__waterAnchors = anchors;

  const result = { 
    oceans: anchors.filter(a => a.kind === 'ocean'), 
    seas: anchors.filter(a => a.kind === 'sea'), 
    lakes: anchors.filter(a => a.kind === 'lake'), 
    total: anchors.length 
  };

  console.log('[water:anchors] built',
    {
      oceans: result.oceans.length,
      seas:   result.seas.length,
      lakes:  result.lakes.length,
      total:  result.total
    },
    { sample: anchors.slice(0, 5), used }
  );

  __lastWaterAnchors = result;
  return anchors;
}
