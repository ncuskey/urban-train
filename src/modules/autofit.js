// src/modules/autofit.js
// d3 is global

import { seaLevel } from '../hydrology/constants.js';

/**
 * Utility function to ensure layout is complete before measuring.
 * Uses double requestAnimationFrame for belt-and-suspenders approach.
 */
export function afterLayout(callback) {
  requestAnimationFrame(() => requestAnimationFrame(callback));
}

/**
 * Clamp a rectangle to visible bounds as a final safety guard.
 * Ensures the rectangle is always within the visible viewport.
 * Works with rectangle objects that have x0, y0, x1, y1, w, h properties.
 */
export function clampRectToBounds(rect, bounds) {
  // Handle both x0,y0,x1,y1 format and x,y,w,h format
  const rectX = rect.x0 !== undefined ? rect.x0 : rect.x;
  const rectY = rect.y0 !== undefined ? rect.y0 : rect.y;
  const rectW = rect.w || (rect.x1 - rect.x0);
  const rectH = rect.h || (rect.y1 - rect.y0);
  
  const x = Math.max(bounds.x0, Math.min(rectX, bounds.x1));
  const y = Math.max(bounds.y0, Math.min(rectY, bounds.y1));
  const w = Math.max(0, Math.min(rectX + rectW, bounds.x1) - x);
  const h = Math.max(0, Math.min(rectY + rectH, bounds.y1) - y);
  
  // Return in the same format as the input
  if (rect.x0 !== undefined) {
    // Return x0, y0, x1, y1 format
    return { 
      x0: x, y0: y, x1: x + w, y1: y + h,
      w, h,
      corner: rect.corner,
      touchesCoast: rect.touchesCoast,
      area: w * h,
      labelScore: rect.labelScore
    };
  } else {
    // Return x, y, w, h format
    return { x, y, w, h };
  }
}

/**
 * Compute an axis-aligned bounding box of "land" polygons.
 * If preferFeatureType is true, only includes featureType === 'Island';
 * otherwise falls back to height >= seaLevel.
 */
export function computeLandBBox(polygons, { seaLevel: _sea = seaLevel, preferFeatureType = true } = {}) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let any = false;

  const isLand = (p) => {
    if (!p) return false;
    if (preferFeatureType && p.featureType != null) return p.featureType === 'Island';
    return (p.height || 0) >= _sea;
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
 * - Returns a Promise that resolves when the transition completes.
 */
export function fitToLand({
  svg,
  zoom,
  polygons,
  width,
  height,
  seaLevel: _sea = seaLevel,
  preferFeatureType = true,
  margin = 0.08,     // 8% padding on all sides
  duration = 600
}) {
  if (!svg || !polygons || !polygons.length) return Promise.resolve();

  const bbox = computeLandBBox(polygons, { seaLevel: _sea, preferFeatureType });
  if (!bbox) return Promise.resolve();

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

  // Return a Promise that resolves when the transition completes
  return new Promise(resolve => {
    const tr = svg
      .transition()
      .duration(duration);
    
    tr.on('end.autofit', resolve).on('interrupt.autofit', resolve);
    tr.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
  });
}

/**
 * Auto-fit to world bounds with Promise-based completion.
 * This function matches the user's specification for the main.js integration.
 */
export function autoFitToWorld(svg, zoom, w, h, worldBBox, duration = 400) {
  const k = Math.min(
    (w - 64) / (worldBBox.width  || 1),
    (h - 64) / (worldBBox.height || 1)
  );
  const tx = (w  - k * (worldBBox.x + worldBBox.width  / 2));
  const ty = (h  - k * (worldBBox.y + worldBBox.height / 2));
  const t  = d3.zoomIdentity.translate(tx, ty).scale(k);

  return new Promise(resolve => {
    const tr = svg.transition().duration(duration);
    tr.on('end.autofit', resolve).on('interrupt.autofit', resolve);
    tr.call(zoom.transform, t);
  });
}
