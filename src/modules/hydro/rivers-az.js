// src/modules/hydro/rivers-az.js
// A clean, Azgaar-like river pipeline (JSFiddle + blog):
// 1) precipitation (reuse existing climate if present, else baseline)
// 2) resolve depressions (raise until a downhill path exists)
// 3) downhill routing & flux accumulation
// 4) channel selection with generous threshold (many tributaries)
// 5) build smooth chains along shared Voronoi edges
//
// Blog ref: "River systems" (Azgaar, 2017) — precip→drainage approach. 
// https://azgaar.wordpress.com/2017/05/08/river-systems/
//
// Rendering happens in render/rivers-az.js using d3.curveCatmullRom. 
// Docs: https://d3js.org/d3-shape/curve

// ---------- helpers ----------
const SEA = 0.2; // default sea level guard
const EPS = 1e-3;

const isWater = (p, seaLevel)=> p && p.height < seaLevel;

function key(pt, k=3){ return `${pt[0].toFixed(k)},${pt[1].toFixed(k)}`; }
function mid(a,b){ return [(a[0]+b[0])*0.5, (a[1]+b[1])*0.5]; }

function sharedEdge(polyA, polyB, tol=3){
  if (!Array.isArray(polyA) || !Array.isArray(polyB)) return null;
  const KA = new Map();
  for (let i=0;i<polyA.length;i++){
    const a1 = polyA[i], a2 = polyA[(i+1)%polyA.length];
    if (!a1 || !a2) continue;
    KA.set(`${key(a1,tol)}|${key(a2,tol)}`, [a1,a2]);
    KA.set(`${key(a2,tol)}|${key(a1,tol)}`, [a2,a1]);
  }
  for (let j=0;j<polyB.length;j++){
    const b1 = polyB[j], b2 = polyB[(j+1)%polyB.length];
    if (!b1 || !b2) continue;
    const k1 = `${key(b1,tol)}|${key(b2,tol)}`, k2 = `${key(b2,tol)}|${key(b1,tol)}`;
    if (KA.has(k1)) return KA.get(k1);
    if (KA.has(k2)) return KA.get(k2);
  }
  return null;
}

// ---------- 1) precipitation ----------
function ensurePrecip(polygons){
  // Reuse climate precipitation if present; else baseline (like JSFiddle's 0.02 + rays).
  let sum = 0, cnt = 0;
  for (const p of polygons){
    const v = (p && (p.precip ?? p.prec ?? p.P)) ?? 0;
    if (p){ p._prec = v > 0 ? v : 0.02; sum += p._prec; cnt++; }
  }
  const mean = cnt ? sum/cnt : 0.02;
  return { mean };
}

// ---------- 2) resolve depressions (simple raise-to-drain) ----------
function resolveDepressions(polygons, seaLevel=SEA, maxIters=10){
  // Only for land; repeatedly raise any cell ≤ its lowest neighbor by EPS
  for (let iter=0; iter<maxIters; iter++){
    let fixes = 0;
    for (let i=0;i<polygons.length;i++){
      const p = polygons[i]; if (!p || p.height < seaLevel) continue;
      let minH = Infinity;
      for (const nb of (p.neighbors||[])){
        const q = polygons[nb]; if (!q) continue;
        if (q.height < minH) minH = q.height;
      }
      if (!(minH < Infinity)) continue;
      if (p.height <= minH + EPS){
        p.height = minH + EPS;
        fixes++;
      }
    }
    if (!fixes) break;
  }
}

// ---------- 3) downhill routing & flux ----------
function routeDownhillAndFlux(polygons, seaLevel=SEA){
  const landIds = [];
  for (let i=0;i<polygons.length;i++) if (polygons[i] && polygons[i].height >= seaLevel) landIds.push(i);

  // sort by height desc (topo order)
  landIds.sort((a,b)=> polygons[b].height - polygons[a].height);

  // set downhill neighbor (min height among neighbors)
  for (const i of landIds){
    const p = polygons[i];
    let minH = p.height, down = -1;
    for (const nb of (p.neighbors||[])){
      const q = polygons[nb]; if (!q) continue;
      if (q.height < minH){ minH = q.height; down = nb; }
    }
    p.down = down;
  }

  // init flux with precipitation baseline
  for (const i of landIds){
    const p = polygons[i];
    p.flux = (p._prec ?? 0.02); // baseline
    p.isRiver = false;
    p.riverInDeg = 0;
    p.Q = 0;
  }

  // accumulate downstream
  for (const i of landIds){
    const p = polygons[i];
    if (p.down >= 0) {
      polygons[p.down].flux = (polygons[p.down].flux || 0) + p.flux;
      polygons[p.down].riverInDeg = (polygons[p.down].riverInDeg|0) + 1;
    }
  }

  return { landIds };
}

// ---------- 4) select channels (many tributaries) ----------
function selectChannels(polygons, landIds, seaLevel){
  // New: distribution-aware threshold using an upper quantile of land flux
  const landFlux = polygons
    .filter(p => (p.height ?? 0) >= seaLevel)      // land only
    .map(p => +p.flux || 0)
    .filter(f => f > 0)
    .sort((a,b) => a - b);
  const q = landFlux.length ? landFlux[Math.floor(0.80 * (landFlux.length - 1))] : 0; // 80th percentile
  // Provide a small absolute floor so tiny maps still produce sources
  let threshold = Math.max(q, 0.02);

  let segments=0, sources=0, mouths=0, confluences=0;

  for (const i of landIds){
    const p = polygons[i];
    const dn = p.down >= 0 ? polygons[p.down] : null;
    const slope = dn ? Math.max(0, p.height - dn.height) : 0;

    const near  = p.flux >= 0.8*threshold;
    const steep = slope >= 0.10; // small bias like JSFiddle-style headwaters
    p.isRiver = (!!dn) && (p.flux >= threshold || (near && steep));

    if (p.isRiver) {
      p.Q = p.flux; // discharge proxy
      segments++;
      if ((p.riverInDeg|0) === 0) sources++;
      if (p.down < 0 || !dn.isRiver) mouths++;
      if ((p.riverInDeg|0) >= 2) confluences++;
    } else {
      p.Q = 0;
    }
  }

  // Safety net: ensure at least a few sources exist by relaxing the cutoff
  if (sources < Math.max(8, Math.floor(Math.sqrt(polygons.length)/4))) {
    const topK = polygons
      .filter(p => (p.height ?? 0) >= seaLevel && (+p.flux || 0) > 0)
      .sort((a,b) => (+b.flux||0) - (+a.flux||0))
      .slice(0, 50); // limit work
    const kth = topK.at(-1)?.flux ?? threshold;
    threshold = Math.min(threshold, kth);
    for (const i of landIds){
      const p = polygons[i], dn = p.down >= 0 ? polygons[p.down] : null;
      const near = p.flux >= 0.8*threshold, slope = dn ? Math.max(0, p.height - dn.height) : 0;
      const steep = slope >= 0.10;
      p.isRiver = (!!dn) && (p.flux >= threshold || (near && steep));
    }
  }

  return { threshold, segments, sources, mouths, confluences };
}

// ---------- 5) build chains along shared edges (midpoints + meander) ----------
function addMeander(p, q, amt=0.35){
  const vx = q[0]-p[0], vy = q[1]-p[1];
  const L = Math.hypot(vx,vy) || 1;
  const nx = -vy/L, ny = vx/L;
  const m1 = [p[0] + vx/3,   p[1] + vy/3];
  const m2 = [p[0] + 2*vx/3, p[1] + 2*vy/3];
  const j  = (Math.random()<0.5?1:-1) * amt;
  return [[m1[0] + j*nx, m1[1] + j*ny], [m2[0] - j*nx, m2[1] - j*ny]];
}

function buildChains(polygons, seaLevel=SEA){
  const N = polygons.length;
  const isRiver = i => !!(polygons[i] && polygons[i].isRiver);
  const isWater = i => !!(polygons[i] && polygons[i].height < seaLevel);

  // Helper to get a plotting point for a cell (center/site), Azgaar-style
  const pt = p => {
    if (!p) return null;
    if (Number.isFinite(p.x) && Number.isFinite(p.y)) return [p.x, p.y];
    if (Number.isFinite(p.cx) && Number.isFinite(p.cy)) return [p.cx, p.cy];
    if (p.data && Number.isFinite(p.data[0]) && Number.isFinite(p.data[1])) return [p.data[0], p.data[1]];
    // last resort: average polygon vertices if present
    if (Array.isArray(p) && p.length && Array.isArray(p[0])) {
      let sx=0, sy=0; for (const v of p){ sx+=v[0]; sy+=v[1]; }
      return [sx/p.length, sy/p.length];
    }
    return null;
  };

  // Starts: sources (inDeg==0) and junctions (inDeg>=2) among river cells
  const starts = [];
  for (let i=0;i<N;i++){
    const p = polygons[i]; if (!p || !p.isRiver) continue;
    const indeg = p.riverInDeg|0;
    if (indeg !== 1) starts.push(i);
  }
  // Fallback: if none detected, pick any river cell whose upstream neighbor isn't a river
  if (!starts.length){
    for (let i=0;i<N;i++){
      const p = polygons[i]; if (!p || !p.isRiver) continue;
      const upIsRiver = (p.up || []).some(u => polygons[u]?.isRiver);
      if (!upIsRiver) { starts.push(i); break; }
    }
  }

  const chains = [];
  for (const s of starts){
    let i = s;
    const ids = [];
    const pts = [];
    // seed first point at the cell center
    const p0 = pt(polygons[i]);
    if (p0) pts.push(p0);
    // walk downstream via cell centers, inserting meander controls each step
    while (i >= 0 && isRiver(i)){
      const p = polygons[i];
      const d = p.down;
      if (d < 0) break;
      const q = polygons[d];
      const pq = pt(q);
      if (!pq) break;
      const prev = pts[pts.length-1];
      const [c1, c2] = addMeander(prev, pq, 0.35);
      pts.push(c1, c2, pq);
      ids.push(i);
      if (!isRiver(d) || (polygons[d].riverInDeg|0)!==1) { i = d; break; }
      i = d;
    }

    // Tiny distributaries at the mouth (fan to nearby ocean neighbors' centers)
    if (ids.length){
      const last = ids[ids.length-1];
      const pLast = polygons[last], d = pLast.down;
      if (d >= 0 && !isRiver(d) && !isWater(last) && isWater(d) && pLast.Q > 0){
        const from = pts[pts.length-1];
        const fans = [];
        for (const nb of (pLast.neighbors||[])){
          if (isWater(nb)) {
            const wpt = pt(polygons[nb]);
            if (wpt) fans.push(wpt);
          }
        }
        for (let k=0;k<Math.min(2, fans.length);k++){
          const to = fans[k];
          const [c1,c2] = addMeander(from, to, 0.25);
          chains.push({ id:`delta-${last}-${k}`, pts:[from, c1, c2, to], Q: Math.max(1, pLast.Q*0.6) });
        }
      }
    }

    if (pts.length >= 2){
      const tail = ids[ids.length-1] ?? s;
      const w = Number.isFinite(polygons[tail]?.Q) ? polygons[tail].Q : (polygons[tail]?.flux ?? 0);
      chains.push({ id:`chain-${s}`, pts, Q:w });
    }
  }
  return chains;
}

// ---------- public API ----------
export function buildAzRivers(polygons, { seaLevel = SEA } = {}){
  const { mean: meanPrec } = ensurePrecip(polygons);
  resolveDepressions(polygons, seaLevel, /*maxIters*/ 8);
  const { landIds } = routeDownhillAndFlux(polygons, seaLevel);
  const pick = selectChannels(polygons, landIds, seaLevel);
  const chains = buildChains(polygons, seaLevel);

  return {
    chains,
    stats: {
      seaLevel,
      meanPrec,
      ...pick,
      chains: chains.length
    }
  };
}