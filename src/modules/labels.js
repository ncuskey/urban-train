// d3 is global

// Accurate text measurement using ghost element
export function measureTextWidth(svg, text, { fontSize = 28, family = 'serif', weight = 700 } = {}) {
  const ghost = svg.append('text')
    .attr('x', -99999).attr('y', -99999)
    .attr('font-size', fontSize).attr('font-family', family).attr('font-weight', weight)
    .text(text);
  const w = ghost.node().getComputedTextLength();
  ghost.remove();
  return Math.max(8, w);
}

// Try to pan the viewport to give more space for the label
function tryPanToFit(rect, labelPxWidth, viewport, t, nudge = 40) {
  // If rect is cramped near a landmass, pan away within current world bounds.
  const [minX, minY, maxX, maxY] = viewport;
  const rectW = rect.x1 - rect.x0;
  const rectH = rect.y1 - rect.y0;
  
  // Calculate how much more space we need
  const neededWidth = labelPxWidth + 20; // Add some padding
  const widthDeficit = neededWidth - rectW;
  
  if (widthDeficit <= 0) return false; // No pan needed
  
  // Try different pan directions to find more space
  const panDirections = [
    { dx: nudge, dy: 0, desc: 'right' },
    { dx: -nudge, dy: 0, desc: 'left' },
    { dx: 0, dy: nudge, desc: 'down' },
    { dx: 0, dy: -nudge, desc: 'up' },
    { dx: nudge, dy: nudge, desc: 'down-right' },
    { dx: -nudge, dy: nudge, desc: 'down-left' },
    { dx: nudge, dy: -nudge, desc: 'up-right' },
    { dx: -nudge, dy: -nudge, desc: 'up-left' }
  ];
  
  // Check if any pan direction would help
  for (const { dx, dy, desc } of panDirections) {
    // Calculate new viewport bounds
    const newMinX = minX + dx;
    const newMaxX = maxX + dx;
    const newMinY = minY + dy;
    const newMaxY = maxY + dy;
    
    // Calculate new rectangle bounds after pan
    const newRectX0 = Math.max(rect.x0 + dx, newMinX);
    const newRectX1 = Math.min(rect.x1 + dx, newMaxX);
    const newRectW = newRectX1 - newRectX0;
    
    if (newRectW > rectW) {
      console.log(`[ocean] Panning ${desc} to give more space: ${rectW.toFixed(0)}px → ${newRectW.toFixed(0)}px`);
      
      // Apply the pan via zoom behavior
      const zoom = d3.select('svg').node().__ZOOM__;
      if (zoom) {
        // Convert world coordinates to screen coordinates for the pan
        const screenDx = dx * t.k;
        const screenDy = dy * t.k;
        
        svg.transition().duration(300).call(zoom.translateBy, screenDx, screenDy);
        return true;
      }
    }
  }
  
  return false;
}

// Place ocean label in a rectangle with proper centering and shrink-to-fit
export function placeOceanLabelInRect(oceanLabel, rect, svg, opts = {}) {
  const {
    baseFS = 28,      // desired ocean font size
    minFS  = 16,      // don't go smaller than this
    pad    = 10,      // inner padding inside the rect
    lineH  = 1.2      // line-height multiplier
  } = opts;

  // Create a temp text node to measure width
  const t = svg.append('text')
    .attr('x', -99999).attr('y', -99999) // Off-screen for measurement
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('font-size', baseFS)
    .attr('font-weight', 700)
    .text(oceanLabel.text);

  // First pass at size
  let fs = baseFS;
  t.attr('font-size', fs);

  // Available box inside the rect
  const maxW = Math.max(0, rect.x1 - rect.x0 - pad * 2);
  const maxH = Math.max(0, rect.y1 - rect.y0 - pad * 2);

  // Measure
  let textW = t.node().getComputedTextLength();
  let textH = fs * lineH;

  // Scale down if needed (preserve aspect)
  const scale = Math.min(1, maxW / textW, maxH / textH);
  fs = Math.max(minFS, Math.floor(fs * scale));

  t.attr('font-size', fs);

  // If still overflowing (numeric noise), trim slightly
  textW = t.node().getComputedTextLength();
  if (textW > maxW) {
    fs = Math.max(minFS, Math.floor(fs * (maxW / textW)));
    t.attr('font-size', fs);
  }

  // Clean up temp element
  t.remove();

  // If font size would be below minimum, try gentle panning
  let panned = false;
  if (fs <= minFS && textW > maxW) {
    const t = d3.zoomTransform(svg.node());
    const viewport = [0, 0, +svg.attr('width'), +svg.attr('height')];
    const worldBounds = [
      (0 - t.x) / t.k,
      (0 - t.y) / t.k,
      (viewport[2] - t.x) / t.k,
      (viewport[3] - t.y) / t.k
    ];
    
    panned = tryPanToFit(rect, textW, worldBounds, t);
    if (panned) {
      console.log(`[ocean] Panned viewport to give more space for "${oceanLabel.text}"`);
      // Note: The actual label placement will be recalculated after the pan completes
      return panned; // Return true to indicate panning occurred
    }
  }

  // Center the label in the rectangle
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;

  // Update the ocean label object
  oceanLabel.x = cx;
  oceanLabel.y = cy;
  oceanLabel.fontSize = fs;
  oceanLabel.fixed = true;
  oceanLabel.keepWithinRect = { 
    x0: rect.x0 + pad, 
    y0: rect.y0 + pad, 
    x1: rect.x1 - pad, 
    y1: rect.y1 - pad 
  };
  
  console.log(`[labels] Ocean "${oceanLabel.text}" placed in rectangle: (${cx.toFixed(1)}, ${cy.toFixed(1)}) fontSize: ${fs}, rect: ${(rect.x1 - rect.x0).toFixed(0)}x${(rect.y1 - rect.y0).toFixed(0)}`);
  
  return panned; // Return whether panning occurred
}

// Note: isWaterAt function is now provided by the caller via makeIsWater() in main.js

// ==== Rectangle finder for ocean labels ====

// First land along a ray (axis-aligned), returns distance (px) and whether we hit coast
function distToFirstLand({ x0, y0, dirX, dirY, step, bounds, isWaterAt }) {
  const [minX, minY, maxX, maxY] = bounds;
  let x = x0, y = y0, d = 0;

  // if starting point is land, we're already blocked
  if (!isWaterAt(x, y)) return { dist: 0, hitCoast: true };

  while (x >= minX && x <= maxX && y >= minY && y <= maxY) {
    const nx = x + dirX * step;
    const ny = y + dirY * step;
    if (!isWaterAt(nx, ny)) {
      return { dist: d, hitCoast: true };
    }
    x = nx; y = ny; d += step;
  }
  // ran off the visible map bounds
  return { dist: d, hitCoast: false };
}

// Grow a max water rectangle from a corner so it touches two map edges
// corner: 'tl' | 'tr' | 'bl' | 'br'
export function growOceanRectFromCorner({
  corner, bounds, step = 8, edgePad = 10, coastPad = 6,
  isWaterAt
}) {
  const [minX, minY, maxX, maxY] = bounds;

  // anchor edges + inward directions for this corner
  let ax = (corner === 'tl' || corner === 'bl') ? minX + edgePad : maxX - edgePad;
  let ay = (corner === 'tl' || corner === 'tr') ? minY + edgePad : maxY - edgePad;
  const dirX = (corner === 'tl' || corner === 'bl') ? +1 : -1;  // horizontal growth direction
  const dirY = (corner === 'tl' || corner === 'tr') ? +1 : -1;  // vertical   growth direction

  // Debug water detection at corner
  const isWater = isWaterAt(ax, ay);
  console.log(`[ocean] Corner ${corner} water test at (${ax}, ${ay}): isWater=${isWater}`);
  
  if (!isWater) {
    // Try a few nearby points
    const nearbyPoints = [
      [ax + step, ay], [ax, ay + step], [ax + step, ay + step],
      [ax - step, ay], [ax, ay - step], [ax - step, ay - step]
    ];
    
    let foundWater = false;
    for (const [nx, ny] of nearbyPoints) {
      if (nx >= minX && nx <= maxX && ny >= minY && ny <= maxY && isWaterAt(nx, ny)) {
        console.log(`[ocean] Corner ${corner} using nearby water at (${nx}, ${ny}) instead of (${ax}, ${ay})`);
        ax = nx;
        ay = ny;
        foundWater = true;
        break;
      }
    }
    
    if (!foundWater) {
      console.log(`[ocean] Corner ${corner} failed: no water at (${ax}, ${ay}) or nearby`);
      return { area: 0, touchesCoast: false, corner };
    }
  }

  // We "scanline" out from the map edge:
  //  - for each row, find how far we can go before hitting land;
  //  - the rectangle width is the MIN of those distances;
  //  - we add rows while the map edge cell stays water.
  let heightPx = 0;
  let widthPx = Infinity;
  let touchesCoast = false;

  // advance rows while edge cells stay in water
  while (true) {
    const y = ay + dirY * heightPx;
    if (y < minY + edgePad || y > maxY - edgePad) break;
    if (!isWaterAt(ax, y)) break;

    const { dist, hitCoast } = distToFirstLand({
      x0: ax, y0: y, dirX, dirY: 0, step,
      bounds, isWaterAt
    });

    widthPx = Math.min(widthPx, Math.max(0, dist - coastPad));
    if (hitCoast) touchesCoast = true;

    heightPx += step;
  }

  // No width or no height → invalid
  if (!isFinite(widthPx) || widthPx <= 0 || heightPx <= 0) {
    return { area: 0, touchesCoast: false, corner };
  }

  // Compute rectangle coordinates (x0<=x1, y0<=y1 in world coords)
  const x0 = (dirX > 0) ? ax : ax - widthPx;
  const x1 = (dirX > 0) ? ax + widthPx : ax;
  const y0 = (dirY > 0) ? ay : ay - heightPx;
  const y1 = (dirY > 0) ? ay + heightPx : ay;

  return {
    corner, x0, y0, x1, y1,
    w: Math.max(0, x1 - x0),
    h: Math.max(0, y1 - y0),
    area: Math.max(0, (x1 - x0) * (y1 - y0)),
    touchesCoast
  };
}

// Score rectangle for label placement based on usable capacity
function scoreRectForLabel(rect, desiredTextWidth, desiredLineHeight, pad = 10) {
  const usableW = Math.max(0, rect.w - pad * 2);
  const usableH = Math.max(0, rect.h - pad * 2);
  // prefer wider boxes and penalize skinny ones
  return Math.min(usableW / desiredTextWidth, usableH / desiredLineHeight) * Math.sqrt(usableW * usableH);
}

// Try all four corners; prefer rectangles that touch a coastline, then best label capacity.
export function findOceanLabelRect(opts) {
  const corners = ['tl','tr','bl','br'].map(corner => growOceanRectFromCorner({ corner, ...opts }));
  
  console.log('[ocean] Corner results:', corners.map((r, i) => ({
    corner: ['tl','tr','bl','br'][i],
    area: r.area,
    touchesCoast: r.touchesCoast,
    w: r.w,
    h: r.h,
    isWater: r.area > 0 ? '✅' : '❌'
  })));
  
  const withCoast = corners.filter(r => r.area > 0 && r.touchesCoast);
  const pool = withCoast.length ? withCoast : corners.filter(r => r.area > 0);
  
  console.log('[ocean] Pool results:', {
    withCoast: withCoast.length,
    totalValid: pool.length,
    pool: pool.map(r => ({ area: r.area, corner: r.corner, touchesCoast: r.touchesCoast })),
    sanity: withCoast.length === 4 ? '✅ All corners touch coast' : 
            withCoast.length > 0 ? `✅ ${withCoast.length}/4 corners touch coast` : '❌ No corners touch coast'
  });
  
  if (!pool.length) {
    // Fallback: try to find any large water rectangle in the center area
    console.log('[ocean] No corner rectangles found, trying center-based approach');
    return findCenterBasedOceanRect(opts);
  }
  
  // Score rectangles based on label capacity rather than raw area
  const desiredTextWidth = 200; // Typical ocean label width
  const desiredLineHeight = 28 * 1.2; // Base font size * line height
  
  pool.forEach(rect => {
    rect.labelScore = scoreRectForLabel(rect, desiredTextWidth, desiredLineHeight);
  });
  
  console.log('[ocean] Label capacity scores:', pool.map(r => ({
    corner: r.corner,
    area: r.area,
    w: r.w,
    h: r.h,
    labelScore: r.labelScore.toFixed(1)
  })));
  
  pool.sort((a,b) => b.labelScore - a.labelScore);
  const selected = pool[0];
  
  console.log('[ocean] Selected rectangle:', {
    corner: selected.corner,
    area: selected.area,
    w: selected.w,
    h: selected.h,
    touchesCoast: selected.touchesCoast,
    labelScore: selected.labelScore ? selected.labelScore.toFixed(1) : 'N/A',
    sanity: selected && selected.area > 0 ? '✅ Valid rectangle selected' : '❌ Invalid rectangle selected'
  });
  
  return selected;
}

// Fallback: find a large water rectangle in the center area
function findCenterBasedOceanRect(opts) {
  const { bounds, step, isWaterAt } = opts;
  const [minX, minY, maxX, maxY] = bounds;
  
  // Search in a grid pattern across the visible area
  const gridStep = step * 2;
  let bestRect = null;
  let bestScore = 0;
  
  // Use same scoring parameters as corner-based search
  const desiredTextWidth = 200;
  const desiredLineHeight = 28 * 1.2;
  
  for (let y = minY + step; y < maxY - step; y += gridStep) {
    for (let x = minX + step; x < maxX - step; x += gridStep) {
      if (!isWaterAt(x, y)) continue;
      
      // Try to grow a rectangle from this point
      const rect = growRectFromPoint({ x, y, bounds, step, isWaterAt });
      if (rect) {
        const score = scoreRectForLabel(rect, desiredTextWidth, desiredLineHeight);
        if (score > bestScore) {
          bestScore = score;
          bestRect = rect;
        }
      }
    }
  }
  
  console.log('[ocean] Center-based search found:', bestRect ? { 
    area: bestRect.area, 
    x: bestRect.x0, 
    y: bestRect.y0,
    labelScore: bestScore.toFixed(1)
  } : 'nothing');
  return bestRect;
}

// Grow a rectangle from a given point
function growRectFromPoint({ x, y, bounds, step, isWaterAt }) {
  const [minX, minY, maxX, maxY] = bounds;
  
  // Find the maximum extent in each direction
  let left = x, right = x, top = y, bottom = y;
  
  // Expand left
  while (left > minX && isWaterAt(left - step, y)) {
    left -= step;
  }
  
  // Expand right
  while (right < maxX && isWaterAt(right + step, y)) {
    right += step;
  }
  
  // Expand up
  while (top > minY && isWaterAt(x, top - step)) {
    top -= step;
  }
  
  // Expand down
  while (bottom < maxY && isWaterAt(x, bottom + step)) {
    bottom += step;
  }
  
  // Check if the rectangle is valid (has some minimum size)
  const w = right - left;
  const h = bottom - top;
  const area = w * h;
  
  if (w < step * 4 || h < step * 4) return null; // Too small
  
  return {
    x0: left, y0: top, x1: right, y1: bottom,
    w, h, area,
    touchesCoast: true, // Assume it touches coast if it's large enough
    corner: 'center'
  };
}

// Tries to pan so rect gets at least targetWidth; respects world [0..mapW/H]
export function maybePanToFitOceanLabel({ svg, zoom, mapW, mapH, rect, targetWidth, targetHeight, pad = 12 }) {
  const t = d3.zoomTransform(svg.node());
  const [minX, minY, maxX, maxY] = [
    (0 - t.x) / t.k, (0 - t.y) / t.k, ( +svg.attr('width') - t.x) / t.k, ( +svg.attr('height') - t.y) / t.k
  ];

  let needX = Math.max(0, targetWidth + 2*pad - rect.w);
  let needY = Math.max(0, targetHeight + 2*pad - rect.h);

  if (!needX && !needY) return; // nothing to do

  let dx = 0, dy = 0;

  // If rectangle is pressed against left edge, try panning viewport left (decrease minX)
  if (rect.x0 <= minX + 0.5 && needX) dx = -Math.min(needX, minX); // up to world 0
  // If pressed against right edge, try panning right
  if (rect.x1 >= maxX - 0.5 && needX) dx =  Math.min(needX, mapW - maxX);

  // Similarly for top/bottom
  if (rect.y0 <= minY + 0.5 && needY) dy = -Math.min(needY, minY);
  if (rect.y1 >= maxY - 0.5 && needY) dy =  Math.min(needY, mapH - maxY);

  if (dx || dy) {
    const t2 = d3.zoomIdentity.translate(t.x - dx * t.k, t.y - dy * t.k).scale(t.k);
    svg.call(zoom.transform, t2);
  }
}

// Robust coastline sampler with deduplication and fallbacks
function collectCoastlineSamples(svg, step = 4) {
  // try in order; keep first that yields nodes, else keep accumulating
  const selectors = [
    '#coastlines path.coast, #coastlines path',
    '#world .coastline path',
    '#world .land path, #world path.land',
    '#world path'
  ];

  const nodeSet = new Set();
  for (const sel of selectors) {
    const found = svg.selectAll(sel).nodes();
    console.log(`[ocean] Selector "${sel}" found ${found.length} nodes`);
    found.forEach(n => nodeSet.add(n));
    if (nodeSet.size > 0) break; // early success
  }

  const nodes = Array.from(nodeSet);
  console.log('[ocean] Coastline nodes:', nodes.length);

  const samples = [];
  for (const node of nodes) {
    const len = node.getTotalLength?.();
    if (!len || !isFinite(len)) continue;
    for (let d = 0; d <= len; d += step) {
      const p = node.getPointAtLength(d);
      samples.push([p.x, p.y]);
    }
  }
  console.log('[ocean] Generated coastline samples:', samples.length);
  return samples;
}

export function findOceanLabelSpot({
  svg,
  getCellAtXY,             // (x,y) -> cell
  isWaterAt,               // (x,y) -> boolean (water test function)
  bounds,                  // [minX, minY, maxX, maxY]
  text,                    // ocean name
  baseFontSize = 28,
  minFontSize = 16,
  coastStep = 4,
  gridStep = 20,
  refinements = [10, 5, 3],
  margin = 8               // keep at least this many px from land, regardless of size
}) {
  const samples = collectCoastlineSamples(svg, coastStep);
  if (!samples.length) return null;

  const qt = d3.quadtree().x(d => d[0]).y(d => d[1]).addAll(samples);

  const [minX, minY, maxX, maxY] = bounds;
  console.log(`[ocean] Search bounds: [${minX}, ${minY}, ${maxX}, ${maxY}], gridStep: ${gridStep}`);
  let best = null;

  // coarse scan
  let waterPoints = 0, validPoints = 0;
  for (let y = minY; y <= maxY; y += gridStep) {
    for (let x = minX; x <= maxX; x += gridStep) {
      if (!isWaterAt(x, y)) continue;
      waterPoints++;
      const p = qt.find(x, y); if (!p) continue;
      validPoints++;
      const dist = Math.hypot(x - p[0], y - p[1]);
      if (!best || dist > best.dist) best = { x, y, dist, nearest: p };
    }
  }
  console.log(`[ocean] Grid scan: ${waterPoints} water points, ${validPoints} with coastline, best dist: ${best?.dist?.toFixed(1) || 'none'}`);
  if (!best) return null;

  // local refinements
  for (const h of refinements) {
    for (let dy = -h; dy <= h; dy += h) {
      for (let dx = -h; dx <= h; dx += h) {
        const x = best.x + dx, y = best.y + dy;
        if (!isWaterAt(x, y)) continue;
        const p = qt.find(x, y); if (!p) continue;
        const d = Math.hypot(x - p[0], y - p[1]);
        if (d > best.dist) best = { x, y, dist: d, nearest: p };
      }
    }
  }

  // safety margin independent of text width
  const widthAtBase = measureTextWidth(svg, text, { fontSize: baseFontSize });
  const halfBase = widthAtBase / 2;

  // 1) If it doesn't clear text width, try nudging along the outward normal
  const need = Math.max(margin, halfBase);
  if (best.dist < need) {
    const dx = best.x - best.nearest[0];
    const dy = best.y - best.nearest[1];
    const L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L;
    const extra = need - best.dist + 1; // +1 px cushion

    const x2 = best.x + ux * extra;
    const y2 = best.y + uy * extra;

    if (isWaterAt(x2, y2)) {
      const p2 = qt.find(x2, y2);
      const d2 = Math.hypot(x2 - p2[0], y2 - p2[1]);
      if (d2 >= need) best = { x: x2, y: y2, dist: d2, nearest: p2 };
    }
  }

  // 2) If still tight, shrink just enough (but not below minFontSize)
  let fontSize = baseFontSize;
  if (best.dist < need) {
    const widthAtMin = measureTextWidth(svg, text, { fontSize: minFontSize });
    const halfMin = widthAtMin / 2;

    // If even the min size won't fit with margin, keep spot but clamp at min size
    if (best.dist < Math.max(margin, halfMin)) {
      fontSize = minFontSize;
    } else {
      // Find the font size that makes halfWidth ≈ best.dist (minus margin)
      const targetHalf = Math.max(margin, best.dist) - 1;
      // Simple proportional solve: width ~ fontSize, so fontSize ≈ base * targetHalf/halfBase
      fontSize = Math.max(minFontSize, Math.floor(baseFontSize * (targetHalf / halfBase)));
    }
  }

  return { x: best.x, y: best.y, radius: best.dist, fontSize };
}

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

// Ensure each label datum has a stable ID
let _labelSeq = 0;
function ensureIds(placed) {
  for (const l of placed) if (l.id == null) l.id = `lbl_${_labelSeq++}`;
  return placed;
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

function clampWithinCircle(d) {
  if (!d.keepWithin) return;
  const { cx, cy, r } = d.keepWithin;
  const vx = d.x - cx, vy = d.y - cy;
  const L = Math.hypot(vx, vy);
  if (L > r && r > 0) {
    const f = r / L;
    d.x = cx + vx * f;
    d.y = cy + vy * f;
  }
}

function clampWithinRect(d) {
  const r = d.keepWithinRect;
  if (!r) return;
  if (d.x < r.x0) d.x = r.x0;
  if (d.x > r.x1) d.x = r.x1;
  if (d.y < r.y0) d.y = r.y0;
  if (d.y > r.y1) d.y = r.y1;
}

export function placeLabelsAvoidingCollisions({ svg, labels }) {
  const placed = [];
  const ordered = [...labels.filter(d => d.fixed), ...labels.filter(d => !d.fixed)];

  if (window.DEBUG) console.log('[labels] DEBUG: Collision avoidance starting with', labels.length, 'labels');

  for (const d of ordered) {
    let minOverlap = 0; // Initialize for all labels
    
    if (!d.fixed) {
      // Calculate label dimensions
      const baseWidth = Math.max(80, Math.min(500, d.text.length * 8));
      const baseHeight = 18;
      const areaScale = Math.min(1.0, Math.max(0.6, d.area / 1000));
      const w = baseWidth * areaScale;
      const h = baseHeight * areaScale;
      
      // Try to resolve collisions with already placed labels
      let bestX = d.x, bestY = d.y;
      minOverlap = Infinity;
      
      // Try centroid first
      let overlap = calculateOverlap(d.x, d.y, w, h, placed);
      if (overlap === 0) {
        bestX = d.x;
        bestY = d.y;
        minOverlap = 0;
      } else {
        minOverlap = overlap;
        
        // Try cardinal offsets
        const offsetDistance = Math.max(w, h) * 0.6;
        const offsets = [
          {x: 0, y: -offsetDistance}, {x: offsetDistance, y: 0}, {x: 0, y: offsetDistance}, {x: -offsetDistance, y: 0},
          {x: offsetDistance, y: -offsetDistance}, {x: -offsetDistance, y: -offsetDistance}, 
          {x: offsetDistance, y: offsetDistance}, {x: -offsetDistance, y: offsetDistance}
        ];
        
        for (const offset of offsets) {
          const testX = d.x + offset.x;
          const testY = d.y + offset.y;
          overlap = calculateOverlap(testX, testY, w, h, placed);
          
          if (overlap < minOverlap) {
            minOverlap = overlap;
            bestX = testX;
            bestY = testY;
          }
        }
      }
      
      // Apply the best position found
      d.x = bestX;
      d.y = bestY;
      
      // Apply constraints
      clampWithinRect(d);
      clampWithinCircle(d);
    }
    
    // Add to placed list
    placed.push({
      ...d,
      w: Math.max(80, Math.min(500, d.text.length * 8)) * Math.min(1.0, Math.max(0.6, d.area / 1000)),
      h: 18 * Math.min(1.0, Math.max(0.6, d.area / 1000)),
      placed: { x: d.x, y: d.y },
      scale: Math.min(1.0, Math.max(0.6, d.area / 1000)),
      overlapped: minOverlap > 0
    });
  }
  
  if (window.DEBUG) {
    console.log('[labels] DEBUG: Collision avoidance placed', placed.length, 'out of', labels.length, 'labels');
  }
  
  // Sort placed labels by priority and area (for efficient zoom filtering)
  const sort = (a,b) => (b.priority??0)-(a.priority??0) || (b.area??0)-(a.area??0);
  placed.sort(sort);
  
  // Ensure each label has a stable ID
  ensureIds(placed);
  
  return placed;
}

function calculateOverlap(x, y, w, h, placed) {
  let totalOverlap = 0;
  
  for (const other of placed) {
    if (!other.w || !other.h) continue;
    
    const dx = Math.abs(x - other.placed.x);
    const dy = Math.abs(y - other.placed.y);
    
    if (dx < (w + other.w) / 2 && dy < (h + other.h) / 2) {
      const overlapX = (w + other.w) / 2 - dx;
      const overlapY = (h + other.h) / 2 - dy;
      totalOverlap += overlapX * overlapY;
    }
  }
  
  return totalOverlap;
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
  
  if (window.DEBUG) console.log('[labels] DEBUG: Found', clusters.length, 'clusters:', clusters.map(c => c.length));
  
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
  // OPTIMIZATION: Current approach uses text.length * 8 for fast estimation
  // For tighter packing, could measure actual width with getComputedTextLength()
  // after DOM creation, store w back onto datum, and keep quadtree deterministic
  // Tradeoff: performance vs precision - current approach is pragmatic
  const baseWidth = Math.max(80, Math.min(500, lab.text.length * 8));
  const baseHeight = 18;
  const areaScale = Math.min(1.0, Math.max(0.6, lab.area / 1000));
  const w = baseWidth * areaScale;
  const h = baseHeight * areaScale;
  
  // For fixed labels, always place at their exact position
  if (lab.fixed) {
    return [{...lab, w, h, placed: {x: lab.x, y: lab.y}, scale: areaScale}];
  }
  
  // Try centroid first
  if (clear(null, lab.x, lab.y, w, h)) {
    const result = {...lab, w, h, placed: {x: lab.x, y: lab.y}, scale: areaScale};
    clampWithinCircle(result);
    clampWithinRect(result);
    return [result];
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
      const result = {...lab, w, h, placed: {x: testX, y: testY}, scale: areaScale};
      clampWithinCircle(result);
      clampWithinRect(result);
      return [result];
    }
  }
  
  // Fallback to centroid with overlap
  const result = {...lab, w, h, placed: {x: lab.x, y: lab.y}, scale: areaScale, overlapped: true};
  clampWithinCircle(result);
  clampWithinRect(result);
  return [result];
}

function tryClusterJiggle(cluster) {
  // Calculate label dimensions for all labels in cluster
  // OPTIMIZATION: Uses text.length * 8 for fast estimation (see placeSingleLabel for details)
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
      
      // For fixed labels, always use their exact position
      if (lab.fixed) {
        placement.push({...lab, w, h, placed: {x: lab.x, y: lab.y}, scale: areaScale});
        continue;
      }
      
      const offsetIndex = combination[i];
      const offset = offsetOptions[offsetIndex];
      
      const x = lab.x + offset.x * offsetDistance;
      const y = lab.y + offset.y * offsetDistance;
      
      const result = {...lab, w, h, placed: {x, y}, scale: areaScale};
      clampWithinCircle(result);
      clampWithinRect(result);
      placement.push(result);
      
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
    bestPlacement = labelsWithDims.map(({lab, w, h, areaScale}) => {
      const result = {...lab, w, h, placed: {x: lab.x, y: lab.y}, scale: areaScale, overlapped: true};
      if (!lab.fixed) {
        clampWithinCircle(result);
        clampWithinRect(result);
      }
      return result;
    });
  }
  
  if (window.DEBUG) console.log(`[labels] DEBUG: Cluster of ${cluster.length} labels tried ${combinationsTried} combinations, found ${bestPlacement ? 'collision-free' : 'overlapped'} placement`);
  
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

// ---- Zoom filtering with progressive reveal ----
export function filterByZoom(placed, k) {
  // Bucket by kind (placed is already sorted by priority and area)
  const buckets = { ocean: [], lake: [], island: [], other: [] };
  for (const l of placed) (buckets[l.kind] ?? buckets.other).push(l);

  const lim = {
    ocean: 4,
    lake:   k < 1   ? 1  : k < 2 ? 3  : k < 4 ? 10 : 25,
    island: k < 1   ? 2  : k < 2 ? 4  : k < 4 ? 10 : 20,
    other:  k < 2   ? 0  : k < 4 ? 5  : 15
  };

  const out = [
    ...buckets.ocean.slice(0, lim.ocean),
    ...buckets.lake.slice(0, lim.lake),
    ...buckets.island.slice(0, lim.island),
    ...buckets.other.slice(0, lim.other),
  ];

  // Debug logging
  console.log(`[labels] zoom filter: k=${k.toFixed(2)}, total=${placed.length}, visible=${out.length}`);
  console.log(`[labels] limits: ocean=${lim.ocean}, lake=${lim.lake}, island=${lim.island}, other=${lim.other}`);
  console.log(`[labels] buckets: ocean=${buckets.ocean.length}, lake=${buckets.lake.length}, island=${buckets.island.length}, other=${buckets.other.length}`);
  console.log(`[labels] visible by kind:`, {
    ocean: buckets.ocean.slice(0, lim.ocean).length,
    lake: buckets.lake.slice(0, lim.lake).length,
    island: buckets.island.slice(0, lim.island).length,
    other: buckets.other.slice(0, lim.other).length
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
  
  // LOD Debug: Check current visibility state
  const currentK = window.currentTransform ? window.currentTransform.k : 1;
  const visible = filterByZoom(placed, currentK);
  console.log(`[labels] Current LOD state: k=${currentK.toFixed(2)}, visible=${visible.length}/${placed.length}`);
  
  // Show visible vs hidden breakdown
  const visibleByKind = { ocean: [], lake: [], island: [] };
  visible.forEach(l => {
    const kind = l.kind || 'other';
    if (visibleByKind[kind]) visibleByKind[kind].push(l);
  });
  
  console.log('[labels] Currently visible by kind:', {
    ocean: visibleByKind.ocean.length,
    lake: visibleByKind.lake.length,
    island: visibleByKind.island.length
  });
  
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
    priority: l.priority,
    visible: visible.some(v => v.id === l.id)
  })));
  
  return placed;
}

// --- Render ----------------------------------------------------------

// Render all labels once with keyed join (hidden by default)
export function renderLabels({ svg, placed, groupId }) {
  const g = svg.select(`#${groupId}`);
  
  if (window.DEBUG) {
    console.log('[labels] DEBUG: renderLabels called with', placed.length, 'labels, groupId:', groupId);
  }
  
  // Keyed join on stable IDs
  const sel = g.selectAll('g.label').data(placed, d => d.id);
  
  // Remove old labels
  sel.exit().remove();
  
  // Create new labels
  const enter = sel.enter().append('g').attr('class', 'label');
  
  // Add stroke and fill text elements
  enter.append('text').attr('class', 'stroke');
  enter.append('text').attr('class', 'fill');
  
  // Update all labels (enter + update)
  const merged = enter.merge(sel);
  
  // Set position and transform
  merged.attr('transform', d => `translate(${d.placed.x},${d.placed.y})`);
  
  // Update stroke text
  merged.select('text.stroke')
    .text(d => d.text)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('font-size', d => d.fontSize || 16) // Use computed font size or default
    .classed('is-visible', false); // Hidden by default
  
  // Update fill text
  merged.select('text.fill')
    .text(d => d.text)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('font-size', d => d.fontSize || 16) // Use computed font size or default
    .classed('is-visible', false); // Hidden by default
  
  if (window.DEBUG) console.log('[labels] DEBUG: Rendered', merged.size(), 'labels');
}

// On zoom: update transform with scaling
export function updateLabelZoom({ svg, groupId, k }) {
  svg.select(`#${groupId}`).selectAll('g.label')
    .attr('transform', d => {
      const labelScale = d.scale || 1.0;
      return `translate(${d.placed.x},${d.placed.y}) scale(${labelScale / k})`;
    });
}

// Real LOD: compute the visible set and toggle class
export function updateLabelVisibility({ svg, groupId, placed, k, filterByZoom }) {
  const visible = new Set(filterByZoom(placed, k).map(d => d.id));
  svg.select(`#${groupId}`)
    .selectAll('g.label text')
    .classed('is-visible', d => visible.has(d.id));
  
  // Quick self-check: log zoom level and visible count
  console.log(`[LOD] k=${k.toFixed(2)}, visible=${visible.size}/${placed.length} labels`);
  
  // Debug breakdown by kind
  const buckets = { ocean: [], lake: [], island: [], other: [] };
  for (const l of placed) (buckets[l.kind] ?? buckets.other).push(l);
  
  const visibleByKind = { ocean: [], lake: [], island: [], other: [] };
  for (const l of placed) {
    if (visible.has(l.id)) {
      (visibleByKind[l.kind] ?? visibleByKind.other).push(l);
    }
  }
  
  console.log(`[LOD] Breakdown: ocean=${visibleByKind.ocean.length}/${buckets.ocean.length}, lake=${visibleByKind.lake.length}/${buckets.lake.length}, island=${visibleByKind.island.length}/${buckets.island.length}`);
}

/**
 * Get the visible world bounds after autofit.
 * This function reads the post-autofit transform to get the correct bounds.
 */
export function getVisibleWorldBounds(svg, width, height) {
  const t = d3.zoomTransform(svg.node());
  const [x0, y0] = t.invert([0, 0]);
  const [x1, y1] = t.invert([width, height]);
  return [x0, y0, x1, y1];
}
