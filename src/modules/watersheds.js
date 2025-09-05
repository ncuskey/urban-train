// src/modules/watersheds.js
// Compute watershed IDs (by mouth), Strahler/Shreve orders, and discharge Q.
// Expects: polygons[*] with {neighbors[], isRiver, riverInDeg, down, lat, lon, height, prec, isLake}
// Writes per river cell:
//   p.basinId: index of the river mouth this cell drains to
//   p.orderStrahler: 1..N
//   p.orderShreve:   1..N
//   p.Q: discharge proxy (precip * area + upstream)
//   p.segLenKm: centroid->downstream distance (km)

import { haversineKm } from "./geo.js";

function centroid(poly) {
  let x = 0, y = 0, n = 0;
  for (const pt of poly) if (pt && pt.length >= 2) { x += pt[0]; y += pt[1]; n++; }
  return n ? [x/n, y/n] : [0,0];
}

// Pixel-to-km scale (X depends on latitude; Y depends on map vertical degree scale)
function makePxKm(map) {
  const KM_PER_DEG_LAT = 111.32;
  const degPerPxY = Math.abs((map.latBottom - map.latTop) / map.height);
  const kmPerPxY = KM_PER_DEG_LAT * degPerPxY;
  const kmPerPxXAtLat = (lat) => (map.kmPerPxAtEquator ?? (KM_PER_DEG_LAT * (map.lonRight - map.lonLeft) / map.width)) * Math.cos(lat * Math.PI/180);
  return { kmPerPxY, kmPerPxXAtLat };
}

// Shoelace area in pixel^2; we'll convert to km^2 with local scale
function polygonAreaPx2(poly) {
  let s = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i+1)%n];
    s += x1*y2 - x2*y1;
  }
  return Math.abs(s) / 2;
}

export function computeWatersheds(polygons, map, { seaLevel = 0.2 } = {}) {
  if (!Array.isArray(polygons) || !polygons.length) return { basins: 0, qSum: 0, qAtMouths: 0 };
  const N = polygons.length;

  // Precompute per-cell area (km^2) and segment length to downstream (km)
  const { kmPerPxY, kmPerPxXAtLat } = makePxKm(map);
  const areaKm2 = new Float64Array(N);
  const segLenKm = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const p = polygons[i];
    const aPx2 = Array.isArray(p) ? polygonAreaPx2(p) : 0;
    const kmPerPxX = kmPerPxXAtLat(p.lat ?? 0);
    areaKm2[i] = aPx2 * kmPerPxX * kmPerPxY;
    if (p.isRiver && p.down >= 0) {
      const q = polygons[p.down];
      const c1 = centroid(p), c2 = centroid(q);
      // approximate geodesic length with lat/lon if available, else pixel distance scaled
      segLenKm[i] = (Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isFinite(q.lat) && Number.isFinite(q.lon))
        ? haversineKm(p, q)
        : Math.hypot(c2[0]-c1[0], c2[1]-c1[1]) * Math.max(kmPerPxX, kmPerPxY);
    } else segLenKm[i] = 0;
    p.segLenKm = segLenKm[i];
  }

  // Build river graph children lists (river-only)
  const children = Array.from({length: N}, () => []);
  const mouths = [];
  const sources = [];
  for (let i = 0; i < N; i++) {
    const p = polygons[i];
    if (!p.isRiver) continue;
    const d = p.down;
    if (d >= 0 && polygons[d].isRiver) children[d].push(i);
    if ((p.riverInDeg ?? 0) === 0) sources.push(i);
    if (d < 0 || !polygons[d].isRiver) mouths.push(i);
  }

  // Topological order from sources downstream (Kahn-like using river-only indegree)
  const indeg = new Int32Array(N);
  // Compute indegree by counting parents (river-only)
  for (let i = 0; i < N; i++) if (polygons[i].isRiver) {
    const d = polygons[i].down;
    if (d >= 0 && polygons[d].isRiver) indeg[d]++;
  }

  // Initialize orders and discharge (local)
  for (let i = 0; i < N; i++) {
    const p = polygons[i];
    p.orderStrahler = 0;
    p.orderShreve = 0;
    p.Q = 0;
    p.basinId = -1;
  }

  // Queue sources
  const q = [];
  for (const s of sources) {
    const p = polygons[s];
    p.orderStrahler = 1;
    p.orderShreve = 1;
    p.Q = Math.max(0, (p.prec ?? 0)) * areaKm2[s]; // local runoff proxy
    q.push(s);
  }

  // Propagate downstream
  while (q.length) {
    const i = q.shift();
    const p = polygons[i];
    const d = p.down;
    if (d >= 0 && polygons[d].isRiver) {
      const dn = polygons[d];

      // Accumulate Shreve (sum of upstream)
      dn.orderShreve += p.orderShreve;

      // Strahler: track max and second max by reading current + incoming
      // We keep max in dn._maxStr (tmp) and a boolean if duplicated
      dn._maxStr = Math.max(dn._maxStr ?? 0, p.orderStrahler);
      dn._dupMax = (dn._dupMax ?? false) || (dn._maxStr === p.orderStrahler && (dn._seenMax ?? 0) > 0);
      dn._seenMax = (dn._seenMax ?? 0) + (p.orderStrahler === dn._maxStr ? 1 : 0);

      // Discharge
      dn.Q += p.Q;

      // Length: store longest upstream path (km) if you want later
      dn._lenUp = Math.max(dn._lenUp ?? 0, (p._lenUp ?? 0) + (p.segLenKm ?? 0));

      // Basin assignment: mouths become basin seeds later; for now leave -1
      indeg[d]--;
      if (indeg[d] === 0) {
        // finalize Strahler for dn
        dn.orderStrahler = (dn._seenMax >= 2) ? (dn._maxStr + 1) : (dn._maxStr || 1);
        // add local runoff
        dn.Q += Math.max(0, (dn.prec ?? 0)) * areaKm2[d];
        q.push(d);
      }
    }
  }

  // Assign basins by walking upstream from each mouth
  let basinCounter = 0;
  for (const m of mouths) {
    const bid = basinCounter++;
    const stack = [m];
    while (stack.length) {
      const i = stack.pop();
      const p = polygons[i];
      if (!p.isRiver || p.basinId !== -1) continue;
      p.basinId = bid;
      for (const c of children[i]) stack.push(c);
    }
  }

  // Sum discharge at mouths & overall for rough mass balance
  let qAtMouths = 0, qSum = 0;
  for (let i = 0; i < N; i++) {
    const p = polygons[i];
    if (!p.isRiver) continue;
    qSum += p.Q;
    const d = p.down;
    if (d < 0 || !polygons[d].isRiver) qAtMouths += p.Q;
    // clean temp fields
    delete p._maxStr; delete p._dupMax; delete p._seenMax; delete p._lenUp;
  }

  return {
    basins: basinCounter,
    sources: sources.length,
    mouths: mouths.length,
    qSum,
    qAtMouths
  };
}
