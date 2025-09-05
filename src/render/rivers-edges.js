// src/render/rivers-edges.js
// Build river segments using shared Voronoi edges between cell and its downstream neighbor.

function key(pt, k=3) { return `${pt[0].toFixed(k)},${pt[1].toFixed(k)}`; }

// Returns [A,B] as the shared edge (two points) or null if none found.
function sharedEdge(polyA, polyB, tol=3) {
  if (!Array.isArray(polyA) || !Array.isArray(polyB)) return null;
  const KA = new Map();
  for (let i=0;i<polyA.length;i++){
    const a1 = polyA[i], a2 = polyA[(i+1)%polyA.length];
    if (!a1 || !a2) continue;
    KA.set(`${key(a1,tol)}|${key(a2,tol)}`, [a1,a2]);
    KA.set(`${key(a2,tol)}|${key(a1,tol)}`, [a2,a1]); // both directions
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

function mid(ptA, ptB) {
  return [(ptA[0] + ptB[0]) * 0.5, (ptA[1] + ptB[1]) * 0.5];
}

export function renderRiversEdges(polygons, gRivers) {
  if (!gRivers || gRivers.empty()) return;
  gRivers.raise().attr('data-layer','rivers');

  const segs = [];
  let wMin = Infinity, wMax = -Infinity;
  for (let i=0;i<polygons.length;i++){
    const p = polygons[i];
    if (!p || !p.isRiver || p.down < 0 || p.isLake) continue;
    const d = polygons[p.down];
    const e = sharedEdge(p, d);
    if (!e) continue;
    const m1 = mid(e[0], e[1]);
    // Find downstream edge midpoint too (with p.down and its own downstream if a river)
    let m2;
    if (d && d.isRiver && d.down >= 0) {
      const dd = polygons[d.down];
      const ed = sharedEdge(d, dd);
      m2 = ed ? mid(ed[0], ed[1]) : m1; // fall back to m1 if missing
    } else {
      // last segment: go from this midpoint into the neighbor's centroid-ish edge mid
      m2 = mid(e[0], e[1]);
    }
    const weight = Number.isFinite(p.Q) ? p.Q : (p.flux ?? 0);
    segs.push({ i, a: m1, b: m2, w: weight });
    if (weight < wMin) wMin = weight;
    if (weight > wMax) wMax = weight;
  }

  const toLog = v => Math.log10(1 + Math.max(0, v));
  const lmin = toLog(wMin), lmax = toLog(wMax);
  const norm = v => (lmax===lmin ? 0.5 : (toLog(v)-lmin)/(lmax-lmin));
  const width = v => 0.8 + 2.6 * norm(v);

  const sel = gRivers.selectAll('line.river').data(segs, d=>d.i);
  sel.join(
    enter => enter.append('line')
      .attr('class','river')
      .attr('vector-effect','non-scaling-stroke')
      .attr('x1', d=>d.a[0]).attr('y1', d=>d.a[1])
      .attr('x2', d=>d.b[0]).attr('y2', d=>d.b[1])
      .attr('stroke', '#49a8ff')
      .attr('stroke-opacity', 0.9)
      .attr('stroke-width', d=>width(d.w))
      .attr('stroke-linecap','round')
      .style('pointer-events','none'),
    update => update
      .attr('x1', d=>d.a[0]).attr('y1', d=>d.a[1])
      .attr('x2', d=>d.b[0]).attr('y2', d=>d.b[1])
      .attr('stroke-width', d=>width(d.w)),
    exit => exit.remove()
  );
}
