// src/labels/anchors.js
// Build a small, testable set of "proto" anchors from polygons (no rendering).
// d3 is global in this project.

function centroid(poly) {
  if (d3 && d3.polygonCentroid) return d3.polygonCentroid(poly);
  // Fallback: simple average
  let sx = 0, sy = 0, n = poly.length || 0;
  for (let i = 0; i < n; i++) { sx += poly[i][0]; sy += poly[i][1]; }
  return n ? [sx / n, sy / n] : [0, 0];
}

function areaAbs(poly) {
  if (d3 && d3.polygonArea) return Math.abs(d3.polygonArea(poly));
  // Fallback shoelace
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  }
  return Math.abs(a / 2);
}

export function estimateTextWidth(text, px = 12) {
  // Heuristic only; real measurement will come later.
  const len = (text?.length ?? 0);
  return len * px * 0.6;
}

/**
 * Build a capped list of proto-anchors using polygon centroids of the largest cells.
 * Returns { anchors, metrics } — no rendering, no placement.
 */
export function buildProtoAnchors({ polygons, max = 200 }) {
  if (!Array.isArray(polygons)) return { anchors: [], metrics: { total: 0 } };

  // Rank by area so we avoid zillions of tiny cells.
  const ranked = polygons.map((poly, i) => ({ i, a: areaAbs(poly), poly }))
                         .sort((a, b) => b.a - a.a)
                         .slice(0, Math.min(max, polygons.length));

  const anchors = ranked.map(({ i, a, poly }) => {
    const [x, y] = centroid(poly);
    return {
      id: `poly-${i}`,
      polyIndex: i,
      kind: "proto",          // semantic kind comes later (land/water/region/etc.)
      tier: "t3",             // placeholder until we wire style/logic
      x, y,
      area: a,
      text: `P${i}`,          // placeholder; real names come later
      estWidth: estimateTextWidth(`P${i}`, 12)
    };
  });

  return { anchors, metrics: { total: anchors.length, considered: polygons.length } };
}
