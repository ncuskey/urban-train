// src/labels/anchors-water.js
// Build one anchor per inland water component (sea/lake). No rendering.

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

/** Area-weighted centroid of a component (by polygon area). */
function componentCentroid(comp, polygons) {
  let Ax = 0, Ay = 0, A = 0;
  for (const i of comp.indices) {
    const poly = polygons[i];
    if (!Array.isArray(poly)) continue;
    const a = areaAbs(poly);
    const [cx, cy] = centroid(poly);
    Ax += a * cx; Ay += a * cy; A += a;
  }
  return A ? [Ax / A, Ay / A] : [0, 0];
}

/**
 * Build anchors for inland components (sea/lake). Skip ocean by default.
 * Returns { anchors, metrics }
 */
export function buildWaterComponentAnchors({ components, polygons, includeOcean = false }) {
  const anchors = [];
  let seas = 0, lakes = 0, oceans = 0;

  for (const comp of components || []) {
    if (!includeOcean && comp.kind === "ocean") { oceans++; continue; }
    const [x, y] = componentCentroid(comp, polygons);
    const id = `${comp.kind}-${anchors.length}`;
    // Tier is provisional; style attach will choose size from tokens.
    anchors.push({
      id,
      polyIndex: comp.indices[0] ?? null,
      kind: comp.kind,          // "sea" or "lake" (or "ocean" if includeOcean)
      tier: comp.kind === "sea" ? "t2" : "t3",
      x, y,
      area: comp.area,
      text: comp.kind.toUpperCase(),   // placeholder
      estWidth: 100                    // placeholder; replaced later
    });
    if (comp.kind === "sea") seas++; else if (comp.kind === "lake") lakes++; else oceans++;
  }

  return { anchors, metrics: { seas, lakes, oceans, total: anchors.length } };
}
