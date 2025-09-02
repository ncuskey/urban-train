// src/labels/debug-markers.js
// QA dots for water component anchors (ocean/sea/lake)

function sel(svg) {
  return (svg && svg.select) ? svg : d3.select(svg);
}

// Try hard to find the group that receives the zoom transform.
function findWorldLayer(svg) {
  const root = sel(svg);
  const candidates = [
    '#world',
    '[data-zoom-layer="world"]',
    '#viewport',
    '#map',
    '#layers',
  ];
  for (const c of candidates) {
    const g = root.select(c);
    if (!g.empty()) return g;
  }
  // Fallback: first <g> that already has a transform attribute
  const transformed = root.selectAll('g').filter(function () {
    return this.hasAttribute('transform');
  });
  if (!transformed.empty()) return transformed.nodes ? d3.select(transformed.nodes()[0]) : transformed;
  // Last resort: the root itself (won't follow zoom, but better than nothing)
  return root;
}

function color(kind) {
  if (kind === 'ocean') return '#1f77b4'; // blue
  if (kind === 'sea')   return '#17becf'; // teal
  if (kind === 'lake')  return '#9edae5'; // light cyan
  return '#888';
}

export function renderQAWaterAnchors(svg, anchors, { r = 3, opacity = 0.95 } = {}) {
  const parent = findWorldLayer(svg);                    // <<< attach to zoomed layer
  let g = parent.select('#qa-water-anchors');
  if (g.empty()) g = parent.append('g').attr('id', 'qa-water-anchors');

  const seln = g.selectAll('circle.qa-water').data(anchors || [], d => d.id);

  seln.enter()
    .append('circle')
    .attr('class', 'qa-water')
    .attr('r', r)
    .attr('stroke', '#fff')
    .attr('stroke-width', 0.75)
    .attr('opacity', opacity)
    .style('vector-effect', 'non-scaling-stroke') // stroke stays crisp under zoom
    .merge(seln)
    .attr('cx', d => d.x)
    .attr('cy', d => d.y)
    .attr('fill', d => color(d.kind));

  seln.exit().remove();
}

// Optional: keep dot radius constant in screen pixels
export function syncQAWaterRadius(svg, k, baseR = 3) {
  const root = sel(svg);
  root.selectAll('#qa-water-anchors circle.qa-water').attr('r', baseR / (k || 1));
}

export function clearQAWaterAnchors(svg) {
  sel(svg).select('#qa-water-anchors').remove();
}
