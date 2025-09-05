// src/modules/climate.js
// Minimal climate temperature model:
//  - Sea-level temperature varies by latitude (warm equator -> cold poles)
//  - Temperature drops with altitude (standard lapse rate, ~11.7°F/km)
//
// Inputs:
//   polygons[*].lat   (degrees, set earlier by assignLatitudes)
//   polygons[*].height (normalized 0..1; seaLevel threshold provided)
//   map: { width, height, latTop, latBottom, ... } (from defineMapCoordinates)
//
// Output:
//   polygons[*].temp (°F)

function seaLevelTempAtLat(latDeg) {
  // Piecewise-linear bands:
  //   0°  -> 81°F (equator)
  //  60°  -> 45°F (mid-lat)
  //  90°  -> -13°F (poles)
  const abs = Math.abs(latDeg);
  const t0 = 81, t60 = 45, t90 = -13;
  if (abs <= 60) {
    return t0 + (t60 - t0) * (abs / 60);
  } else {
    return t60 + (t90 - t60) * ((abs - 60) / 30);
  }
}

export function assignTemperatures(
  polygons,
  map,
  { seaLevel = 0.2, maxElevKm = 5, lapseRateFperKm = 11.7 } = {}
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
    const t = tSea - altitudeKm * lapseRateFperKm;

    p.temp = t;
    if (t < min) min = t;
    if (t > max) max = t;
    sum += t; n++;
  }

  const mean = n ? (sum / n) : NaN;
  return {count: n, min, max, mean};
}

// --- Step 5b: Precipitation -----------------------------------------------
function bandMoistureFactor(absLat) {
  // Equator wet, subtropics dry, mid-lats wetter, poles drier
  if (absLat < 5) return 1.5;       // ITCZ
  if (absLat < 20) return 1.2;      // tropics
  if (absLat < 35) return 0.6;      // subtropical highs (deserts)
  if (absLat < 55) return 1.0;      // westerlies
  if (absLat < 70) return 0.9;      // subpolar
  return 0.6;                        // polar
}

function prevailingWindX(absLat) {
  // +1: west→east (westerlies), -1: east→west (easterlies)
  // trades (0–30) & polar (60–90) are easterlies; mid-lats are westerlies
  return (absLat < 30 || absLat >= 60) ? -1 : +1;
}

export function assignPrecipitation(
  polygons,
  map,
  {
    seaLevel = 0.2,
    pickupRate = 0.12,      // how fast wind picks moisture over water
    precipRate = 0.08,      // how fast humidity rains out
    orographicCoeff = 1.5,  // extra rain on rising terrain
    humidityMax = 3.0       // cap for humidity bucket
  } = {}
) {
  if (!Array.isArray(polygons) || !polygons.length || !map) return {count: 0};

  // init precipitation field
  for (const p of polygons) p.prec = 0;

  // group cells by integer Y "row", with centroid X for sweep ordering
  const rows = new Map();
  const { height, latTop, latBottom } = map;
  const dLat = latBottom - latTop;

  function centroidXY(poly) {
    let x = 0, y = 0, n = 0;
    for (const pt of poly) {
      if (pt && pt.length >= 2) { x += pt[0]; y += pt[1]; n++; }
    }
    if (!n) return [0, 0];
    return [x / n, y / n];
  }

  polygons.forEach((p, i) => {
    const [cx, cy] = centroidXY(p);
    p.__cx = cx; p.__cy = cy; // ephemeral
    const row = Math.max(0, Math.min(height - 1, Math.floor(cy)));
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row).push(i);
  });

  // sweep each row in wind direction
  for (const [row, idxs] of rows) {
    const latRow = latTop + (row / height) * dLat;
    const absLat = Math.abs(latRow);
    const windX = prevailingWindX(absLat);
    const band = bandMoistureFactor(absLat);

    idxs.sort((a, b) => polygons[a].__cx - polygons[b].__cx);
    if (windX < 0) idxs.reverse(); // east→west: start from right

    let h = 0;                // humidity "bucket"
    let prevAbove = 0;        // previous normalized elevation above sea

    for (const i of idxs) {
      const p = polygons[i];
      const overWater = p.height < seaLevel;
      const above = Math.max(0, (p.height - seaLevel) / Math.max(1e-6, (1 - seaLevel)));

      if (overWater) {
        // pick up moisture over water
        h = Math.min(humidityMax, h + pickupRate * band);
        // small drizzle over open water (optional)
        p.prec += h * precipRate * 0.05;
      } else {
        // orographic boost when climbing
        const climb = Math.max(0, above - prevAbove);
        const orog = 1 + orographicCoeff * climb;
        const deposit = h * precipRate * band * orog;
        p.prec += deposit;
        h = Math.max(0, h - deposit);
      }

      prevAbove = above;
    }
  }

  // cleanup + stats
  let min = +Infinity, max = -Infinity, sum = 0, n = 0;
  for (const p of polygons) {
    if (!Number.isFinite(p.prec) || p.prec < 0) p.prec = 0;
    if (p.prec < min) min = p.prec;
    if (p.prec > max) max = p.prec;
    sum += p.prec; n++;
    delete p.__cx; delete p.__cy; // drop ephemeral fields
  }
  return {count: n, min, mean: n ? sum / n : NaN, max};
}
