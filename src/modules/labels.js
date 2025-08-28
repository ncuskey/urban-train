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
  // Place high priority first (oceans > lakes > islands)
  labels.sort((a,b)=> b.priority - a.priority);

  console.log('[labels] DEBUG: Collision avoidance starting with', labels.length, 'labels');

  // Group labels by proximity to find clusters
  const clusters = findLabelClusters(labels);
  
  const placed = [];
  
  for (const cluster of clusters) {
    const clusterPlacements = placeClusterWithJiggle(cluster);
    placed.push(...clusterPlacements);
  }
  
  // Count how many labels used different placement strategies
  const centroidPlacements = placed.filter(l => l.placed.x === l.x && l.placed.y === l.y).length;
  const offsetPlacements = placed.filter(l => {
    const dx = Math.abs(l.placed.x - l.x);
    const dy = Math.abs(l.placed.y - l.y);
    const offsetDistance = Math.max(l.w, l.h) * 0.6;
    return dx === offsetDistance || dy === offsetDistance || 
           (dx === offsetDistance && dy === offsetDistance);
  }).length;
  const spiralPlacements = placed.length - centroidPlacements - offsetPlacements;
  const overlappedPlacements = placed.filter(l => l.overlapped).length;
  
  console.log('[labels] DEBUG: Collision avoidance placed', placed.length, 'out of', labels.length, 'labels');
  console.log('[labels] DEBUG: Placement stats - centroid:', centroidPlacements, 'offset:', offsetPlacements, 'spiral:', spiralPlacements, 'overlapped:', overlappedPlacements);
  
  // Log scale distribution
  const scales = placed.map(l => l.scale || 1.0);
  const avgScale = scales.reduce((a, b) => a + b, 0) / scales.length;
  console.log('[labels] DEBUG: Average label scale:', avgScale.toFixed(2), 'range:', Math.min(...scales).toFixed(2), '-', Math.max(...scales).toFixed(2));
  
  // Log distance statistics
  const distances = placed.map(l => {
    const dx = l.placed.x - l.x;
    const dy = l.placed.y - l.y;
    return Math.sqrt(dx*dx + dy*dy);
  });
  const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
  const maxDistance = Math.max(...distances);
  console.log('[labels] DEBUG: Distance stats - avg:', avgDistance.toFixed(1), 'max:', maxDistance.toFixed(1));
  
  // Warn about labels placed far from their features
  const farLabels = placed.filter(l => {
    const dx = l.placed.x - l.x;
    const dy = l.placed.y - l.y;
    const distance = Math.sqrt(dx*dx + dy*dy);
    return distance > 100; // More than 100px away
  });
  
  if (farLabels.length > 0) {
    console.warn('[labels] WARNING: Labels placed far from features:', farLabels.map(l => ({
      id: l.id,
      kind: l.kind,
      distance: Math.sqrt((l.placed.x - l.x)**2 + (l.placed.y - l.y)**2).toFixed(1)
    })));
  }
  
  return placed;
}

function findLabelClusters(labels) {
  const clusters = [];
  const visited = new Set();
  
  for (const label of labels) {
    if (visited.has(label.id)) continue;
    
    const cluster = [label];
    visited.add(label.id);
    
    // Find nearby labels (within 200px) to form a cluster
    for (const other of labels) {
      if (visited.has(other.id)) continue;
      
      const distance = Math.sqrt((label.x - other.x) ** 2 + (label.y - other.y) ** 2);
      if (distance < 200) {
        cluster.push(other);
        visited.add(other.id);
      }
    }
    
    clusters.push(cluster);
  }
  
  console.log('[labels] DEBUG: Found', clusters.length, 'clusters:', clusters.map(c => c.length));
  
  return clusters;
}

function placeClusterWithJiggle(cluster) {
  if (cluster.length === 1) {
    // Single label - use simple placement
    return placeSingleLabel(cluster[0]);
  }
  
  // Multi-label cluster - try jiggling
  const bestPlacement = tryClusterJiggle(cluster);
  return bestPlacement;
}

function placeSingleLabel(lab) {
  // Size-based label dimensions
  const baseWidth = Math.max(80, Math.min(500, lab.text.length * 8));
  const baseHeight = 18;
  const areaScale = Math.min(1.0, Math.max(0.6, lab.area / 1000));
  const w = baseWidth * areaScale;
  const h = baseHeight * areaScale;
  
  // Try centroid first
  if (clear(null, lab.x, lab.y, w, h)) {
    return [{...lab, w, h, placed: {x: lab.x, y: lab.y}, scale: areaScale}];
  }
  
  // Try cardinal offsets
  const offsetDistance = Math.max(w, h) * 0.6;
  const cardinalOffsets = [
    {x: 0, y: -offsetDistance}, {x: offsetDistance, y: 0}, {x: 0, y: offsetDistance}, {x: -offsetDistance, y: 0},
    {x: offsetDistance, y: -offsetDistance}, {x: -offsetDistance, y: -offsetDistance}, 
    {x: offsetDistance, y: offsetDistance}, {x: -offsetDistance, y: offsetDistance}
  ];
  
  for (const offset of cardinalOffsets) {
    const testX = lab.x + offset.x;
    const testY = lab.y + offset.y;
    
    if (clear(null, testX, testY, w, h)) {
      return [{...lab, w, h, placed: {x: testX, y: testY}, scale: areaScale}];
    }
  }
  
  // Fallback to centroid with overlap
  return [{...lab, w, h, placed: {x: lab.x, y: lab.y}, scale: areaScale, overlapped: true}];
}

function tryClusterJiggle(cluster) {
  // Calculate label dimensions for all labels in cluster
  const labelsWithDims = cluster.map(lab => {
    const baseWidth = Math.max(80, Math.min(500, lab.text.length * 8));
    const baseHeight = 18;
    const areaScale = Math.min(1.0, Math.max(0.6, lab.area / 1000));
    const w = baseWidth * areaScale;
    const h = baseHeight * areaScale;
    const offsetDistance = Math.max(w, h) * 0.6;
    
    return {lab, w, h, areaScale, offsetDistance};
  });
  
  // Define all possible offset combinations
  const offsetOptions = [
    {x: 0, y: 0}, // Centroid
    {x: 0, y: -1}, {x: 1, y: 0}, {x: 0, y: 1}, {x: -1, y: 0}, // Cardinal
    {x: 1, y: -1}, {x: -1, y: -1}, {x: 1, y: 1}, {x: -1, y: 1} // Diagonal
  ];
  
  let bestPlacement = null;
  let bestScore = -1;
  
  // Try different combinations of offsets for all labels
  const maxCombinations = Math.min(1000, Math.pow(offsetOptions.length, cluster.length));
  let combinationsTried = 0;
  
  // Generate combinations systematically
  const combinations = generateOffsetCombinations(cluster.length, offsetOptions.length);
  
  for (const combination of combinations) {
    combinationsTried++;
    if (combinationsTried > maxCombinations) break;
    
    const placement = [];
    let hasCollision = false;
    
    // Apply this combination
    for (let i = 0; i < cluster.length; i++) {
      const {lab, w, h, areaScale, offsetDistance} = labelsWithDims[i];
      const offsetIndex = combination[i];
      const offset = offsetOptions[offsetIndex];
      
      const x = lab.x + offset.x * offsetDistance;
      const y = lab.y + offset.y * offsetDistance;
      
      placement.push({...lab, w, h, placed: {x, y}, scale: areaScale});
      
      // Check for collisions with previously placed labels in this combination
      for (let j = 0; j < placement.length - 1; j++) {
        if (rectsOverlap(placement[j], placement[placement.length - 1])) {
          hasCollision = true;
          break;
        }
      }
      
      if (hasCollision) break;
    }
    
    if (!hasCollision) {
      // Calculate score based on total distance from centroids
      const totalDistance = placement.reduce((sum, p) => {
        const dx = p.placed.x - p.x;
        const dy = p.placed.y - p.y;
        return sum + Math.sqrt(dx * dx + dy * dy);
      }, 0);
      
      const score = -totalDistance; // Negative because lower distance is better
      
      if (score > bestScore) {
        bestScore = score;
        bestPlacement = placement;
      }
    }
  }
  
  // If no collision-free placement found, use the best one with minimal overlap
  if (!bestPlacement) {
    bestPlacement = labelsWithDims.map(({lab, w, h, areaScale}) => ({
      ...lab, w, h, placed: {x: lab.x, y: lab.y}, scale: areaScale, overlapped: true
    }));
  }
  
  console.log(`[labels] DEBUG: Cluster of ${cluster.length} labels tried ${combinationsTried} combinations, found ${bestPlacement ? 'collision-free' : 'overlapped'} placement`);
  
  return bestPlacement;
}

function generateOffsetCombinations(labelCount, offsetCount) {
  const combinations = [];
  
  // For small clusters, try all combinations
  if (labelCount <= 3) {
    const maxCombinations = Math.pow(offsetCount, labelCount);
    for (let i = 0; i < maxCombinations; i++) {
      const combination = [];
      let temp = i;
      for (let j = 0; j < labelCount; j++) {
        combination.push(temp % offsetCount);
        temp = Math.floor(temp / offsetCount);
      }
      combinations.push(combination);
    }
  } else {
    // For larger clusters, try a subset of combinations
    const maxCombinations = Math.min(500, Math.pow(offsetCount, labelCount));
    for (let i = 0; i < maxCombinations; i++) {
      const combination = [];
      for (let j = 0; j < labelCount; j++) {
        combination.push(Math.floor(Math.random() * offsetCount));
      }
      combinations.push(combination);
    }
  }
  
  return combinations;
}

function clear(qt, x, y, w, h) {
  if (!qt) return true; // No quadtree means no collision check needed
  
  let ok = true;
  const r = Math.max(w,h)*0.6;
  qt.visit((node,x0,y0,x1,y1)=>{
    if (!node.length) {
      const d = node.data;
      if (rectsOverlapSimple(x,y,w,h,d.x,d.y,d.w,d.h)) { ok=false; return true; }
    }
    // prune traversal if far from (x,y)
    return (x0 > x + r) || (x1 < x - r) || (y0 > y + r) || (y1 < y - r);
  });
  return ok;
}

function rectsOverlapSimple(x,y,w,h,X,Y,W,H){
  return !(x+w/2 < X-W/2 || x-w/2 > X+W/2 || y+h/2 < Y-H/2 || y-h/2 > Y+H/2);
}

function rectsOverlap(a, b) {
  const r = Math.max(a.w, a.h) * 0.6;
  return !(a.placed.x + r < b.placed.x - r || a.placed.x - r > b.placed.x + r ||
           a.placed.y + r < b.placed.y - r || a.placed.y - r > b.placed.y + r);
}

// Check if a position is at least partially clear (allows some overlap)
function checkPartialClear(qt, x, y, w, h, area = 0) {
  let overlapCount = 0;
  let totalChecks = 0;
  const r = Math.max(w,h)*0.8;
  
  qt.visit((node,x0,y0,x1,y1)=>{
    if (!node.length) {
      totalChecks++;
      const d = node.data;
      if (rectsOverlap(x,y,w,h,d.x,d.y,d.w,d.h)) {
        overlapCount++;
      }
    }
    // prune traversal if far from (x,y)
    return (x0 > x + r) || (x1 < x - r) || (y0 > y + r) || (y1 < y - r);
  });
  
  // More permissive overlap for very small features
  const maxOverlap = area < 50 ? 0.8 : area < 200 ? 0.6 : 0.5;
  return overlapCount === 0 || (overlapCount / totalChecks) < maxOverlap;
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

// DEBUG: Helper function to inspect all labels
export function debugLabels() {
  if (!window.__labelsPlaced || !window.__labelsPlaced.features) {
    console.log('[labels] No labels data available. Generate a map first.');
    return;
  }
  
  const placed = window.__labelsPlaced.features;
  console.log('[labels] === LABEL DEBUG INFO ===');
  console.log('[labels] Total placed labels:', placed.length);
  
  // Group by kind
  const byKind = { ocean: [], lake: [], island: [] };
  placed.forEach(l => {
    const kind = l.kind || 'other';
    if (byKind[kind]) byKind[kind].push(l);
  });
  
  console.log('[labels] By kind:', {
    ocean: byKind.ocean.length,
    lake: byKind.lake.length,
    island: byKind.island.length
  });
  
  // Check for potential issues
  const issues = [];
  placed.forEach(l => {
    if (!l.id) issues.push(`Label missing ID: ${l}`);
    if (!l.text) issues.push(`Label missing text: ${l.id}`);
    if (l.placed.x == null || l.placed.y == null) issues.push(`Label missing position: ${l.id}`);
    if (l.w <= 0 || l.h <= 0) issues.push(`Label invalid size: ${l.id} (${l.w}x${l.h})`);
    if (l.scale <= 0) issues.push(`Label invalid scale: ${l.id} (${l.scale})`);
    if (l.area <= 0) issues.push(`Label invalid area: ${l.id} (${l.area})`);
  });
  
  if (issues.length > 0) {
    console.warn('[labels] Issues found:', issues);
  } else {
    console.log('[labels] No obvious issues detected');
  }
  
  // Show all labels with their data
  console.table(placed.map(l => ({
    id: l.id,
    kind: l.kind,
    text: l.text,
    area: l.area,
    x: l.placed.x,
    y: l.placed.y,
    w: l.w,
    h: l.h,
    scale: l.scale,
    priority: l.priority
  })));
  
  return placed;
}

// --- Render ----------------------------------------------------------

// Render all labels once (no zoom filtering here)
export function renderLabels({ svg, placed, groupId, k = 1 }) {
  const g = svg.select(`#${groupId}`);
  
  console.log('[labels] DEBUG: renderLabels called with', placed.length, 'labels, groupId:', groupId);
  console.log('[labels] DEBUG: Group exists:', !g.empty(), 'Group node:', g.node());
  
  // DEBUG: Check for invalid label data
  const invalidLabels = placed.filter(l => {
    return !l.id || !l.text || l.placed.x == null || l.placed.y == null || 
           l.w <= 0 || l.h <= 0 || l.scale <= 0;
  });
  
  if (invalidLabels.length > 0) {
    console.warn('[labels] WARNING: Invalid label data detected:', invalidLabels);
  }
  
  // DEBUG: Check for labels outside viewport
  const svgRect = svg.node().getBoundingClientRect();
  const outOfBounds = placed.filter(l => {
    return l.placed.x < -100 || l.placed.x > svgRect.width + 100 ||
           l.placed.y < -100 || l.placed.y > svgRect.height + 100;
  });
  
  if (outOfBounds.length > 0) {
    console.warn('[labels] WARNING: Labels placed outside viewport:', outOfBounds);
  }
  
  const sel = g.selectAll('g.label').data(placed, d => d.id);
  const enter = sel.enter().append('g').attr('class', 'label');

  console.log('[labels] DEBUG: Enter selection size:', enter.size());

  enter.append('text').attr('class', 'stroke');
  enter.append('text').attr('class', 'fill');

  const merged = enter.merge(sel);

  // Translate in MAP units; apply size-based scaling and counter-scale for zoom
  merged.attr('transform', d => {
    const labelScale = d.scale || 1.0;
    return `translate(${d.placed.x},${d.placed.y}) scale(${labelScale / k})`;
  });

  merged.select('text.stroke')
    .text(d => d.text)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .style('opacity', d => {
      if (d.overlapped) return 0.7; // Overlapped labels
      if (d.area < 50) return 0.9; // Very small features slightly transparent
      return 1.0; // Normal opacity
    });

  merged.select('text.fill')
    .text(d => d.text)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .style('opacity', d => {
      if (d.overlapped) return 0.7; // Overlapped labels
      if (d.area < 50) return 0.9; // Very small features slightly transparent
      return 1.0; // Normal opacity
    });

  sel.exit().remove();
  
  console.log('[labels] DEBUG: Final DOM count:', g.selectAll('g.label').size());
}

// On zoom: only update each label's inverse scale; do NOT recalc placement
export function updateLabelZoom({ svg, groupId, k }) {
  svg.select(`#${groupId}`).selectAll('g.label')
    .attr('transform', d => {
      const labelScale = d.scale || 1.0;
      return `translate(${d.placed.x},${d.placed.y}) scale(${labelScale / k})`;
    });
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
  
  // DEBUG: Check for missing labels
  if (visibleIds.size !== visCount) {
    console.warn('[labels] WARNING: Visibility mismatch detected!');
    console.log('[labels] Expected visible IDs:', Array.from(visibleIds));
    
    // Check each visible label's DOM state
    sel.each(function(d) {
      const node = d3.select(this);
      const isVisible = node.style('display') !== 'none';
      const shouldBeVisible = visibleIds.has(d.id);
      
      if (shouldBeVisible && !isVisible) {
        console.warn('[labels] Label should be visible but is hidden:', d.id, d);
      } else if (!shouldBeVisible && isVisible) {
        console.warn('[labels] Label should be hidden but is visible:', d.id, d);
      }
    });
    
    // Check for labels that should be visible but don't exist in DOM
    const domIds = new Set(sel.data().map(d => d.id));
    const missingInDom = Array.from(visibleIds).filter(id => !domIds.has(id));
    if (missingInDom.length > 0) {
      console.warn('[labels] Labels visible in filter but missing from DOM:', missingInDom);
    }
  }
}
