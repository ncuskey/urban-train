// d3 is global

// Safety toggles for easy rollback
export const USE_SA_LABELER = true;       // master switch
export const USE_SA_FOR_OCEANS = true;    // polish oceans in keepWithinRect
export const DEBUG_LABEL_BOXES = false;   // show rects behind text

// Accurate text measurement using ghost element
export function measureTextWidth(svg, text, { fontSize = 28, family = getComputedStyle(document.documentElement).getPropertyValue('--label-font')?.trim() || 'serif', weight = 700 } = {}) {
  const ghost = svg.append('text')
    .attr('x', -99999).attr('y', -99999)
    .attr('font-size', fontSize).attr('font-family', family).attr('font-weight', weight)
    .text(text);
  const w = ghost.node().getComputedTextLength();
  ghost.remove();
  return Math.max(8, w);
}

// Normalize label data for SA labeler - compute anchors and dimensions
export function computeLabelMetrics({ svg, labels }) {
  return labels.map(l => {
    const font = (
      l.kind === 'ocean'  ? 28 :
      l.kind === 'lake'   ? 14 :
      l.kind === 'island' ? 12 : 12
    );
    const width = measureTextWidth(svg, l.text, { fontSize: font, weight: 700 });
    const height = Math.max(10, Math.round(font * 0.9));

    // Seed ocean labels inside their chosen rectangle
    if (l.kind === 'ocean' && l.keepWithinRect) {
      const r = l.keepWithinRect;
      const startX = r.x0 + Math.max(0, (r.x1 - r.x0 - width) / 2);
      const startY = r.y0 + Math.max(0, (r.y1 - r.y0 - height) / 2);

      return {
        ...l,
        font,
        // start box top-left inside the rectangle
        x: startX,
        y: startY,
        // rectangle dims used by the annealer
        width,
        height,
        // anchor at rect center so "distance to anchor" doesn't yank back to original centroid
        anchor: { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, r: 4 }
      };
    }

    return {
      ...l,
      font,
      // initial guess stays at current centroid
      x: l.x,
      y: l.y,
      // rectangle dims used by the annealer
      width,
      height,
      // anchor & radius — small radius works well here
      anchor: { x: l.x, y: l.y, r: 3 }
    };
  });
}

// Clamp label box to bounds to ensure it stays within designated area
function clampBoxToBounds(lbl, bounds) {
  const x0 = bounds ? bounds.x0 : 0;
  const y0 = bounds ? bounds.y0 : 0;
  const W  = bounds ? bounds.x1 - bounds.x0 : +d3.select('svg').attr('width');
  const H  = bounds ? bounds.y1 - bounds.y0 : +d3.select('svg').attr('height');

  // clamp top-left in local coords
  const minX = x0,                 maxX = x0 + W - lbl.width;
  const minY = y0,                 maxY = y0 + H - lbl.height;

  lbl.placed.x = Math.max(minX, Math.min(maxX, lbl.placed.x));
  lbl.placed.y = Math.max(minY, Math.min(maxY, lbl.placed.y));
}

// Wrapper around D3-Labeler simulated annealing
export function annealLabels({ labels, bounds, sweeps = 400, svg }) {
  if (!labels.length) return labels;

  // Resolve drawing surface dimensions
  const svgSel = svg || d3.select('svg');
  let surfaceW = +svgSel.attr('width');
  let surfaceH = +svgSel.attr('height');
  if (!Number.isFinite(surfaceW) || !Number.isFinite(surfaceH)) {
    // fallback to client box
    const node = svgSel.node();
    surfaceW = node?.clientWidth  || 800;
    surfaceH = node?.clientHeight || 600;
  }

  const x0 = bounds ? bounds.x0 : 0;
  const y0 = bounds ? bounds.y0 : 0;
  const W  = bounds ? (bounds.x1 - bounds.x0) : surfaceW;
  const H  = bounds ? (bounds.y1 - bounds.y0) : surfaceH;

  // seed: make sure every label has metrics and a starting box top-left
  for (const l of labels) {
    if (!Number.isFinite(l.width) || !Number.isFinite(l.height)) {
      // if you wired ensureMetrics already, this shouldn't happen
      l.width  = l.width  || 40;
      l.height = l.height || 14;
    }
    if (!Number.isFinite(l.x) || !Number.isFinite(l.y)) {
      // start from anchor if centroid missing
      const ax = l.anchor?.x ?? 0, ay = l.anchor?.y ?? 0;
      l.x = ax - l.width / 2;
      l.y = ay - l.height / 2;
    }
  }

  // Build SA arrays in local coords
  const la = labels.map(l => ({
    x: l.x - x0,
    y: l.y - y0,
    width:  l.width,
    height: l.height,
    name:   l.text || ''
  }));
  const aa = labels.map(l => ({
    x: (l.anchor?.x ?? (l.x + l.width/2)) - x0,
    y: (l.anchor?.y ?? (l.y + l.height/2)) - y0,
    r: l.anchor?.r ?? 3
  }));

  d3.labeler().label(la).anchor(aa).width(+W).height(+H).start(sweeps);

  // Map back out and clamp box fully inside bounds
  for (let i=0;i<labels.length;i++) {
    const l = labels[i], bx = la[i].x + x0, by = la[i].y + y0;
    l.placed = { x: bx, y: by };
    const minX = x0, maxX = x0 + W - l.width;
    const minY = y0, maxY = y0 + H - l.height;
    l.placed.x = Math.max(minX, Math.min(maxX, l.placed.x));
    l.placed.y = Math.max(minY, Math.min(maxY, l.placed.y));
  }
  return labels;
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
  const MIN_ASPECT = opts.minAspect ?? 1.15; // >1 means horizontal. Use 1.01 if you just want w>h.
  
  let best = null;
  let bestScore = -Infinity;
  
  const corners = ['tl','tr','bl','br'].map(corner => growOceanRectFromCorner({ corner, ...opts }));
  
  console.log('[ocean] Corner results:', corners.map((r, i) => ({
    corner: ['tl','tr','bl','br'][i],
    area: r.area,
    touchesCoast: r.touchesCoast,
    w: r.w,
    h: r.h,
    aspect: r.w > 0 ? (r.w / r.h).toFixed(2) : 'N/A',
    isWater: r.area > 0 ? '✅' : '❌'
  })));
  
  const withCoast = corners.filter(r => r.area > 0 && r.touchesCoast);
  const pool = withCoast.length ? withCoast : corners.filter(r => r.area > 0);
  
  console.log('[ocean] Pool results:', {
    withCoast: withCoast.length,
    totalValid: pool.length,
    pool: pool.map(r => ({ area: r.area, corner: r.corner, touchesCoast: r.touchesCoast, aspect: (r.w / r.h).toFixed(2) })),
    sanity: withCoast.length === 4 ? '✅ All corners touch coast' : 
            withCoast.length > 0 ? `✅ ${withCoast.length}/4 corners touch coast` : '❌ No corners touch coast'
  });
  
  if (!pool.length) {
    // Fallback: try to find any large water rectangle in the center area
    console.log('[ocean] No corner rectangles found, trying center-based approach');
    return findCenterBasedOceanRect(opts);
  }
  
  console.log('[ocean] Initial seed rectangles:', pool.map(r => ({
    corner: r.corner,
    w: r.w,
    h: r.h,
    aspect: (r.w / r.h).toFixed(2),
    area: r.area
  })));
  
  // Filter out seeds that are too tall to be worth growing
  // If a seed has aspect < 0.3, it's probably too tall to grow into a good horizontal rectangle
  const viableSeeds = pool.filter(seed => (seed.w / seed.h) >= 0.3);
  console.log(`[ocean] Filtered to ${viableSeeds.length}/${pool.length} viable seeds (aspect >= 0.3)`);
  
  if (viableSeeds.length === 0) {
    console.log('[ocean] No viable seeds found, trying center-based approach');
    return findCenterBasedOceanRect(opts);
  }
  
  // Score rectangles using the new horizontal aspect requirement
  for (const seed of viableSeeds) {
    console.log(`[ocean] Trying to grow seed from ${seed.corner}: w=${seed.w}, h=${seed.h}, aspect=${(seed.w/seed.h).toFixed(2)}`);
    const r = growFromSeed(seed, {...opts, MIN_ASPECT});
    const score = scoreRect(r, MIN_ASPECT);
    console.log(`[ocean] Grown rectangle: w=${r.w}, h=${r.h}, aspect=${(r.w/r.h).toFixed(2)}, score=${score}`);
    if (score > bestScore) { 
      best = r; 
      bestScore = score; 
      console.log(`[ocean] New best: ${r.corner} with score ${score}`);
    }
  }
  
  // Fallback: if nothing satisfied aspect, relax toward 1.0 once
  if (!best) {
    const relaxed = Math.max(1.01, (opts.minAspect ?? 1.15) - 0.2);
    console.log(`[ocean] No rectangles met aspect ${MIN_ASPECT}, relaxing to ${relaxed.toFixed(2)}`);
    
    for (const seed of pool) {
      const r = growFromSeed(seed, {...opts, MIN_ASPECT: relaxed});
      const score = scoreRect(r, relaxed);
      if (score > bestScore) { 
        best = r; 
        bestScore = score; 
      }
    }
  }
  
  if (best) {
    console.log('[ocean] Selected horizontal rectangle:', {
      corner: best.corner,
      area: best.area,
      w: best.w,
      h: best.h,
      aspect: (best.w / best.h).toFixed(2),
      touchesCoast: best.touchesCoast,
      sanity: '✅ Valid horizontal rectangle selected'
    });
  }
  
  return best;
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

  // NOTE: Labels will be processed by placeLabelsAvoidingCollisions() which checks USE_SA_LABELER flag
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
  // Check feature flag for new annealer system
  if (USE_SA_LABELER) {
    console.log('[labels] Using SA labeler for lake/island labels (ocean excluded)');
    
    const metrics = computeLabelMetrics({ svg, labels });
    const clusters = findLabelClusters(metrics);
    
    const placed = [];
    const processedIds = new Set();
    
    // Step 1: Process lake/island clusters with performance guardrails
    for (const cluster of clusters) {
      const members = USE_SA_FOR_OCEANS ? cluster : cluster.filter(l => l.kind !== 'ocean');
      if (!members.length) continue;
      
      // Skip annealing for clusters of size 1-2 (no benefit)
      if (members.length <= 2) {
        // Use simple placement for small clusters
        members.forEach(l => {
          placed.push({
            ...l,
            w: Math.max(80, Math.min(500, l.text.length * 8)) * Math.min(1.0, Math.max(0.6, l.area / 1000)),
            h: 18 * Math.min(1.0, Math.max(0.6, l.area / 1000)),
            placed: { x: l.x, y: l.y },
            scale: Math.min(1.0, Math.max(0.6, l.area / 1000)),
            overlapped: false
          });
          processedIds.add(l.id);
        });
        continue;
      }
      
      const pad = 64;
      const xs = members.map(m => m.x), ys = members.map(m => m.y);
      const bounds = { 
        x0: Math.min(...xs) - pad, 
        y0: Math.min(...ys) - pad,
        x1: Math.max(...xs) + pad, 
        y1: Math.max(...ys) + pad 
      };
      
      // Performance guardrails: clamp sweeps based on cluster size
      let sweeps = Math.min(800, Math.max(200, 200 + 2 * members.length));
      if (members.length > 60) {
        sweeps = Math.floor(sweeps * 0.7); // Reduce by ~30% for large clusters
      }
      
      if (window.DEBUG) {
        console.log(`[labels] SA cluster: ${members.length} labels, ${sweeps} sweeps`);
      }
      
      const annealed = annealLabels({ labels: members, bounds, sweeps });
      placed.push(...annealed);
      
      // Mark as processed
      annealed.forEach(l => processedIds.add(l.id));
    }
    
    // Step 3: Merge in any labels we skipped (non-ocean labels only)
    for (const label of labels) {
      if (!processedIds.has(label.id) && label.kind !== 'ocean') {
        // Use existing centroid as placed position for skipped labels
        placed.push({
          ...label,
          w: Math.max(80, Math.min(500, label.text.length * 8)) * Math.min(1.0, Math.max(0.6, label.area / 1000)),
          h: 18 * Math.min(1.0, Math.max(0.6, label.area / 1000)),
          placed: { x: label.x, y: label.y },
          scale: Math.min(1.0, Math.max(0.6, label.area / 1000)),
          overlapped: false
        });
      }
    }
    
    // Sort placed labels by priority and area (for efficient zoom filtering)
    const sort = (a,b) => (b.priority??0)-(a.priority??0) || (b.area??0)-(a.area??0);
    placed.sort(sort);
    
    // Ensure each label has a stable ID
    ensureIds(placed);
    
    // Debug: Check for remaining overlaps (post-assertion)
    if (window.DEBUG) {
      checkRemainingOverlaps(placed);
    }
    
    // One-cluster fallback: if overlaps remain, run a single anneal over all non-ocean labels
    function countOverlaps(arr){
      let n=0;
      for (let i=0;i<arr.length;i++){
        const a = arr[i], ax = (a.placed?.x ?? a.x - a.width/2), ay = (a.placed?.y ?? a.y - a.height/2);
        for (let j=i+1;j<arr.length;j++){
          const b = arr[j], bx = (b.placed?.x ?? b.x - b.width/2), by = (b.placed?.y ?? b.y - b.height/2);
          if (ax < bx + b.width && ax + a.width > bx && ay < by + b.height && ay + a.height > by) n++;
        }
      }
      return n;
    }
    
    const overlapCount = countOverlaps(placed);
    if (overlapCount > 0) {
      console.log(`[labels] ${overlapCount} overlaps detected, running fallback one-cluster anneal`);
      
      // Get all non-ocean labels for fallback annealing
      const nonOceanLabels = placed.filter(l => l.kind !== 'ocean');
      if (nonOceanLabels.length > 1) {
        // Calculate bounds for all non-ocean labels
        const xs = nonOceanLabels.map(l => l.placed?.x ?? l.x), ys = nonOceanLabels.map(l => l.placed?.y ?? l.y);
        const pad = 64;
        const bounds = { 
          x0: Math.min(...xs) - pad, 
          y0: Math.min(...ys) - pad,
          x1: Math.max(...xs) + pad, 
          y1: Math.max(...ys) + pad 
        };
        
        // Run fallback annealing with moderate sweeps
        const sweeps = Math.min(600, Math.max(400, 400 + nonOceanLabels.length * 5));
        const fallbackAnnealed = annealLabels({ labels: nonOceanLabels, bounds, sweeps });
        
        // Update placed labels with fallback results
        for (const fallbackLabel of fallbackAnnealed) {
          const originalIndex = placed.findIndex(l => l.id === fallbackLabel.id);
          if (originalIndex !== -1) {
            placed[originalIndex] = fallbackLabel;
          }
        }
        
        const newOverlapCount = countOverlaps(placed);
        console.log(`[labels] fallback anneal complete: ${overlapCount} → ${newOverlapCount} overlaps`);
      }
    }
    
    return placed;
  }
  
  // Fallback to original system
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

// Safe number helper
function safe(val, fallback=0) {
  return Number.isFinite(val) ? val : fallback;
}

// Ensure every label has width/height (once per cycle)
export function ensureMetrics(labels, svg) {
  // Debug: check what we're getting
  if (window.DEBUG) {
    console.log('[ensureMetrics] svg type:', typeof svg, 'svg.append:', typeof svg?.append);
  }
  
  for (const d of labels) {
    // font by kind — match your current styles
    if (!Number.isFinite(d.font)) {
      d.font = (d.kind === 'ocean' ? 28 : d.kind === 'lake' ? 14 : 12);
    }
    if (!Number.isFinite(d.width) || d.width <= 0) {
      const approx = Math.max(8, (d.text?.length || 0) * d.font * 0.6);
      // Safety check: ensure svg is a D3 selection
      if (svg && typeof svg.append === 'function') {
        const measured = measureTextWidth(svg, d.text, { fontSize: d.font, weight: 700 });
        d.width = Number.isFinite(measured) && measured > 0 ? measured : approx;
      } else {
        d.width = approx;
      }
    }
    if (!Number.isFinite(d.height) || d.height <= 0) {
      d.height = Math.max(10, Math.round(d.font * 0.9));
    }
  }
}

// Seed ocean labels inside their chosen rectangle
function seedOceanIntoRect(oceanLabel) {
  const r = oceanLabel.keepWithinRect;
  if (!r) return;
  const availW = Math.max(0, r.x1 - r.x0 - oceanLabel.width);
  const availH = Math.max(0, r.y1 - r.y0 - oceanLabel.height);
  oceanLabel.x = r.x0 + availW / 2;
  oceanLabel.y = r.y0 + availH / 2;
  oceanLabel.anchor = {
    x: r.x0 + (r.x1 - r.x0)/2,
    y: r.y0 + (r.y1 - r.y0)/2,
    r: 4
  };
}

// Seed ocean label inside world rectangle (world coordinates)
export function seedOceanIntoWorldRect(l) {
  const r = l.keepWithinRect;        // world coords!
  const k = d3.zoomTransform(d3.select('#map').node()).k || 1;

  // your d.width/d.height are in *screen* px; convert to world units
  const wWorld = l.width  / k;
  const hWorld = l.height / k;

  const cx = r.x0 + Math.max(0, (r.x1 - r.x0 - wWorld)) / 2;
  const cy = r.y0 + Math.max(0, (r.y1 - r.y0 - hWorld)) / 2;

  // SA uses top-left box; store world-space box
  l.x = cx;
  l.y = cy;

  // anchor = rect center in world coords so energy doesn't pull to old centroid
  l.anchor = { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, r: 4 };
}

// Helper function to get label position, preferring SA output when present
function labelDrawXY(d) {
  const k = d3.zoomTransform(d3.select('#map').node()).k || 1;
  if (d.placed && Number.isFinite(d.placed.x) && Number.isFinite(d.placed.y)) {
    const wWorld = d.width  / k;
    const hWorld = d.height / k;
    return { x: d.placed.x + wWorld / 2, y: d.placed.y + hWorld * 0.75 };
  }
  return { x: d.x, y: d.y };
}

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
  merged.attr('transform', d => {
    const p = labelDrawXY(d);
    // last-resort guard: never return NaN
    const x = safe(p.x, 0);
    const y = safe(p.y, 0);
    return `translate(${x},${y})`;
  });
  
  // Update stroke text
  merged.select('text.stroke')
    .text(d => d.text)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('font-size', d => d.font || 16) // Use computed font size from metrics
    .classed('is-visible', false) // Hidden by default
    .classed('ocean', d.kind === 'ocean') // Add ocean class for styling
    .classed('lake', d.kind === 'lake') // Add lake class for styling
    .classed('island', d.kind === 'island'); // Add island class for styling
  
  // Update fill text
  merged.select('text.fill')
    .text(d => d.text)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('font-size', d => d.font || 16) // Use computed font size from metrics
    .classed('is-visible', false) // Hidden by default
    .classed('ocean', d.kind === 'ocean') // Add ocean class for styling
    .classed('lake', d.kind === 'lake') // Add lake class for styling
    .classed('island', d.kind === 'island'); // Add island class for styling
  
  if (window.DEBUG) console.log('[labels] DEBUG: Rendered', merged.size(), 'labels');
  
  // Debug overlay: show final boxes behind text
  if (window.DEBUG && DEBUG_LABEL_BOXES) {
    const dbg = d3.select('#labels-debug').selectAll('rect').data(placed, d => d.id);
    dbg.enter().append('rect')
      .attr('fill', 'none')
      .attr('stroke', '#000')
      .attr('stroke-opacity', 0.25)
      .merge(dbg)
      .attr('x', d => (d.placed ? d.placed.x : d.x - d.width/2))
      .attr('y', d => (d.placed ? d.placed.y : d.y - d.height/2))
      .attr('width',  d => d.width)
      .attr('height', d => d.height);
    dbg.exit().remove();
  }
  
  // Count overlaps after placement
  function countOverlaps(arr){
    let n=0;
    for (let i=0;i<arr.length;i++){
      const a = arr[i], ax = (a.placed?.x ?? a.x - a.width/2), ay = (a.placed?.y ?? a.y - a.height/2);
      for (let j=i+1;j<arr.length;j++){
        const b = arr[j], bx = (b.placed?.x ?? b.x - b.width/2), by = (b.placed?.y ?? b.y - b.height/2);
        if (ax < bx + b.width && ax + a.width > bx && ay < by + b.height && ay + a.height > by) n++;
      }
    }
    return n;
  }
  console.log('[labels] overlaps after SA:', countOverlaps(placed));
}

// On zoom: update transform with scaling
export function updateLabelZoom({ svg, groupId, k }) {
  // last-resort guard: ensure k is finite and positive
  const safeK = Number.isFinite(k) && k > 0 ? k : 1;
  
  svg.select(`#${groupId}`).selectAll('g.label')
    .attr('transform', d => {
      const p = labelDrawXY(d);
      const labelScale = d.scale || 1.0;
      // last-resort guard: never return NaN
      const x = safe(p.x, 0);
      const y = safe(p.y, 0);
      return `translate(${x},${y}) scale(${labelScale / safeK})`;
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

// New scoring function that requires horizontal aspect ratio
function scoreRect(r, minAspect) {
  if (!r) return -Infinity;
  const aspect = r.w / Math.max(1, r.h);
  if (aspect < minAspect) return -Infinity; // must be horizontal enough
  return r.w * r.h; // plain area once orientation passes
}

// Constrain growth so it keeps the rectangle horizontal
function growFromSeed(seed, opts) {
  let {x0, y0, x1, y1, w, h} = seed;
  const step = opts.step || 8;
  const bounds = opts.bounds; // [x0,y0,x1,y1]
  const minAspect = opts.MIN_ASPECT ?? 1.15;
  
  // Convert to x,y,w,h format for easier manipulation
  let x = x0, y = y0;
  
  // Helper functions to check if we can grow in each direction
  const canGrowLeft = (x, y, w, h) => {
    const newX = x - step;
    return newX >= bounds[0] && opts.isWaterAt(newX, y) && opts.isWaterAt(newX, y + h);
  };
  
  const canGrowRight = (x, y, w, h) => {
    const newX = x + w + step;
    return newX <= bounds[2] && opts.isWaterAt(newX, y) && opts.isWaterAt(newX, y + h);
  };
  
  const canGrowUp = (x, y, w, h) => {
    const newY = y - step;
    return newY >= bounds[1] && opts.isWaterAt(x, newY) && opts.isWaterAt(x + w, newY);
  };
  
  const canGrowDown = (x, y, w, h) => {
    const newY = y + h + step;
    return newY <= bounds[3] && opts.isWaterAt(x, newY) && opts.isWaterAt(x + w, newY);
  };
  
  // Prefer widening first to lock in horizontal orientation.
  let horizontalGrowth = 0;
  while (canGrowLeft(x, y, w, h) || canGrowRight(x, y, w, h)) {
    // choose the side that has more room / keeps water
    const tryLeft = canGrowLeft(x, y, w, h);
    const tryRight = canGrowRight(x, y, w, h);
    
    // Always grow horizontally if possible, prioritize the side with more room
    if (tryLeft && tryRight) {
      // If both sides available, choose the one that gives better aspect ratio
      if (w < h) {
        // If still very tall, grow both sides equally
        x -= step; w += step * 2;
      } else {
        // If getting wider, grow the side with more room
        x -= step; w += step;
      }
    } else if (tryLeft) {
      x -= step; w += step;
    } else if (tryRight) {
      w += step;
    } else {
      break;
    }
    
    horizontalGrowth += step;
    
    // Stop if we've achieved a reasonable horizontal aspect
    if ((w / h) >= 1.5) break;
  }
  
  console.log(`[ocean] growFromSeed: after horizontal growth, w=${w}, h=${h}, aspect=${(w/h).toFixed(2)}, horizontalGrowth=${horizontalGrowth}`);
  
  // Now grow vertically while preserving aspect >= minAspect
  while (true) {
    const wantUp = canGrowUp(x, y, w, h);
    const wantDn = canGrowDown(x, y, w, h);
    if (!wantUp && !wantDn) break;
    // if growing would break aspect, stop
    const nextH = h + step;
    if ((w / nextH) < minAspect) break;
    if (wantUp && (!wantDn || h < w * 0.5)) { y -= step; h += step; }
    else if (wantDn) { h += step; }
    else break;
  }
  
  // Convert back to x0,y0,x1,y1 format
  return {
    x0: x, y0: y, x1: x + w, y1: y + h,
    w, h,
    area: w * h,
    touchesCoast: seed.touchesCoast,
    corner: seed.corner
  };
}

// ===== Ocean Label Placement After Autofit =====

// 1) Cheap water test using XY accessor
function pointIsOcean(x, y, { onlyOcean = true } = {}) {
  const i = window.xyIndex?.get?.(x, y);
  if (i == null) return true; // off the mesh = open ocean
  const c = cells[i];
  const water = c.h <= 0;
  if (!onlyOcean) return water;
  return water && (c.featureType === 'Ocean' || c.ocean === 1 || c.lake === 0 || c.lake == null);
}

// 2) Build water mask + SAT (of LAND)
function buildWaterMaskSAT(bounds, step = 8, pointIsOcean) {
  const [minX, minY, maxX, maxY] = bounds;
  const cols = Math.max(1, Math.floor((maxX - minX) / step));
  const rows = Math.max(1, Math.floor((maxY - minY) / step));

  const mask = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = minX + c * step + step / 2;
      const y = minY + r * step + step / 2;
      mask[r][c] = pointIsOcean(x, y) ? 1 : 0;
    }
  }

  const sat = Array.from({ length: rows + 1 }, () => Array(cols + 1).fill(0));
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      const land = mask[r - 1][c - 1] ? 0 : 1;
      sat[r][c] = land + sat[r - 1][c] + sat[r][c - 1] - sat[r - 1][c - 1];
    }
  }

  function landCount(i0, j0, i1, j1) {
    i0 = Math.max(0, i0); j0 = Math.max(0, j0);
    i1 = Math.min(cols - 1, i1); j1 = Math.min(rows - 1, j1);
    if (i0 > i1 || j0 > j1) return 0;
    return sat[j1 + 1][i1 + 1] - sat[j0][i1 + 1] - sat[j1 + 1][i0] + sat[j0][i0];
  }

  return { mask, sat, cols, rows, step, origin: [minX, minY], landCount };
}

// 3) Largest horizontal rectangle of 1s (width >= height)
// (keep your existing implementation; included here only for context)
function largestHorizontalWaterRect({ mask, cols, rows }) {
  const heights = Array(cols).fill(0);
  let best = null;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) heights[c] = mask[r][c] ? heights[c] + 1 : 0;

    const stack = [];
    for (let c = 0; c <= cols; ) {
      const h = (c === cols) ? 0 : heights[c];
      if (!stack.length || h >= heights[stack[stack.length - 1]]) {
        stack.push(c++);
      } else {
        const top = stack.pop();
        const height = heights[top];
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const right = c - 1;
        const width = right - left + 1;
        if (width >= height) {
          const area = width * height;
          if (!best || area > best.area) {
            best = { area, left, right, top: r - height + 1, bottom: r, width, height };
          }
        }
      }
    }
  }
  return best;
}

// 4) Shrink until there is zero land inside (with padding),
//    while preserving a minimum horizontal aspect ratio.
function shrinkUntilAllWater(rect, landCount, pad = 1, minAspect = 2.0) {
  let { left, right, top, bottom } = rect;
  const center = () => ({
    cx: (left + right) / 2,
    cy: (top + bottom) / 2
  });

  const width  = () => right - left + 1;
  const height = () => bottom - top + 1;
  const aspect = () => width() / Math.max(1, height());

  const hasLand = () => landCount(left, top, right, bottom) > 0;

  // Helper: trim a row or column from the side with more bordering land; if tie, trim toward outside
  const trimVertical = () => { // remove from top OR bottom
    const landTop    = landCount(left - pad, top - pad, right + pad, top);
    const landBottom = landCount(left - pad, bottom, right + pad, bottom + pad);
    if (landTop > landBottom) top++;
    else if (landBottom > landTop) bottom--;
    else {
      // tie: keep the center stable
      const { cy } = center();
      if (Math.abs((top + 1) - cy) < Math.abs((bottom - 1) - cy)) top++; else bottom--;
    }
  };
  const trimHorizontal = () => { // remove from left OR right
    const landLeft  = landCount(left - pad, top - pad, left, bottom + pad);
    const landRight = landCount(right, top - pad, right + pad, bottom + pad);
    if (landLeft > landRight) left++;
    else if (landRight > landLeft) right--;
    else {
      const { cx } = center();
      if (Math.abs((left + 1) - cx) < Math.abs((right - 1) - cx)) left++; else right--;
    }
  };

  // Main loop: remove land first. If no land remains but aspect is too tall,
  // trim vertically until aspect >= minAspect (height shrinks, preserving width).
  let guard = 0;
  while (guard++ < 10000 && (hasLand() || aspect() < minAspect)) {
    // If the rect is too tall, favor vertical trimming *unless* that would
    // immediately create land (rare). When land exists, we still prioritize
    // removing land first, but we choose the trim direction that best maintains
    // or improves aspect.
    const tooTall = aspect() < minAspect;

    if (hasLand()) {
      // choose trim that both removes the most land and keeps it horizontal
      const w = width(), h = height();
      const preferVertical = (h >= w) || tooTall; // shrink rows if tall
      if (preferVertical) trimVertical(); else trimHorizontal();
    } else {
      // only aspect left to fix — shrink height
      trimVertical();
    }

    if (left > right || top > bottom) break; // exhausted
  }

  return {
    left, right, top, bottom,
    width: Math.max(0, right - left + 1),
    height: Math.max(0, bottom - top + 1)
  };
}

// 3b) Find the top-K largest horizontal water rectangles in the SAT environment
function largestHorizontalWaterRects(satEnv, K = 12) {
  const { cols, rows, landCount } = satEnv;
  const out = [];
  
  console.log(`[ocean] Searching for rectangles in ${cols}x${rows} grid`);
  
  // Try all possible rectangle sizes and positions
  for (let h = 1; h <= rows; h++) {
    for (let w = h * 2; w <= cols; w++) { // enforce minAspect 2.0
      for (let top = 0; top <= rows - h; top++) {
        for (let left = 0; left <= cols - w; left++) {
          const right = left + w - 1;
          const bottom = top + h - 1;
          
          // Count land cells in this rectangle (0 = all water)
          const landInRect = landCount(left, top, right, bottom);
          
          // Must be all water (no land)
          if (landInRect === 0) {
            out.push({
              area: w * h,
              left, right,
              top: top,
              bottom: bottom,
              width: w, height: h
            });
          }
        }
      }
    }
  }
  
  console.log(`[ocean] Found ${out.length} raw rectangles before deduplication`);

  // De-dupe near-duplicates (bin by coarse center/size) and keep top-K by area
  const seen = new Set();
  const uniq = [];
  for (const rc of out) {
    const cx = (rc.left + rc.right) / 2;
    const cy = (rc.top + rc.bottom) / 2;
    const key = `${Math.round(cx/3)}:${Math.round(cy/3)}:${Math.round(rc.width/3)}:${Math.round(rc.height/3)}`;
    if (!seen.has(key)) { seen.add(key); uniq.push(rc); }
  }
  uniq.sort((a,b) => b.area - a.area);
  return uniq.slice(0, K);
}

// Score that prefers big banners with some height and not hugging edges
function scoreOceanRect(px, visibleBounds) {
  const [vx, vy, vw, vh] = visibleBounds;
  const Vw = vw - vx, Vh = vh - vy;
  const area = px.w * px.h;
  const heightBonus = Math.min(px.h / 80, 1.25); // saturate around 80px tall
  const cx = px.x + px.w / 2, cy = px.y + px.h / 2;
  const margin = Math.min(cx - vx, cy - vy, vx + Vw - cx, vy + Vh - cy) - Math.min(px.w, px.h)/2;
  const edgePenalty = Math.max(0.65, Math.min(1, margin / 60));
  return area * heightBonus * edgePenalty;
}

function gridRectToPixels(rect, origin, step) {
  const [minX, minY] = origin;
  return {
    x: minX + rect.left * step,
    y: minY + rect.top * step,
    w: rect.width * step,
    h: rect.height * step
  };
}

// Final safety: if the rect is still too tall (e.g., degenerate masks at edges),
// shave extra rows symmetrically until minAspect is met or we hit height=1.
function enforceMinAspect(pxRect, minAspect) {
  let { x, y, w, h } = { x: pxRect.x, y: pxRect.y, w: pxRect.w, h: pxRect.h };
  if (w >= h * minAspect) return pxRect;
  const targetH = Math.max(1, Math.floor(w / minAspect));
  const trim = Math.max(0, h - targetH);
  // Keep center: move y down by half the trim and reduce h
  y += Math.floor(trim / 2);
  h -= trim;
  return { x, y, w, h };
}

// Exported entry point: call this AFTER autofit
export function findOceanLabelRectAfterAutofit(
  visibleBounds,
  getCellAtXY,
  seaLevel = 0.2,
  step = 8,
  pad = 1,
  minAspect = 2.0
) {
  console.log(`[ocean] Using post-autofit bounds: [${visibleBounds.join(', ')}]`);

  const transform = d3.zoomTransform(d3.select('#world').node() || d3.select('svg').node());

  function pxToWorld(x, y) { 
    return { x: (x - transform.x) / transform.k, y: (y - transform.y) / transform.k }; 
  }

  function localPointIsOcean(px, py, { onlyOcean = true } = {}) {
    const { x, y } = pxToWorld(px, py);           // ← convert to world
    const cell = getCellAtXY?.(x, y);
    if (!cell) return true;
    let height = cell.height ?? cell.data?.height ?? cell.polygon?.height ?? null;
    const featureType = cell.featureType ?? cell.data?.featureType ?? null;
    if (height == null) return true;
    const water = height <= seaLevel;
    return onlyOcean ? (water && featureType !== 'Lake') : water;
  }

  const satEnv = buildWaterMaskSAT(visibleBounds, step, localPointIsOcean);

  // NEW: collect top-K horizontal rects, then re-rank by a label-friendly score
  const candidates = largestHorizontalWaterRects(satEnv, 12);
  if (!candidates.length) {
    console.warn('[ocean] No horizontal water rect candidates; will fallback.');
    return null;
  }

  let bestPx = null; let bestScore = -Infinity;
  for (const r of candidates) {
    let rect = shrinkUntilAllWater(r, satEnv.landCount, pad, minAspect);
    if (rect.width < 1 || rect.height < 1) continue;
    let px = gridRectToPixels(rect, satEnv.origin, satEnv.step);
    if (px.w < px.h * minAspect) px = enforceMinAspect(px, minAspect);
    const score = scoreOceanRect(px, visibleBounds);
    if (score > bestScore) { bestScore = score; bestPx = px; }
  }

  if (!bestPx) {
    console.warn('[ocean] All candidate rects invalid after shrink; will fallback.');
    return null;
  }

  console.log(`[ocean] Final pixels (ranked): ${bestPx.w}x${bestPx.h} at (${bestPx.x},${bestPx.y})`);
  
  // Convert screen coordinates to world coordinates using the same transform
  function screenToWorldRect(s) {
    return {
      x0: (s.x - transform.x) / transform.k,
      y0: (s.y - transform.y) / transform.k,
      x1: (s.x + s.w - transform.x) / transform.k,
      y1: (s.y + s.h - transform.y) / transform.k,
    };
  }
  
  const oceanRectWorld = screenToWorldRect(bestPx);
  bestPx._debugRectScreen = bestPx; // Store screen coords for debug overlay
  bestPx.keepWithinRect = oceanRectWorld; // Store world bounds for SA
  
  return bestPx;
}

// Optional (nice UX): only accept rects that can fit the text horizontally at (or slightly below) your base font size
export function fitFontToRect(text, rect, basePx, family = 'serif') {
  // Use the existing measureTextWidth function for consistency
  const svg = d3.select('svg').node() ? d3.select('svg') : d3.select('body').append('svg');
  const textW = measureTextWidth(svg, text, { fontSize: basePx, family, weight: 700 });
  const textH = basePx * 1.2;
  
  const scale = Math.min(1, 0.9 * rect.w / textW, 0.8 * rect.h / textH);
  return { 
    fontSize: Math.floor(basePx * scale), 
    fits: scale >= 0.6,
    originalWidth: textW,
    originalHeight: textH,
    scale: scale
  };
}

// Optional debug draw (expects a <g id="debug"> layer)
export function drawDebugOceanRect(pxRect) {
  const svg = d3.select('svg');
  const W = +svg.attr('width'), H = +svg.attr('height');
  const pad = 0; // or 4-8 if you want inset

  if (!pxRect) {
    // Clear existing debug rectangles
    const g = window.debugOverlays?.overlayScreen || svg;
    g.selectAll('rect.ocean-debug').remove();
    return;
  }

  // Clamp to visible viewport
  const x1 = Math.max(pad, pxRect.x);
  const y1 = Math.max(pad, pxRect.y);
  const x2 = Math.min(W - pad, pxRect.x + pxRect.w);
  const y2 = Math.min(H - pad, pxRect.y + pxRect.h);

  const clamped = { 
    x: x1, 
    y: y1, 
    width: Math.max(0, x2 - x1), 
    height: Math.max(0, y2 - y1) 
  };

  const g = window.debugOverlays?.overlayScreen || svg;
  g.selectAll('rect.ocean-debug').remove();
  g.append('rect')
    .attr('class', 'ocean-debug')
    .attr('x', clamped.x)
    .attr('y', clamped.y)
    .attr('width', clamped.width)
    .attr('height', clamped.height)
    .attr('fill', 'none')
    .attr('stroke', 'red')
    .attr('stroke-dasharray', '6,6')
    .attr('stroke-width', 2);

  console.log(`[ocean] Debug rect clamped to viewport: ${clamped.width}x${clamped.height} at (${clamped.x},${clamped.y})`);
}

// Place ocean label with font scaling to fit the rectangle
export function placeOceanLabelAt(cx, cy, maxWidth, oceanLabel, svg, opts = {}) {
  const {
    baseFS = 28,      // desired ocean font size
    minFS  = 16,      // don't go smaller than this
    pad    = 10       // inner padding inside the rect
  } = opts;

  // Create a temp text node to measure width
  const t = svg.append('text')
    .attr('x', -99999).attr('y', -99999) // Off-screen for measurement
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('font-size', baseFS)
    .attr('font-weight', 700)
    .text(oceanLabel.text);

  // Shrink font until text fits
  let fs = baseFS;
  while (fs > minFS) {
    t.attr('font-size', fs);
    const textW = t.node().getComputedTextLength();
    if (textW <= maxWidth * 0.9) break; // 90% of available width
    fs -= 2; // Reduce by 2px each iteration
  }

  // Remove temp node
  t.remove();

  // Place the actual label in screen coordinates (outside the zoomed world group)
  // This ensures the label appears at the correct screen position regardless of zoom
  let screenLabelsGroup = svg.select('#screen-labels');
  if (screenLabelsGroup.empty()) {
    // Create screen-labels group if it doesn't exist (outside the viewport/world zoom)
    screenLabelsGroup = svg.append('g').attr('id', 'screen-labels');
    // Ensure it's above other elements but below HUD
    screenLabelsGroup.raise();
  }
  
  const label = screenLabelsGroup.append('text')
    .attr('class', 'place-label ocean')
    .attr('x', cx)
    .attr('y', cy)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('font-size', fs)
    .text(oceanLabel.text);

  console.log(`[ocean] Placed label "${oceanLabel.text}" at screen coords (${cx.toFixed(1)}, ${cy.toFixed(1)}) with font size ${fs}px`);
  
  return label;
}

// Clear debug overlays (call this on zoom/pan)
export function clearDebugOverlays() {
  const g = window.debugOverlays?.overlayScreen;
  if (g) {
    g.selectAll('rect.ocean-debug').remove();
  }
}

// Clear screen labels (call this on zoom/pan to reposition labels)
export function clearScreenLabels() {
  const svg = d3.select('svg');
  const screenLabels = svg.select('#screen-labels');
  if (!screenLabels.empty()) {
    screenLabels.selectAll('*').remove();
  }
}

// Remove any previously placed ocean labels
export function clearExistingOceanLabels(rootSel = d3.select('#labels')) {
  try { rootSel.selectAll('text.label.ocean').remove(); } catch (e) {}
}

// Normalize rectangle to consistent {x, y, width, height} format
export function toPxRect(r) {
  if (!r) return null;

  // Array form: [x, y, w, h]
  if (Array.isArray(r)) {
    const [x, y, w, h] = r.map(Number);
    return { x, y, width: w, height: h };
  }

  // Object form: allow x/y + w/h or width/height, or DOMRect-like
  const x = Number(r.x ?? r.left ?? r[0] ?? 0);
  const y = Number(r.y ?? r.top ?? r[1] ?? 0);

  let width  = r.width;
  if (width == null) width = r.w;
  if (width == null && r.right != null && r.left != null) width = Number(r.right) - Number(r.left);
  if (width == null && Array.isArray(r)) width = Number(r[2]);
  width = Number(width ?? 0);

  let height = r.height;
  if (height == null) height = r.h;
  if (height == null && r.bottom != null && r.top != null) height = Number(r.bottom) - Number(r.top);
  if (height == null && Array.isArray(r)) height = Number(r[3]);
  height = Number(height ?? 0);

  return { x, y, width, height };
}

// Place a single ocean label centered in the chosen rectangle (styled like the default)
export function placeOceanLabelCentered(parentSel, name, rectLike, fallback = null) {
  const R = toPxRect(rectLike) || toPxRect(fallback) || { x: 0, y: 0, width: 0, height: 0 };
  const cx = R.x + R.width / 2;
  const cy = R.y + R.height / 2;
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;

  // clamp settings
  const MIN_PX = 18;
  const MAX_OCEAN_FONT_PX = 24; // ← pick your ceiling (try 48–64)

  // provisional based on rect height
  const provisional = Math.max(MIN_PX, Math.min(MAX_OCEAN_FONT_PX, R.height * 0.6));

  // create text (let CSS handle styling)
  const text = parentSel.append('text')
    .attr('class', 'place-label ocean')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('x', cx)
    .attr('y', cy)
    .text(name)
    .style('font-size', `${provisional}px`);

  // fit to rect, then clamp again
  let bbox = text.node().getBBox();
  const maxW = Math.max(1, R.width  * 0.90);
  const maxH = Math.max(1, R.height * 0.80);
  const scale = Math.min(1, maxW / bbox.width, maxH / bbox.height);

  const base = parseFloat(text.style('font-size'));
  const fitted = Math.max(MIN_PX, Math.min(MAX_OCEAN_FONT_PX, base * scale));
  text.style('font-size', `${fitted}px`);

  // re-center (after size change)
  text.attr('x', R.x + R.width / 2).attr('y', R.y + R.height / 2);
}

// Screen-space debug rectangle drawing (no zoom transform)

// ===============================
// BBox-based empty-rectangle mode
// ===============================

// Build land-component bounding boxes (in GRID cells) from SAT env
function landBBoxesFromSAT(env, padCells = 1) {
  const { mask, rows, cols } = env; // mask[r][c] === true => water
  const seen = Array.from({length: rows}, () => Array(cols).fill(false));
  const boxes = [];

  const inb = (r,c) => r>=0 && r<rows && c>=0 && c<cols;
  const q = [];
  for (let r=0; r<rows; r++) {
    for (let c=0; c<cols; c++) {
      if (seen[r][c] || mask[r][c]) continue; // skip water; we want LAND comps
      let minR=r, maxR=r, minC=c, maxC=c;
      seen[r][c] = true; q.length = 0; q.push([r,c]);
      while (q.length) {
        const [rr,cc] = q.pop();
        if (rr<minR) minR=rr; if (rr>maxR) maxR=rr; if (cc<minC) minC=cc; if (cc>maxC) maxC=cc;
        const nb = [[rr-1,cc],[rr+1,cc],[rr,cc-1],[rr,cc+1]];
        for (const [nr,nc] of nb) {
          if (!inb(nr,nc) || seen[nr,nc] || mask[nr,nc]) continue; // mask==true is water
          seen[nr,nc] = true; q.push([nr,nc]);
        }
      }
      // pad and clamp
      minR = Math.max(0, minR - padCells);
      maxR = Math.min(rows-1, maxR + padCells);
      minC = Math.max(0, minC - padCells);
      maxC = Math.min(cols-1, maxC + padCells);
      boxes.push({ top:minR, bottom:maxR, left:minC, right:maxC });
    }
  }
  return boxes;
}

function gridBoxToPixels(box, origin, step) {
  const [minX, minY] = origin;
  return {
    x: minX + box.left * step,
    y: minY + box.top * step,
    w: (box.right - box.left + 1) * step,
    h: (box.bottom - box.top + 1) * step
  };
}

// 1D interval subtraction utility
function subtractIntervals(baseStart, baseEnd, blocks) {
  // blocks: array of [s,e] to remove; assume s<e, may overlap
  const out = [];
  let segs = [[baseStart, baseEnd]];
  blocks.sort((a,b)=>a[0]-b[0]);
  for (const [bs,be] of blocks) {
    const next=[];
    for (const [s,e] of segs) {
      if (be<=s || bs>=e) { next.push([s,e]); continue; }
      if (bs>s) next.push([s, bs]);
      if (be<e) next.push([be, e]);
    }
    segs = next;
  }
  for (const seg of segs) if (seg[1]-seg[0]>0) out.push(seg);
  return out;
}

// Given obstacle boxes (pixels), find the largest horizontal rect in the viewport
function largestEmptyHorizontalRectAmongBoxes(visibleBounds, obstacles, minAspect=2.0) {
  const [vx, vy, vw, vh] = visibleBounds; const Vx2=vx+vw, Vy2=vy+vh;
  const xs = new Set([vx, Vx2]);
  const ys = new Set([vy, Vy2]);
  for (const b of obstacles) {
    xs.add(Math.max(vx, Math.min(Vx2, b.x)));
    xs.add(Math.max(vx, Math.min(Vx2, b.x + b.w)));
    ys.add(Math.max(vy, Math.min(Vy2, b.y)));
    ys.add(Math.max(vy, Math.min(Vy2, b.y + b.h)));
  }
  const X = Array.from(xs).sort((a,b)=>a-b);
  const Y = Array.from(ys).sort((a,b)=>a-b);

  let best=null, bestScore=-Infinity;
  for (let i=0;i<X.length;i++) for (let j=i+1;j<X.length;j++) {
    const x1=X[i], x2=X[j]; const w=x2-x1; if (w<=0) continue;
    // obstacles overlapping horizontally with [x1,x2]
    const blocks=[];
    for (const ob of obstacles) {
      const o1=ob.x, o2=ob.x+ob.w; if (o2<=x1 || o1>=x2) continue;
      blocks.push([ob.y, ob.y+ob.h]);
    }
    const frees = subtractIntervals(vy, Vy2, blocks);
    for (const [y1,y2] of frees) {
      const h=y2-y1; if (h<=0) continue;
      if (w < h*minAspect) continue; // enforce horizontal
      const cand = {x:x1,y:y1,w,h};
      const sc = scoreOceanRect(cand, visibleBounds);
      if (sc>bestScore) {bestScore=sc; best=cand;}
    }
  }
  return best;
}

export function findOceanRectByBBoxes(
  visibleBounds,
  getCellAtXY,
  seaLevel = 0.2,
  step = 8,
  landPadPx = 12,
  minAspect = 2.0
) {
  function localPointIsOcean(x, y) {
    const cell = getCellAtXY?.(x, y);
    if (!cell) return true;
    let h = cell.height ?? cell.data?.height ?? cell.polygon?.height ?? null;
    if (h == null) return true;
    return h <= seaLevel;
  }
  const satEnv = buildWaterMaskSAT(visibleBounds, step, localPointIsOcean);
  const landBoxesGrid = landBBoxesFromSAT(satEnv, Math.max(1, Math.round(landPadPx/step)));
  const obstacles = landBoxesGrid.map(b => gridBoxToPixels(b, satEnv.origin, satEnv.step));
  const best = largestEmptyHorizontalRectAmongBoxes(visibleBounds, obstacles, minAspect);
  if (best) return best;
  return null;
}

export function findOceanLabelRectHybrid(
  visibleBounds,
  getCellAtXY,
  seaLevel = 0.2,
  step = 8,
  pad = 1,
  minAspect = 2.0,
  landPadPx = 12
) {
  // Try SAT-grid method
  const satRect = findOceanLabelRectAfterAutofit(visibleBounds, getCellAtXY, seaLevel, step, pad, minAspect);
  // Try bbox obstacle method
  const bbRect = findOceanRectByBBoxes(visibleBounds, getCellAtXY, seaLevel, step, landPadPx, minAspect);
  if (satRect && !bbRect) return satRect;
  if (bbRect && !satRect) return bbRect;
  if (!satRect && !bbRect) return null;
  // Pick by scoring
  const s1 = scoreOceanRect(satRect, visibleBounds);
  const s2 = scoreOceanRect(bbRect, visibleBounds);
  return s2 > s1 ? bbRect : satRect;
}

// Debug function to check for remaining overlaps after SA placement
function checkRemainingOverlaps(placed) {
  let overlapCount = 0;
  const overlaps = [];
  
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      
      if (!a.w || !a.h || !b.w || !b.h) continue;
      
      const dx = Math.abs(a.placed.x - b.placed.x);
      const dy = Math.abs(a.placed.y - b.placed.y);
      
      if (dx < (a.w + b.w) / 2 && dy < (a.h + b.h) / 2) {
        overlapCount++;
        overlaps.push({
          label1: a.text,
          label2: b.text,
          overlap: Math.min((a.w + b.w) / 2 - dx, (a.h + b.h) / 2 - dy)
        });
      }
    }
  }
  
  if (overlapCount > 0) {
    console.log(`[labels] DEBUG: ${overlapCount} remaining overlaps after SA placement`);
    if (window.DEBUG_OVERLAPS) {
      console.log('[labels] DEBUG: Overlap details:', overlaps.slice(0, 5));
    }
  } else {
    console.log('[labels] DEBUG: No remaining overlaps after SA placement');
  }
}

// Debug toggle for SA labeler
export function toggleSALabeler() {
  // This would require a page reload to take effect
  console.log('[labels] To toggle SA labeler, edit src/modules/labels.js and change USE_SA_LABELER, then reload the page');
  return USE_SA_LABELER;
}

// Debug function to get SA labeler status
export function getSALabelerStatus() {
  return {
    enabled: USE_SA_LABELER,
    description: USE_SA_LABELER ? 'SA labeler is active' : 'Original system is active'
  };
}
