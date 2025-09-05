// src/render/rivers-az.js
// Draw Azgaar-style rivers as Catmull–Rom curves with Q-scaled width.
// D3 curve docs: https://d3js.org/d3-shape/curve

export function renderRiversAz(chains, { gRivers, gShade }){
  if (!gRivers || gRivers.empty()) return;
  console.debug('[renderRiversAz] chains:', chains?.length ?? 0);

  // scales
  let qMin = Infinity, qMax = -Infinity;
  for (const c of chains){ if (c.Q < qMin) qMin = c.Q; if (c.Q > qMax) qMax = c.Q; }
  const toLog = v => Math.log10(1 + Math.max(0, v||0));
  const lmin = toLog(qMin), lmax = toLog(qMax);
  const norm = v => (lmax===lmin?0.5:(toLog(v)-lmin)/(lmax-lmin));
  const width = v => 0.9 + 2.8 * norm(v); // ~1..3.7 px

  const line = d3.line()
    .x(d=>d[0]).y(d=>d[1])
    .curve(d3.curveCatmullRom.alpha(0.95)); // close to Azgaar fiddle
  // Docs recommend α=0.5 centripetal to avoid loops; α≈1 looks lively.

  // clean old
  gRivers.selectAll('line.river').remove();
  gShade?.selectAll('path.riverShade').remove();

  // shade underlay (optional)
  if (gShade && !gShade.empty()){
    gShade.raise();
    const s = gShade.selectAll('path.riverShade').data(chains, d=>d.id);
    s.join(
      e => e.append('path')
        .attr('class','riverShade')
        .attr('fill','none')
        .attr('stroke','#000')
        .attr('stroke-opacity',0.18)
        .attr('stroke-linecap','round')
        .attr('stroke-linejoin','round')
        .attr('vector-effect','non-scaling-stroke')
        .attr('stroke-width', d => Math.max(0.5, width(d.Q)*0.33))
        .attr('d', d => line(d.pts)),
      u => u
        .attr('stroke-width', d => Math.max(0.5, width(d.Q)*0.33))
        .attr('d', d => line(d.pts)),
      x => x.remove()
    );
  }

  // main strokes
  gRivers.raise().attr('data-layer','rivers');
  const sel = gRivers.selectAll('path.river').data(chains, d=>d.id);
  sel.join(
    e => e.append('path')
      .attr('class','river')
      .attr('fill','none')
      .attr('stroke','#4D83AE')
      .attr('stroke-opacity',0.95)
      .attr('stroke-linecap','round')
      .attr('stroke-linejoin','round')
      .attr('vector-effect','non-scaling-stroke')
      .attr('stroke-width', d => width(d.Q))
      .attr('d', d => line(d.pts))
      .style('pointer-events','none'),
    u => u
      .attr('stroke-width', d => width(d.Q))
      .attr('d', d => line(d.pts)),
    x => x.remove()
  );
}