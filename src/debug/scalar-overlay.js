// src/debug/scalar-overlay.js
// Colors each land polygon by a scalar field: "height" | "temp" | "prec"
// Safe to call repeatedly (joins by index). Uses an SVG <polygon> per cell.

function toPoints(poly) {
  return poly.map(p => `${p[0]},${p[1]}`).join(" ");
}

export function scalarColor(field, t) {
  // t in [0..1]
  if (!Number.isFinite(t)) return "none";
  if (field === "height") {
    // green→dark brown
    const h = 110 - 50 * t, s = 60 + 30 * t, l = 45 - 15 * t;
    return `hsl(${h}, ${s}%, ${l}%)`;
  }
  if (field === "temp") {
    // blue→yellow→red
    const h = (1 - t) * 240; // 240=blue → 0=red
    return `hsl(${h}, 85%, 50%)`;
  }
  // precip: white→blue
  const l = 95 - 60 * t;
  return `hsl(210, 80%, ${l}%)`;
}

export function computeScalarDomain(polygons, field, seaLevel = 0.2) {
  let vals = [], sum = 0;
  for (const p of polygons) {
    if (!p || !p.length) continue;
    if (p.height != null && p.height < seaLevel) continue; // land-only
    const v = p[field];
    if (Number.isFinite(v)) { vals.push(v); sum += v; }
  }
  if (!vals.length) return { count: 0, min: NaN, mean: NaN, max: NaN };
  const min = Math.min(...vals), max = Math.max(...vals), mean = sum / vals.length;
  return { count: vals.length, min, mean, max };
}

export function renderScalarOverlay(polygons, g, { field = "height", seaLevel = 0.2 } = {}) {
  if (!g || g.empty() || !Array.isArray(polygons)) return;

  const domain = computeScalarDomain(polygons, field, seaLevel);
  if (!domain.count) {
    g.selectAll("polygon.scalar-cell").remove();
    return;
  }
  const vmin = domain.min, vmax = domain.max;
  const norm = v => (vmax === vmin ? 0.5 : (v - vmin) / (vmax - vmin));

  const data = polygons.map((p, i) => ({ i, p, v: p[field] }));
  const sel = g.selectAll("polygon.scalar-cell").data(
    data.filter(d => Array.isArray(d.p) && d.p.length && (d.p.height ?? 1) >= seaLevel && Number.isFinite(d.v)),
    d => d.i
  );

  sel.join(
    enter => enter.append("polygon")
      .attr("class", "scalar-cell")
      .attr("points", d => toPoints(d.p))
      .attr("fill", d => scalarColor(field, norm(d.v)))
      .attr("stroke", "none")
      .attr("opacity", 1)
      .style("pointer-events", "none"),
    update => update
      .attr("points", d => toPoints(d.p))
      .attr("fill", d => scalarColor(field, norm(d.v))),
    exit => exit.remove()
  );
}
