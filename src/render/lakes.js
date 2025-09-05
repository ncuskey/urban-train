// src/render/lakes.js
// Fill lake cells (above-sea depressions) into #lakes layer.

function toPoints(poly) {
  return poly.map(p => `${p[0]},${p[1]}`).join(' ');
}

export function renderLakes(polygons, gLakes) {
  if (!gLakes || gLakes.empty()) return;
  // Place lakes above land but below coastlines/rivers
  gLakes.raise().attr('data-layer','lakes');

  const data = polygons.map((p,i)=>({i,p})).filter(d => d.p && d.p.isLake && Array.isArray(d.p) && d.p.length);

  const sel = gLakes.selectAll('polygon.lake').data(data, d=>d.i);
  sel.join(
    enter => enter.append('polygon')
      .attr('class','lake')
      .attr('points', d => toPoints(d.p))
      .attr('fill', '#76c8ff')
      .attr('fill-opacity', 0.75)
      .attr('stroke', 'none')
      .style('pointer-events','none'),
    update => update
      .attr('points', d => toPoints(d.p)),
    exit => exit.remove()
  );
}
