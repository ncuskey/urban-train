// src/render/rivers-curves.js
// Smooth, Azgaar-like river rendering with Catmull–Rom, meander, and small deltas.

function key(pt, k=3){ return `${pt[0].toFixed(k)},${pt[1].toFixed(k)}`; }
function mid(a,b){ return [(a[0]+b[0])*0.5, (a[1]+b[1])*0.5]; }
function sharedEdge(A,B,tol=3){
  if (!Array.isArray(A)||!Array.isArray(B)) return null;
  const M=new Map();
  for (let i=0;i<A.length;i++){
    const a1=A[i], a2=A[(i+1)%A.length]; if (!a1||!a2) continue;
    M.set(`${key(a1,tol)}|${key(a2,tol)}`, [a1,a2]);
    M.set(`${key(a2,tol)}|${key(a1,tol)}`, [a2,a1]);
  }
  for (let j=0;j<B.length;j++){
    const b1=B[j], b2=B[(j+1)%B.length]; if (!b1||!b2) continue;
    const k1=`${key(b1,tol)}|${key(b2,tol)}`, k2=`${key(b2,tol)}|${key(b1,tol)}`;
    if (M.has(k1)) return M.get(k1);
    if (M.has(k2)) return M.get(k2);
  }
  return null;
}

function addMeander(p, q, amt=0.4) {
  // Insert two points at 1/3 and 2/3 with a small perpendicular offset
  const v = [q[0]-p[0], q[1]-p[1]];
  const L = Math.hypot(v[0], v[1]) || 1;
  const n = [-v[1]/L, v[0]/L]; // unit normal
  const m1 = [p[0] + v[0]/3, p[1] + v[1]/3];
  const m2 = [p[0] + 2*v[0]/3, p[1] + 2*v[1]/3];
  const j  = (Math.random() < 0.5 ? 1 : -1) * amt;
  return [[m1[0] + j*n[0], m1[1] + j*n[1]], [m2[0] - j*n[0], m2[1] - j*n[1]]];
}

function buildChains(polygons, seaLevel=0.2){
  const N = polygons.length, chains = [];
  const isRiver = (i)=> !!(polygons[i] && polygons[i].isRiver);
  const isWater = (i)=> !!polygons[i] && (polygons[i].height < seaLevel);

  // starts: sources (inDeg==0) and junctions (inDeg>=2)
  const starts = [];
  for (let i=0;i<N;i++){
    const p = polygons[i]; if (!p || !p.isRiver) continue;
    const d = p.riverInDeg|0; if (d !== 1) starts.push(i);
  }

  for (const s of starts){
    let i = s;
    const pts = []; const ids = [];
    // build along shared-edge midpoints
    while (i >= 0 && isRiver(i)){
      const p = polygons[i], d = p.down;
      if (d < 0) break;
      const e = sharedEdge(p, polygons[d]);
      if (!e) break;
      const m = mid(e[0], e[1]);
      if (!pts.length) pts.push(m);
      else {
        // insert meander control points before adding m
        const prev = pts[pts.length-1];
        const [c1,c2] = addMeander(prev, m, /*amt*/ 0.35);
        pts.push(c1, c2, m);
      }
      ids.push(i);
      // stop at next junction/mouth
      if (!isRiver(d) || (polygons[d].riverInDeg|0)!==1) { i = d; break; }
      i = d;
    }

    // tiny deltas: split last segment into 2 short distributaries if mouth touches ≥2 ocean neighbors
    if (ids.length){
      const last = ids[ids.length-1];
      const p = polygons[last], d = p.down;
      if (d >= 0 && !isRiver(d) && p.Q > 0 && p.height >= seaLevel) {
        const cell = polygons[d]; // typically water or coast
        // find this cell's ocean-edge neighbors relative to p
        const oceanEdges = [];
        for (const nb of p.neighbors || []) {
          if (isWater(nb)) {
            const e = sharedEdge(p, polygons[nb]);
            if (e) oceanEdges.push(mid(e[0], e[1]));
          }
        }
        // add up to two short fans
        for (let k=0;k<Math.min(2, oceanEdges.length);k++){
          const from = pts[pts.length-1];
          const to   = oceanEdges[k];
          const [c1,c2] = addMeander(from, to, 0.25);
          chains.push({ ids: ids.slice(), // reuse ids as key base
                        pts: [from, c1, c2, to],
                        w  : Math.max(1, p.Q*0.6) });
        }
      }
    }

    if (pts.length >= 2) {
      const w = Number.isFinite(polygons[ids[ids.length-1]]?.Q)
        ? polygons[ids[ids.length-1]].Q
        : (polygons[ids[ids.length-1]]?.flux ?? 0);
      chains.push({ ids, pts, w });
    }
  }
  return chains;
}

export function renderRiversCurves(polygons, gRivers, {seaLevel=0.2}={}){
  if (!gRivers || gRivers.empty()) return;
  gRivers.raise().attr('data-layer','rivers');

  const chains = buildChains(polygons, seaLevel);
  // width scale (log-ish on Q)
  let wMin=Infinity, wMax=-Infinity; for (const c of chains){ if (c.w<wMin) wMin=c.w; if (c.w>wMax) wMax=c.w; }
  const toLog=v=>Math.log10(1+Math.max(0,v));
  const lmin=toLog(wMin), lmax=toLog(wMax);
  const norm=v=>(lmax===lmin?0.5:(toLog(v)-lmin)/(lmax-lmin));
  const width=v=> 0.9 + 2.8*norm(v);

  // Use d3-shape Catmull–Rom (like JSFiddle).
  const line = d3.line()
    .x(d=>d[0]).y(d=>d[1])
    .curve(d3.curveCatmullRom.alpha(0.95));

  // clean old primitives
  gRivers.selectAll('line.river').remove();

  const sel = gRivers.selectAll('path.river').data(chains, d=>d.ids[0]);
  sel.join(
    e => e.append('path')
      .attr('class','river')
      .attr('vector-effect','non-scaling-stroke')
      .attr('fill','none')
      .attr('stroke','#4D83AE')
      .attr('stroke-opacity',0.95)
      .attr('stroke-linecap','round')
      .attr('stroke-linejoin','round')
      .attr('stroke-width', d=>width(d.w))
      .attr('d', d=>line(d.pts))
      .style('pointer-events','none'),
    u => u
      .attr('stroke-width', d=>width(d.w))
      .attr('d', d=>line(d.pts)),
    x => x.remove()
  );
}
