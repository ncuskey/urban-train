// src/modules/geo.js
const EARTH_EQUATOR_KM = 40075.017; // km

export function defineMapCoordinates({ width, height, centerLat = 0, spanLat = 120, centerLon = 0, spanLon = 180 }) {
  const latTop = Math.max(-90, Math.min(90, centerLat + spanLat / 2));
  const latBottom = Math.max(-90, Math.min(90, centerLat - spanLat / 2));
  const lonLeft = centerLon - spanLon / 2;
  const lonRight = centerLon + spanLon / 2;
  const degPerPxX = (lonRight - lonLeft) / width;
  const kmPerPxAtEquator = (EARTH_EQUATOR_KM / 360) * degPerPxX;
  return { width, height, latTop, latBottom, lonLeft, lonRight, kmPerPxAtEquator };
}

export function assignLatitudes(polygons, map) {
  if (!Array.isArray(polygons)) return;
  const { height, latTop, latBottom } = map;
  const dLat = latBottom - latTop; // negative when top>bottom
  for (let i = 0; i < polygons.length; i++) {
    const poly = polygons[i];
    if (!poly || !poly.length) continue;
    let y = 0, n = 0;
    for (const p of poly) { if (p && p.length >= 2) { y += p[1]; n++; } }
    if (!n) continue;
    y /= n;
    poly.lat = latTop + (y / height) * dLat; // SVG y grows downwards
  }
  return polygons;
}

// Assign per-cell longitude (degrees) via centroid X
export function assignLongitudes(polygons, map) {
  if (!Array.isArray(polygons)) return;
  const { width, lonLeft, lonRight } = map;
  const dLon = lonRight - lonLeft;
  for (let i = 0; i < polygons.length; i++) {
    const poly = polygons[i];
    if (!poly || !poly.length) continue;
    let x = 0, n = 0;
    for (const p of poly) { if (p && p.length >= 2) { x += p[0]; n++; } }
    if (!n) continue;
    x /= n;
    poly.lon = lonLeft + (x / width) * dLon;
  }
  return polygons;
}

// Great-circle distance between two cells (km)
export function haversineKm(a, b) {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lon) || !Number.isFinite(b.lat) || !Number.isFinite(b.lon)) return NaN;
  const toRad = d => d * Math.PI / 180;
  const R = 6371; // Earth radius (km)
  const phi1 = toRad(a.lat), phi2 = toRad(b.lat);
  const dphi = toRad(b.lat - a.lat), dlambda = toRad(b.lon - a.lon);
  const s = Math.sin(dphi/2)**2 + Math.cos(phi1)*Math.cos(phi2)*Math.sin(dlambda/2)**2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
