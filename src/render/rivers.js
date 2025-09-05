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
  let fmin = Infinity, fmax = -Infinity;

  for (let i = 0; i < polygons.length; i++) {
    const p = polygons[i];
    if (!p.isRiver || p.down < 0) continue;
    const q = polygons[p.down];
    const a = centroid(p), b = centroid(q);
    data.push({ i, a, b, f: p.flux });
    if (p.flux < fmin) fmin = p.flux;
    if (p.flux > fmax) fmax = p.flux;
  }
  const norm = v => (fmax === fmin ? 0.5 : (v - fmin) / (fmax - fmin));
  const width = v => 0.6 + 2.2 * norm(v); // 0.6..2.8 px

  const sel = gRivers.selectAll("line.river").data(data, d => d.i);
  sel.join(
    enter => enter.append("line")
      .attr("class", "river")
      .attr("vector-effect", "non-scaling-stroke") // consistent width across zoom
      .attr("x1", d => d.a[0]).attr("y1", d => d.a[1])
      .attr("x2", d => d.b[0]).attr("y2", d => d.b[1])
      .attr("stroke", "#49a8ff")
      .attr("stroke-opacity", 0.9)
      .attr("stroke-width", d => width(d.f))
      .attr("stroke-linecap", "round")
      .style("pointer-events", "none"),
    update => update
      .attr("x1", d => d.a[0]).attr("y1", d => d.a[1])
      .attr("x2", d => d.b[0]).attr("y2", d => d.b[1])
      .attr("stroke-width", d => width(d.f)),
    exit => exit.remove()
  );
}
