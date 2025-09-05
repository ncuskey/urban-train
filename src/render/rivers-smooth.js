// src/render/rivers-smooth.js
// Build smooth edge-following polylines for rivers and render as <path> per chain.
// Width scales by discharge Q at the downstream end of each chain.

function key(pt, k=3) { return `${pt[0].toFixed(k)},${pt[1].toFixed(k)}`; }
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
    const k1 = `${key(b1,tol)}|${key(b2,tol)}`;
    if (KA.has(k1)) return KA.get(k1);
    const k2 = `${key(b2,tol)}|${key(b1,tol)}`;
    if (KA.has(k2)) return KA.get(k2);
  }
  return null;
}

// Chaikin corner cutting (1 pass keeps endpoints)
function chaikin(pts){
  if (!pts || pts.length < 3) return pts || [];
  const out = [pts[0]];
  for (let i=0;i<pts.length-1;i++){
    const p = pts[i], q = pts[i+1];
    const Q = [0.75*p[0]+0.25*q[0], 0.75*p[1]+0.25*q[1]];
    const R = [0.25*p[0]+0.75*q[0], 0.25*p[1]+0.75*q[1]];
    out.push(Q, R);
  }
  out.push(pts[pts.length-1]);
  return out;
}

// Build river chains between nodes where riverInDeg != 1
// Each chain holds: ids[], pts[] (edge midpoints), weight (Q at downstream end)
function buildChains(polygons){
  const N = polygons.length;
  const isStart = new Uint8Array(N);
  const isRiver = (i)=> !!(polygons[i] && polygons[i].isRiver);
  for (let i=0;i<N;i++){
    const p = polygons[i];
    if (!p || !p.isRiver) continue;
    const deg = p.riverInDeg ?? 0;
    if (deg !== 1) isStart[i] = 1; // sources(0) and junctions(>=2)
  }

  const chains = [];
  for (let s=0;s<N;s++){
    if (!isStart[s]) continue;
    // walk downstream until mouth or next junction
    let i = s;
    const ids = [];
    const pts = [];
    while (i >= 0 && isRiver(i)){
      const p = polygons[i];
      const d = p.down;
      if (d < 0 || !isRiver(d)) break;
      const e = sharedEdge(p, polygons[d]);
      if (!e) break;
      // midpoint for this link
      pts.push( mid(e[0], e[1]) );
      ids.push(i);
      // stop at next node (deg != 1) AFTER adding this link
      if ((polygons[d].riverInDeg ?? 0) !== 1) {
        // also add the next edge midpoint if it exists (small extension into node)
        const dd = polygons[d].down;
        if (dd >= 0 && isRiver(dd)) {
          const ed = sharedEdge(polygons[d], polygons[dd]);
          if (ed) pts.push( mid(ed[0], ed[1]) );
        }
        i = d;
        break;
      }
      i = d;
    }
    if (pts.length >= 2) {
      const smoothed = chaikin(pts);
      const tail = ids[ids.length-1];
      const w = Number.isFinite(polygons[tail]?.Q) ? polygons[tail].Q : (polygons[tail]?.flux ?? 0);
      chains.push({ ids, pts: smoothed, w });
    }
  }
  return chains;
}

export function renderRiversSmooth(polygons, gRivers){
  if (!gRivers || gRivers.empty()) return;
  gRivers.raise().attr('data-layer','rivers');

  const chains = buildChains(polygons);
  if (!chains.length){
    gRivers.selectAll('path.river').remove();
    gRivers.selectAll('line.river').remove();
    return;
  }

  // width scale (log-ish)
  let wMin = Infinity, wMax = -Infinity;
  for (const c of chains){ if (c.w < wMin) wMin = c.w; if (c.w > wMax) wMax = c.w; }
  const toLog = v => Math.log10(1 + Math.max(0, v));
  const lmin = toLog(wMin), lmax = toLog(wMax);
  const norm = v => (lmax===lmin ? 0.5 : (toLog(v)-lmin)/(lmax-lmin));
  const width = v => 0.9 + 2.8 * norm(v); // 0.9..3.7 px

  const toD = (pts)=> {
    if (!pts.length) return '';
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i=1;i<pts.length;i++) d += ` L ${pts[i][0]} ${pts[i][1]}`;
    return d;
  };

  // remove old per-link lines if any
  gRivers.selectAll('line.river').remove();

  const sel = gRivers.selectAll('path.river').data(chains, d=>d.ids[0]);
  sel.join(
    enter => enter.append('path')
      .attr('class','river')
      .attr('vector-effect','non-scaling-stroke')
      .attr('fill','none')
      .attr('stroke','#49a8ff')
      .attr('stroke-opacity',0.95)
      .attr('stroke-linecap','round')
      .attr('stroke-linejoin','round')
      .attr('stroke-width', d => width(d.w))
      .attr('d', d => toD(d.pts))
      .style('pointer-events','none'),
    update => update
      .attr('stroke-width', d => width(d.w))
      .attr('d', d => toD(d.pts)),
    exit => exit.remove()
  );
}
