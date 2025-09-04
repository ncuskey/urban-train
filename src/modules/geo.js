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
