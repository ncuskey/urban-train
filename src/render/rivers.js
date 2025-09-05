// src/render/rivers.js
// Draws rivers as centroid-to-centroid line segments, width scaled by flux.
// Renders into the <g id="rivers" data-layer="rivers"> group.

function centroid(poly) {
  let x = 0, y = 0, n = 0;
  for (const p of poly) if (p && p.length >= 2) { x += p[0]; y += p[1]; n++; }
  return n ? [x/n, y/n] : [0,0];
}

export function renderRivers(polygons, gRivers) {
  if (!gRivers || gRivers.empty()) return;
  // Make sure rivers draw above land/biomes/scalar overlays
  gRivers.raise().attr('data-layer', 'rivers');
  
  const data = [];
  let wMin = Infinity, wMax = -Infinity;

  for (let i = 0; i < polygons.length; i++) {
    const p = polygons[i];
    if (!p.isRiver || p.down < 0) continue;
    if (p.isLake) continue; // don't draw inside lake surface
    const q = polygons[p.down];
    const a = centroid(p), b = centroid(q);
    const weight = Number.isFinite(p.Q) ? p.Q : (p.flux ?? 0);
    data.push({ i, a, b, w: weight });
    if (weight < wMin) wMin = weight;
    if (weight > wMax) wMax = weight;
  }
  // log-like scaling for dynamic range, but without Math.log(0)
  const toLog = v => Math.log10(1 + Math.max(0, v));
  const lmin = toLog(wMin), lmax = toLog(wMax);
  const norm = v => (lmax === lmin ? 0.5 : (toLog(v) - lmin) / (lmax - lmin));
  const width = v => 0.8 + 2.6 * norm(v); // 0.8..3.4 px

  const sel = gRivers.selectAll("line.river").data(data, d => d.i);
  sel.join(
    enter => enter.append("line")
      .attr("class", "river")
      .attr("vector-effect", "non-scaling-stroke") // consistent width across zoom
      .attr("x1", d => d.a[0]).attr("y1", d => d.a[1])
      .attr("x2", d => d.b[0]).attr("y2", d => d.b[1])
      .attr("stroke", "#49a8ff")
      .attr("stroke-opacity", 0.9)
      .attr("stroke-width", d => width(d.w))
      .attr("stroke-linecap", "round")
      .style("pointer-events", "none"),
    update => update
      .attr("x1", d => d.a[0]).attr("y1", d => d.a[1])
      .attr("x2", d => d.b[0]).attr("y2", d => d.b[1])
      .attr("stroke-width", d => width(d.w)),
    exit => exit.remove()
  );
}
