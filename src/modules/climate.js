// src/modules/climate.js
// Minimal climate temperature model:
//  - Sea-level temperature varies by latitude (warm equator -> cold poles)
//  - Temperature drops with altitude (standard lapse rate, ~6.5°C/km)
//
// Inputs:
//   polygons[*].lat   (degrees, set earlier by assignLatitudes)
//   polygons[*].height (normalized 0..1; seaLevel threshold provided)
//   map: { width, height, latTop, latBottom, ... } (from defineMapCoordinates)
//
// Output:
//   polygons[*].temp (°C)

function seaLevelTempAtLat(latDeg) {
  // Piecewise-linear bands:
  //   0°  -> 27°C (equator)
  //  60°  ->  7°C (mid-lat)
  //  90°  -> -25°C (poles)
  const abs = Math.abs(latDeg);
  const t0 = 27, t60 = 7, t90 = -25;
  if (abs <= 60) {
    return t0 + (t60 - t0) * (abs / 60);
  } else {
    return t60 + (t90 - t60) * ((abs - 60) / 30);
  }
}

export function assignTemperatures(
  polygons,
  map,
  { seaLevel = 0.2, maxElevKm = 5, lapseRateCperKm = 6.5 } = {}
){
  if (!Array.isArray(polygons) || !polygons.length) return {count: 0};
  let min = +Infinity, max = -Infinity, sum = 0, n = 0;

  for (let i = 0; i < polygons.length; i++) {
    const p = polygons[i];
    const lat = p?.lat;
    const h = p?.height;
    if (!Number.isFinite(lat) || !Number.isFinite(h)) { continue; }

    // Normalized altitude above sea level -> [0..1]
    const above = Math.max(0, (h - seaLevel) / Math.max(1e-6, (1 - seaLevel)));
    const altitudeKm = above * maxElevKm;

    const tSea = seaLevelTempAtLat(lat);
    const t = tSea - altitudeKm * lapseRateCperKm;

    p.temp = t;
    if (t < min) min = t;
    if (t > max) max = t;
    sum += t; n++;
  }

  const mean = n ? (sum / n) : NaN;
  return {count: n, min, max, mean};
}
