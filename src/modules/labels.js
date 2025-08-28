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
  mapWidth,
  mapHeight,
  // ↓ ensure even smallest features get labels
  minOceanArea  = 6000,
  minLakeArea   = 0,      // was 40 - no minimum for lakes
  minIslandArea = 0,      // was 60 - no minimum for islands
  maxOceans     = 4,      // optional
  maxLakes      = 500,    // was 10
  maxIslands    = 800,    // was 12
  namePickers
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



// ---- Placement / collision avoidance ----
export function placeLabelsAvoidingCollisions({ svg, labels }) {
  const qt = d3.quadtree().x(d=>d.x).y(d=>d.y).addAll([]);
  const placed = [];

  // Place high priority first (oceans > lakes > islands)
  labels.sort((a,b)=> b.priority - a.priority);

  console.log('[labels] DEBUG: Collision avoidance starting with', labels.length, 'labels');

  for (const lab of labels) {
    const w = Math.max(80, Math.min(500, lab.text.length * 8)); // rough bbox width
    const h = 18; // fixed height
    let pos = {x: lab.x, y: lab.y};
    
    // Try to place at centroid first
    if (clear(qt, pos.x, pos.y, w, h)) {
      placed.push({...lab, w, h, placed: pos});
      qt.add({x: pos.x, y: pos.y, w, h});
      continue;
    }
    
    // If centroid fails, try nearby positions in a spiral pattern
    const maxAttempts = 20;
    const step = Math.max(w, h) * 0.8;
    let attempts = 0;
    let found = false;
    
    for (let ring = 1; ring <= 3 && attempts < maxAttempts; ring++) {
      for (let i = 0; i < ring * 8 && attempts < maxAttempts; i++) {
        attempts++;
        const angle = (i / (ring * 8)) * 2 * Math.PI;
        const radius = ring * step;
        const testX = lab.x + Math.cos(angle) * radius;
        const testY = lab.y + Math.sin(angle) * radius;
        
        if (clear(qt, testX, testY, w, h)) {
          pos = {x: testX, y: testY};
          placed.push({...lab, w, h, placed: pos});
          qt.add({x: pos.x, y: pos.y, w, h});
          found = true;
          break;
        }
      }
      if (found) break;
    }
    
    // If still no position found, place at centroid anyway (will overlap)
    if (!found) {
      placed.push({...lab, w, h, placed: pos});
      qt.add({x: pos.x, y: pos.y, w, h});
    }
  }
  
  console.log('[labels] DEBUG: Collision avoidance placed', placed.length, 'out of', labels.length, 'labels');
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

// ---- Zoom filtering with size-based visibility ----
export function filterByZoom(placed, k) {
  // bucket by kind
  const buckets = { ocean: [], lake: [], island: [], other: [] };
  for (const l of placed) {
    const kind = (l && (l.kind === 'ocean' || l.kind === 'lake' || l.kind === 'island')) ? l.kind : 'other';
    buckets[kind].push(l);
  }

  // prefer bigger/prioritized first
  const sortFn = (a, b) =>
    (b.priority ?? 0) - (a.priority ?? 0) || (b.area ?? 0) - (a.area ?? 0);

  Object.values(buckets).forEach(arr => arr.sort(sortFn));

  // Size-based visibility thresholds
  const sizeThresholds = {
    ocean: { min: 0, max: Infinity }, // Oceans always visible
    lake: { 
      tiny: 50,    // Very small lakes
      small: 200,  // Small lakes  
      medium: 800, // Medium lakes
      large: 2000  // Large lakes
    },
    island: {
      tiny: 30,    // Very small islands
      small: 150,  // Small islands
      medium: 600, // Medium islands
      large: 1500  // Large islands
    }
  };

  // Zoom-based visibility rules
  const getVisibilityForZoom = (kind, area, k) => {
    if (kind === 'ocean') return true; // Oceans always visible
    
    if (kind === 'lake') {
      if (k >= 4) return true; // All lakes visible at high zoom
      if (k >= 2 && area >= sizeThresholds.lake.tiny) return true; // Small+ lakes at medium zoom
      if (k >= 1 && area >= sizeThresholds.lake.small) return true; // Medium+ lakes at low zoom
      if (k >= 0.5 && area >= sizeThresholds.lake.medium) return true; // Large lakes at very low zoom
      return false;
    }
    
    if (kind === 'island') {
      if (k >= 3) return true; // All islands visible at high zoom
      if (k >= 1.5 && area >= sizeThresholds.island.tiny) return true; // Small+ islands at medium zoom
      if (k >= 0.8 && area >= sizeThresholds.island.small) return true; // Medium+ islands at low zoom
      if (k >= 0.4 && area >= sizeThresholds.island.medium) return true; // Large islands at very low zoom
      return false;
    }
    
    return false;
  };

  // Apply size-based filtering
  const filtered = [];
  for (const bucket of Object.values(buckets)) {
    for (const label of bucket) {
      if (getVisibilityForZoom(label.kind, label.area, k)) {
        filtered.push(label);
      }
    }
  }

  // Apply maximum limits to prevent overcrowding
  const maxLimits = {
    ocean: 4,
    lake: k < 1 ? 15 : k < 2 ? 40 : k < 4 ? 80 : 200,
    island: k < 1 ? 20 : k < 2 ? 50 : k < 3 ? 100 : 300,
    other: k < 2 ? 0 : k < 4 ? 10 : 30
  };

  // Re-bucket and apply limits
  const finalBuckets = { ocean: [], lake: [], island: [], other: [] };
  for (const label of filtered) {
    const kind = label.kind || 'other';
    if (finalBuckets[kind].length < maxLimits[kind]) {
      finalBuckets[kind].push(label);
    }
  }

  const out = [];
  out.push(...finalBuckets.ocean);
  out.push(...finalBuckets.lake);
  out.push(...finalBuckets.island);
  out.push(...finalBuckets.other);
  
  // Debug logging for size-based filtering
  console.log(`[labels] zoom filter: k=${k.toFixed(2)}, total=${placed.length}, visible=${out.length}`);
  console.log(`[labels] visible by kind:`, {
    ocean: finalBuckets.ocean.length,
    lake: finalBuckets.lake.length,
    island: finalBuckets.island.length,
    other: finalBuckets.other.length
  });
  
  return out;
}

// --- Render ----------------------------------------------------------

// Render all labels once (no zoom filtering here)
export function renderLabels({ svg, placed, groupId, k = 1 }) {
  const g = svg.select(`#${groupId}`);
  
  console.log('[labels] DEBUG: renderLabels called with', placed.length, 'labels, groupId:', groupId);
  console.log('[labels] DEBUG: Group exists:', !g.empty(), 'Group node:', g.node());
  
  const sel = g.selectAll('g.label').data(placed, d => d.id);
  const enter = sel.enter().append('g').attr('class', 'label');

  console.log('[labels] DEBUG: Enter selection size:', enter.size());

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
  
  console.log('[labels] DEBUG: Final DOM count:', g.selectAll('g.label').size());
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
