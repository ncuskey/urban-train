// d3 is global

// Helper to find existing names from component polygons
function getExistingNameFromComponent(indices, polygons) {
  for (const idx of indices) {
    const p = polygons[idx];
    // Check various common property patterns for names
    if (p?.name) return p.name;
    if (p?.label?.text) return p.label.text;
    if (p?.feature?.name) return p.feature.name;
    if (p?.names?.feature) return p.names.feature;
    if (p?.featureName) return p.featureName;
  }
  return null;
}

export function buildFeatureLabels({
  polygons,
  seaLevel = 0.2,
  mapWidth,            // <-- REQUIRED
  mapHeight,           // <-- REQUIRED
  // more permissive defaults; tune as needed
  minOceanArea  = 6000,
  minLakeArea   = 250,
  minIslandArea = 400,
  maxOceans = 3,
  maxLakes  = 10,
  maxIslands = 12,
  namePickers   // optional { ocean, lake, island }
}) {
  const n = polygons.length;
  const visited = new Uint8Array(n);
  const waterComps = [];
  const landComps  = [];

  for (let i = 0; i < n; i++) {
    if (!polygons[i] || visited[i]) continue;
    const isWater = (polygons[i].height ?? 0) < seaLevel;

    const q = [i];
    visited[i] = 1;

    let areaSum = 0, cxSum = 0, cySum = 0;
    const indices = [];
    let touchesBoundary = false;

    while (q.length) {
      const idx = q.pop();
      const p = polygons[idx];
      indices.push(idx);

      const poly = polygonPoints(p);
      if (poly.length >= 3) {
        const a = Math.abs(polygonArea(poly));
        const c = centroid(poly);
        areaSum += a; cxSum += c[0] * a; cySum += c[1] * a;

        // Robust boundary check against global map bounds
        for (const [x,y] of poly) {
          if (x <= 0 || y <= 0 || x >= mapWidth || y >= mapHeight) {
            touchesBoundary = true; break;
          }
        }
      }

      const nbs = p.neighbors || [];
      for (const nb of nbs) {
        if (nb == null || visited[nb]) continue;
        const same = (((polygons[nb].height ?? 0) < seaLevel) === isWater);
        if (!same) continue;
        visited[nb] = 1; q.push(nb);
      }
    }

    if (areaSum <= 0) continue;
    const cX = cxSum / areaSum, cY = cySum / areaSum;
    const comp = { indices, area: areaSum, x: cX, y: cY, touchesBoundary };

    if (isWater) waterComps.push(comp); else landComps.push(comp);
  }

  // Sort by size
  waterComps.sort((a,b)=>b.area - a.area);
  landComps.sort((a,b)=>b.area - a.area);

  // Split water
  const oceanComps  = waterComps.filter(c => c.touchesBoundary && c.area >= minOceanArea).slice(0, maxOceans);
  const lakeComps   = waterComps.filter(c => !c.touchesBoundary && c.area >= minLakeArea).slice(0, maxLakes);
  const islandComps = landComps .filter(c => c.area >= minIslandArea).slice(0, maxIslands);

  // Build labels — per-component naming or fallback to generic
  const oceans = oceanComps.map((c,i) => {
    const existing = getExistingNameFromComponent(c.indices, polygons);
    const text = existing || (namePickers?.ocean ? namePickers.ocean(c) : 'Ocean');
    return { id:`ocean-${i}`, kind:'ocean', priority:100, text, x:c.x, y:c.y, area:c.area };
  });

  const lakes = lakeComps.map((c,i) => {
    const existing = getExistingNameFromComponent(c.indices, polygons);
    const text = existing || (namePickers?.lake ? namePickers.lake(c) : 'Lake');
    return { id:`lake-${i}`, kind:'lake', priority:80, text, x:c.x, y:c.y, area:c.area };
  });

  const islands = islandComps.map((c,i) => {
    const existing = getExistingNameFromComponent(c.indices, polygons);
    const text = existing || (namePickers?.island ? namePickers.island(c) : 'Island');
    return { id:`island-${i}`, kind:'island', priority:60, text, x:c.x, y:c.y, area:c.area };
  });

  // DEBUG: counts before collision/zoom
  console.log('[labels] comps:',
    { oceans: oceans.length, lakes: lakes.length, islands: islands.length,
      waterComps: waterComps.length, landComps: landComps.length });

  return [...oceans, ...lakes, ...islands];
}

// --- helpers ----------------------------------------------------------

function polygonPoints(p) {
  // Polygons are arrays of [x,y] points
  if (!Array.isArray(p) || p.length < 3) return [];
  return p;
}

function centroid(poly) {
  let x=0, y=0;
  for (const [px,py] of poly) { x+=px; y+=py; }
  const n = poly.length || 1;
  return [x/n, y/n];
}

function polygonArea(poly) {
  let a = 0;
  for (let i=0, j=poly.length-1; i<poly.length; j=i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    a += (xj + xi) * (yj - yi);
  }
  return a*0.5;
}



// ---- Placement / collision (unchanged, but now fewer labels) --------
export function placeLabelsAvoidingCollisions({ svg, labels }) {
  const qt = d3.quadtree().x(d=>d.x).y(d=>d.y).addAll([]);
  const placed = [];

  // Place high priority first
  labels.sort((a,b)=> b.priority - a.priority);

  for (const lab of labels) {
    const w = Math.max(80, Math.min(500, lab.text.length * 8)); // rough bbox
    const h = 18;
    let pos = {x: lab.x, y: lab.y};
    if (clear(qt, pos.x, pos.y, w, h)) {
      placed.push({...lab, w, h, placed: pos});
      qt.add({x: pos.x, y: pos.y, w, h});
    }
  }
  return placed;
}

function clear(qt, x, y, w, h) {
  let ok = true;
  const r = Math.max(w,h)*0.6;
  qt.visit((node,x0,y0,x1,y1)=>{
    if (!node.length) {
      const d = node.data;
      if (rectsOverlap(x,y,w,h,d.x,d.y,d.w,d.h)) { ok=false; return true; }
    }
    // prune traversal if far from (x,y)
    return (x0 > x + r) || (x1 < x - r) || (y0 > y + r) || (y1 < y - r);
  });
  return ok;
}

function rectsOverlap(x,y,w,h,X,Y,W,H){
  return !(x+w/2 < X-W/2 || x-w/2 > X+W/2 || y+h/2 < Y-H/2 || y-h/2 > Y+H/2);
}

// ---- Zoom filtering ----
export function filterByZoom(placed, k) {
  // DEBUG: show everything while we tune counts
  return placed;
}
// Later, restore:
// if (l.kind==='ocean') return true; if (l.kind==='lake') return k>=0.9; if (l.kind==='island') return k>=0.8; return k>=1.2;

// --- Render ----------------------------------------------------------

// Render all labels once (no zoom filtering here)
export function renderLabels({ svg, placed, groupId, k = 1 }) {
  const g = svg.select(`#${groupId}`);
  const sel = g.selectAll('g.label').data(placed, d => d.id);
  const enter = sel.enter().append('g').attr('class', 'label');

  enter.append('text').attr('class', 'stroke');
  enter.append('text').attr('class', 'fill');

  const merged = enter.merge(sel);

  // Translate in MAP units; counter-scale so glyphs stay constant size
  merged.attr('transform', d => `translate(${d.placed.x},${d.placed.y}) scale(${1 / k})`);

  merged.select('text.stroke')
    .text(d => d.text)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central');

  merged.select('text.fill')
    .text(d => d.text)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central');

  sel.exit().remove();
}

// On zoom: only update each label's inverse scale; do NOT recalc placement
export function updateLabelZoom({ svg, groupId, k }) {
  svg.select(`#${groupId}`).selectAll('g.label')
    .attr('transform', d => `translate(${d.placed.x},${d.placed.y}) scale(${1 / k})`);
}

// On zoom: toggle visibility without re-rendering
export function updateLabelVisibility({ svg, groupId, placed, k, filterByZoom }) {
  const visibleIds = new Set(filterByZoom(placed, k).map(d => d.id));
  const sel = svg.select(`#${groupId}`).selectAll('g.label');

  // Show/hide using style (no DOM churn)
  sel.style('display', d => visibleIds.has(d.id) ? null : 'none');

  // DEBUG: counts
  const visCount = sel.filter(function(){ return d3.select(this).style('display') !== 'none'; }).size();
  console.log(`[labels] updateLabelVisibility: total=${sel.size()} visible=${visCount} k=${k.toFixed(2)}`);
}
