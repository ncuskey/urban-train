// src/modules/autofit.js
// d3 is global; do not import it here.

/**
 * Compute an axis-aligned bounding box of "land" polygons.
 * If preferFeatureType is true, only includes featureType === 'Island';
 * otherwise falls back to height >= seaLevel.
 */
export function computeLandBBox(polygons, { seaLevel = 0.2, preferFeatureType = true } = {}) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let any = false;

  const isLand = (p) => {
    if (!p) return false;
    if (preferFeatureType && p.featureType != null) return p.featureType === 'Island';
    return (p.height || 0) >= seaLevel;
  };

  for (let i = 0; i < polygons.length; i++) {
    const poly = polygons[i];
    if (!isLand(poly) || !poly || !poly.length) continue;
    any = true;
    for (let j = 0; j < poly.length; j++) {
      const v = poly[j];
      if (!v) continue;
      const x = +v[0], y = +v[1];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (!any) return null;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { minX, minY, maxX, maxY, cx, cy, w: maxX - minX, h: maxY - minY };
}

/**
 * Fit (pan + zoom) so the land bbox fits inside the viewport with a margin.
 * Uses the existing zoom behavior bound to the SVG.
 * - Keeps default behavior unchanged unless called.
 * - Respects zoom.scaleExtent() min/max.
 */
export function fitToLand({
  svg,
  zoom,
  polygons,
  width,
  height,
  seaLevel = 0.2,
  preferFeatureType = true,
  margin = 0.08,     // 8% padding on all sides
  duration = 600
}) {
  if (!svg || !polygons || !polygons.length) return;

  const bbox = computeLandBBox(polygons, { seaLevel, preferFeatureType });
  if (!bbox) return;

  // Guard against degenerate bbox
  const bboxW = Math.max(1e-6, bbox.w);
  const bboxH = Math.max(1e-6, bbox.h);

  // Effective viewport after margin
  const vw = Math.max(1, width  * (1 - margin * 2));
  const vh = Math.max(1, height * (1 - margin * 2));

  // Target scale to fit bbox into viewport (no rotation)
  const kFit = Math.min(vw / bboxW, vh / bboxH);

  // Respect current zoom's scaleExtent
  const extent = typeof zoom.scaleExtent === 'function' ? zoom.scaleExtent() : [kFit, kFit];
  const kMin = extent && extent.length ? extent[0] : 1;
  const kMax = extent && extent.length ? extent[1] : kFit;
  const k = Math.max(kMin, Math.min(kFit, kMax));

  // Translate so bbox center goes to viewport center at scale k
  const tx = (width  / 2) - k * bbox.cx;
  const ty = (height / 2) - k * bbox.cy;

  // Apply transform via the same zoom behavior bound to SVG, so on('zoom') fires
  svg
    .transition()
    .duration(duration)
    .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
}
