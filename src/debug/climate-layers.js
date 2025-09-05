// src/debug/climate-layers.js
// Lightweight per-cell dot renderers (SVG circles at centroids)

function centroid(poly) {
  let x = 0, y = 0, n = 0;
  for (const p of poly) { if (p && p.length >= 2) { x += p[0]; y += p[1]; n++; } }
  return n ? [x/n, y/n] : [0, 0];
}

function rampHsl(t) {
  // 0→blue, 0.5→yellow, 1→red (simple HSL ramp)
  const h = (1 - t) * 240; // 240=blue → 0=red
  return `hsl(${h}, 90%, 50%)`;
}

export function renderTempDebug(polygons, g) {
  if (!g || g.empty() || !Array.isArray(polygons)) return;
  const temps = polygons.map(p => p.temp).filter(Number.isFinite);
  if (!temps.length) return; // nothing to draw yet
  const min = Math.min(...temps), max = Math.max(...temps);
  const norm = (v) => (max === min ? 0.5 : (v - min) / (max - min));

  const data = polygons.map((p, i) => ({ i, p, c: centroid(p), t: p.temp }));
  const sel = g.selectAll("circle.temp-dot").data(data.filter(d => Number.isFinite(d.t)), d => d.i);
  sel.join(
    enter => enter.append("circle")
      .attr("class", "temp-dot")
      .attr("r", 1.6)
      .attr("cx", d => d.c[0])
      .attr("cy", d => d.c[1])
      .attr("fill", d => rampHsl(norm(d.t)))
      .attr("fill-opacity", 0.8),
    update => update
      .attr("cx", d => d.c[0])
      .attr("cy", d => d.c[1])
      .attr("fill", d => rampHsl(norm(d.t))),
    exit => exit.remove()
  );
}

export function renderPrecipDebug(polygons, g) {
  if (!g || g.empty() || !Array.isArray(polygons)) return;
  const precs = polygons.map(p => p.prec).filter(Number.isFinite);
  if (!precs.length) return;
  const max = Math.max(...precs) || 1;

  const data = polygons.map((p, i) => ({ i, p, c: centroid(p), r: p.prec }));
  const sel = g.selectAll("rect.prec-dot").data(data.filter(d => Number.isFinite(d.r)), d => d.i);
  sel.join(
    enter => enter.append("rect")
      .attr("class", "prec-dot")
      .attr("x", d => d.c[0] - 1.2)
      .attr("y", d => d.c[1] - 1.2)
      .attr("width", 2.4)
      .attr("height", 2.4)
      .attr("fill", d => `hsl(210, 90%, ${70 - 50*(d.r/max)}%)`)
      .attr("fill-opacity", 0.85),
    update => update
      .attr("x", d => d.c[0] - 1.2)
      .attr("y", d => d.c[1] - 1.2)
      .attr("fill", d => `hsl(210, 90%, ${70 - 50*(d.r/max)}%)`),
    exit => exit.remove()
  );
}
