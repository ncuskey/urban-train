// d3 is global

// Stable label key: prefer a unique id; fallback to kind+name
const labelKey = d => {
  if (!d) return 'unknown';
  return d.label_id || d.id || `${d.kind || 'unknown'}:${(d.name||'').toUpperCase()}`;
};
export { labelKey };

// Helper functions for label positioning with zoom
function worldPoint(d) {
  if (!d) return { x: 0, y: 0 };
  if (d?.placed && Number.isFinite(d.placed.x) && Number.isFinite(d.placed.y)) return d.placed;
  if (d?.layout && Number.isFinite(d.layout.x) && Number.isFinite(d.layout.y)) return d.layout;
  if (d?.anchor && Number.isFinite(d.anchor.x) && Number.isFinite(d.anchor.y)) {
    const dx = (d?.offset?.dx ?? d?.dx ?? 0);
    const dy = (d?.offset?.dy ?? d?.dy ?? 0);
    return { x: d.anchor.x + dx, y: d.anchor.y + dy };
  }
  if (Number.isFinite(d?.x) && Number.isFinite(d?.y)) return { x: d.x, y: d.y };
  if (Number.isFinite(d?.cx) && Number.isFinite(d?.cy)) return { x: d.cx, y: d.cy };
  return { x: 0, y: 0 };
}

// Legacy helper functions removed - no longer needed with world coordinates + counter-scaling

// LOD opacity helper functions
const fadeW = 0.25; // or your tokens.fadeW

function smooth01(x){ return x<=0?0 : x>=1?1 : x*x*(3-2*x); }
function bandOpacity(k, z0, z1, w=fadeW){
  const a = smooth01((k-(z0-w))/w);
  const b = 1 - smooth01((k-(z1-w))/w);
  return Math.max(0, Math.min(a*b, 1));
}

function labelSelection(svg){
  return svg.select('#labels-world')
            .selectAll('g.label, g.ocean-label, g.label--ocean')
            .filter(d => d != null); // Skip nodes without data so logs don't get noisy
}

export function updateLabelLOD(svg){
  const t = d3.zoomTransform(svg.node());
  const k = t.k || 1;
  const win = (window.labelTokens?.lod?.tiers) || { t1:[0.8,3.2], t2:[1.8,4.4], t3:[3,6], t4:[4,7] };

  const sel = labelSelection(svg);

  // Only operate on nodes that actually have data
  const withData = sel.filter(function(d){ return d != null; });
  const withoutData = sel.filter(function(d){ return d == null; });

  // Safe path for data-bound labels
  withData.each(function(d,i){
    const tier = d.tier || 't1';
    const [z0,z1] = win[tier] || [0, 1e9];
    const o = bandOpacity(k, z0, z1);
    d3.select(this)
      .style('opacity', o)
      .style('pointer-events', o ? 'auto' : 'none')
      .attr('display', null);
    if (i < 5) console.log('[LOD]', i, {tier, k, z0, z1, o});
  });

  // Skip unbound nodes (e.g., debug markers) or give them a fixed opacity
  withoutData
    .style('opacity', 1)
    .style('pointer-events', 'none');

  console.log('[LOD] applied to', withData.size(), 'labels; unbound skipped:', withoutData.size());
}

export function applyLabelTransforms(svg){
  const t = d3.zoomTransform(svg.node());
  const k = Math.max(t.k || 1, 1e-6);

  labelSelection(svg).each(function(d){
    const a = (d && d.anchor) || d;     // accept {x,y} or whole datum
    if (!a) return;                      // skip unbound (e.g., smoke label)
    this.setAttribute('transform', `translate(${a.x},${a.y}) scale(${1/k})`);
  });

  // Optional: keep debug markers visible & constant-size
  svg.select('#labels-world')
     .selectAll('g.dbg')
     .attr('transform', `translate(100,100) scale(${1/k})`);
}

// Choose a world-space anchor for a label.
// Tries existing fields first, then falls back to polygon centroid.
export function labelAnchorWorld(d) {
  // 1) Existing anchor objects you might already have:
  if (d?.anchor && Number.isFinite(d.anchor.x) && Number.isFinite(d.anchor.y)) {
    return { x: d.anchor.x, y: d.anchor.y };
  }
  if (Number.isFinite(d?.x) && Number.isFinite(d?.y)) {
    return { x: d.x, y: d.y };
  }
  if (Number.isFinite(d?.cx) && Number.isFinite(d?.cy)) {
    return { x: d.cx, y: d.cy };
  }

  // 2) Polygon centroid fallbacks (common field names):
  const poly = d?.polygon || d?.ring || d?.points || d?.outline;
  if (Array.isArray(poly) && poly.length >= 3 && Array.isArray(poly[0])) {
    // poly is [[x,y], [x,y], ...]
    const [cx, cy] = d3.polygonCentroid(poly);
    if (Number.isFinite(cx) && Number.isFinite(cy)) return { x: cx, y: cy };
  }
  if (Array.isArray(d?.geometry?.coordinates)) {
    // support GeoJSON-like { type: "Polygon", coordinates: [ [ [x,y], ... ] ] }
    const coords = d.geometry.coordinates;
    const ring = Array.isArray(coords[0]) ? coords[0] : coords;
    if (Array.isArray(ring) && ring.length >= 3) {
      const [cx, cy] = d3.polygonCentroid(ring);
      if (Number.isFinite(cx) && Number.isFinite(cy)) return { x: cx, y: cy };
    }
  }

  // 3) Last resort: 0,0 (but log it in DEBUG so we can fix data)
  if (window.DEBUG) console.warn('[labels] no anchor for', d?.name, d);
  return { x: 0, y: 0 };
}

/**
 * Invariants:
 * 1) Ocean SAT rect is stored on datum in WORLD units: d.keepWithinRect.units === 'world'
 * 2) Fitter computes fontPx in SCREEN pixels; we always set font-size = fontPx / k.
 * 3) Ocean text x/y are WORLD coords (middle anchored), so the label stays glued to the world on zoom.
 * 4) After second pass, if ocean fit succeeds, do NOT re-run LOD/budget culls.
 * 5) assertOceanWithinRect must log true on first render.
 */

import {getZoomState} from './interaction.js';
import { fontPxFor, getLabelTokens, opacityForZoom } from './labelTokens.js';

// Robust tier extraction - datum first, then CSS class fallback
function tierFrom(selNode, d){
  if (d?.tier != null) return d.tier;
  if (!selNode || !selNode.classList) return 3;
  const cls = selNode.classList;
  const m = [...cls].find(k => /^tier-\d$/.test(k));
  if (m) return +m.split('-')[1];
  return 3;
}

// Robust visibility updater - recompute on every zoom with tier fallback
export function updateLabelVisibility(svg){
  if (!svg || !svg.node) {
    console.warn('[labels] updateLabelVisibility: invalid svg', svg);
    return;
  }
  try {
    const t = d3.zoomTransform(svg.node());
    const fade = !!window.labelFlags?.fadeBands;

    svg.selectAll('#labels-world-areas g.label, #labels-world-ocean g.label--ocean')
      .each(function(d){
        if (!d) return;
        const tier = tierFrom(this, d);
        const o = fade ? opacityForZoom(t.k, tier) : (opacityForZoom(t.k, tier, 0) > 0 ? 1 : 0);
        d3.select(this).classed('is-visible', o > 0).style('opacity', o);
      });
  } catch (e) {
    console.warn('[labels] updateLabelVisibility: error', e);
  }
}

// Legacy LOD visibility updater - kept for backward compatibility
export function updateLabelVisibilityLOD(svg){
  if (!svg || !svg.node) {
    console.warn('[labels] updateLabelVisibilityLOD: invalid svg', svg);
    return;
  }
  try {
    const t = d3.zoomTransform(svg.node());
    const fade = !!window.labelFlags?.fadeBands;

    const all = svg.selectAll('#labels-world-areas g.label, #labels-world-ocean g.label--ocean');
    all.each(function(d){
      if (!d) return;
      const tier = d?.tier ?? 3;
      const o = fade ? opacityForZoom(t.k, tier) : (opacityForZoom(t.k, tier, 0) > 0 ? 1 : 0);
      d3.select(this).classed('is-visible', o > 0).style('opacity', o);
    });
  } catch (e) {
    console.warn('[labels] updateLabelVisibilityLOD: error', e);
  }
}



// --- Tiering helper functions ---

// helper (add at top-level in labels.js)
export function quantilesOf(arr, qs=[0.5, 0.7, 0.85]) {
  if (!Array.isArray(arr) || !arr.length) return { q50: Infinity, q70: Infinity, q85: Infinity };
  if (!Array.isArray(qs) || qs.length === 0) qs = [0.5, 0.7, 0.85];
  const a = [...arr].sort((x,y)=>x-y);
  const pick = q => a[Math.max(0, Math.min(a.length-1, Math.floor(q*(a.length-1))))];
  return { q50: pick(0.5), q70: pick(0.7), q85: pick(0.85) };
}

export function baseFontPxForTier(tier) {
  if (tier == null || tier < 1 || tier > 4) return 12; // Default to smallest
  return tier === 1 ? 26
       : tier === 2 ? 18
       : tier === 3 ? 14
       :               12;
}

export function rankTier(label, q) {
  if (!label) return 4;
  if (label.kind === 'ocean') return 1; // Ocean = Tier 1
  const A = label.area || 0;
  if (label.kind === 'island') {
    if (A >= q.islands.q85) return 2;       // Major Island
    if (A >= q.islands.q50) return 3;       // Minor Island
    return 4;                               // Tiny Island
  }
  if (label.kind === 'lake') {
    if (A >= q.lakes.q70) return 3;         // Large Lake
    return 4;                               // Small Lake
  }
  return 4;
}

// LOD state
let _currentTier = 1;

// Getter and setter for currentTier to allow external updates
export function getCurrentTier() {
  return _currentTier;
}

export function setCurrentTier(tier) {
  if (typeof tier !== 'number' || tier < 1 || tier > 4) {
    console.warn('[labels] setCurrentTier: invalid tier', tier);
    return;
  }
  _currentTier = tier;
}

// For backward compatibility, export a getter that returns the current value
export const currentTier = {
  get value() { return _currentTier; },
  set value(tier) { _currentTier = tier; }
};

// Map zoom k → max visible tier (tweak to taste)
export function tierForZoom(k) {
  if (typeof k !== 'number' || k <= 0) return 1;
  if (k < 1.4) return 1;   // far out: only the biggest names
  if (k < 2.5) return 2;   // mid: add key secondary labels
  if (k < 5.0) return 3;   // close: most labels
  return 4;                // very close: everything
}

// Apply visibility by tier
export function applyTierVisibility() {
  try {
    d3.selectAll("text.label")
      .classed("hidden", d => (d?.tier ?? 4) > _currentTier);
  } catch (e) {
    console.warn('[labels] applyTierVisibility: error', e);
  }
}

  // Call once after (re)building labels
  export function initLabelLOD() {
    try {
      applyTierVisibility();
    } catch (e) {
      console.warn('[labels] initLabelLOD: error', e);
    }
  }

  // ---------- Font cap helpers (ocean must be largest) ----------

  // Read the actual computed pixel font-size of the ocean label
  function getOceanFontPx(fallback = 22) {
    try {
      const node = d3.select("text.label--ocean").node();
      if (!node) return fallback;
      const fs = getComputedStyle(node).fontSize || "";
      const n = parseFloat(fs);
      return Number.isFinite(n) ? n : fallback;
    } catch (e) {
      console.warn('[labels] getOceanFontPx error:', e);
      return fallback;
    }
  }

  // Compute per-tier ceilings strictly below the ocean size
  function computeTierCaps(oceanPx) {
    if (typeof oceanPx !== 'number' || oceanPx <= 0) {
      console.warn('[labels] computeTierCaps: invalid oceanPx', oceanPx);
      oceanPx = 22; // fallback to default
    }
    // Tunable multipliers; keep all < 1.0 so ocean is always largest
    return {
      1: Math.floor(oceanPx * 0.86), // top non-ocean (e.g., biggest island)
      2: Math.floor(oceanPx * 0.74),
      3: Math.floor(oceanPx * 0.64),
      4: Math.floor(oceanPx * 0.56),
    };
  }

  // Clamp a size by its tier (with a reasonable minimum for legibility)
  const MIN_LABEL_PX = 11;
  function clampByTierPx(px, tier, caps) {
    if (typeof px !== 'number' || px <= 0) {
      console.warn('[labels] clampByTierPx: invalid px', px);
      px = MIN_LABEL_PX;
    }
    if (typeof tier !== 'number' || tier < 1 || tier > 4) {
      console.warn('[labels] clampByTierPx: invalid tier', tier);
      tier = 4;
    }
    if (!caps || typeof caps !== 'object') {
      console.warn('[labels] clampByTierPx: invalid caps', caps);
      return px;
    }
    const cap = caps[tier] ?? caps[4];
    return Math.max(MIN_LABEL_PX, Math.min(px, cap));
  }

  // Apply caps to all non-ocean labels AFTER they exist in the DOM.
  // This preserves whatever base size you computed (area/importance/etc.),
  // but hard-limits it below the ocean size.
  export function applyFontCaps() {
    try {
      const oceanPx = getOceanFontPx();
      const caps = computeTierCaps(oceanPx);

      d3.selectAll("text.label:not(.label--ocean)")
        .each(function(d) {
          try {
            const sel = d3.select(this);

            // try inline style first, then computed style
            const inline = parseFloat(sel.style("font-size"));
            const computed = parseFloat(getComputedStyle(this).fontSize);
            const basePx = Number.isFinite(inline) ? inline :
                           (Number.isFinite(computed) ? computed : MIN_LABEL_PX);

            const tier = d?.tier ?? 4;
            const finalPx = clampByTierPx(basePx, tier, caps);

            // write inline so it wins over CSS class rules
            sel.style("font-size", finalPx + "px");
          } catch (e) {
            console.warn('[labels] applyFontCaps: error processing label', e);
          }
        });

      console.log("[labels] font caps applied", {
        oceanPx,
        caps,
        sample: d3.selectAll("text.label").size()
      });
    } catch (e) {
      console.warn('[labels] applyFontCaps: error', e);
    }
  }

const worldRectToScreenRect = ({x,y,w,h}) => {
  if (typeof x !== 'number' || typeof y !== 'number' || typeof w !== 'number' || typeof h !== 'number') {
    console.warn('[labels] worldRectToScreenRect: invalid parameters', {x, y, w, h});
    return {x: 0, y: 0, w: 0, h: 0};
  }
  const svgNode = d3.select('svg').node();
  if (!svgNode) return {x: 0, y: 0, w: 0, h: 0};
  const t = d3.zoomTransform(svgNode); 
  return { x:x*t.k + t.x, y:y*t.k + t.y, w:w*t.k, h:h*t.k };
};

// Disjoint key functions for world vs ocean labels
const keyWorld = d => {
  if (!d) return 'w:unknown:unknown';
  return `w:${d.kind || 'unknown'}:${d.id || 'unknown'}`;
};
const keyOcean = d => {
  if (!d) return 'ocean:0';
  return `ocean:${d.id || 0}`;
};

// --- LOD helpers (tier-aware) ---
function lerp(a,b,t){ 
  if (typeof a !== 'number' || typeof b !== 'number' || typeof t !== 'number') {
    console.warn('[labels] lerp: invalid parameters', {a, b, t});
    return a;
  }
  return a + (b-a)*t; 
}
function clamp01(x){ 
  if (typeof x !== 'number') {
    console.warn('[labels] clamp01: invalid parameter', x);
    return 0;
  }
  return Math.max(0, Math.min(1, x)); 
}

// ---- RAF throttle ----
function rafThrottle(fn) {
  if (typeof fn !== 'function') {
    console.warn('[labels] rafThrottle: invalid function', fn);
    return () => {};
  }
  let scheduled = false, lastArgs;
  return function throttled(...args) {
    lastArgs = args;
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        fn(...lastArgs);
      });
    }
  };
}

// Keep an exported reference if you modularize; otherwise plain globals are fine
let _updateCullRaf = null;

// Export for use in interaction.js
export { _updateCullRaf };

/**
 * Recompute which labels are inside the viewport and toggle .culled.
 * Because labels are inverse-scaled in a single labelsLayer, getBoundingClientRect()
 * returns correct screen-space boxes for text.
 */
export function updateViewportCull(svgNode, pad = 24) {
  if (!svgNode || typeof svgNode.getBoundingClientRect !== 'function') {
    console.warn('[labels] updateViewportCull: invalid svgNode', svgNode);
    return;
  }
  if (typeof pad !== 'number' || pad < 0) {
    console.warn('[labels] updateViewportCull: invalid pad', pad);
    pad = 24;
  }
  
  try {
    const svgRect = svgNode.getBoundingClientRect();
    const left = svgRect.left - pad, right = svgRect.right + pad;
    const top  = svgRect.top  - pad, bottom = svgRect.bottom + pad;

    d3.selectAll("text.label").each(function () {
      try {
        const r = this.getBoundingClientRect();
        const off = (r.right < left) || (r.left > right) || (r.bottom < top) || (r.top > bottom);
        d3.select(this).classed("culled", off);
      } catch (e) {
        console.warn('[labels] updateViewportCull: error processing label', e);
      }
    });

    // Ocean label is sticky: if Tier 1 is allowed, never leave it culled/hidden.
    ensureOceanStickyVisibility();
  } catch (e) {
    console.warn('[labels] updateViewportCull: error', e);
  }
}

/** Force the ocean label back to visible when Tier 1 is active */
export function ensureOceanStickyVisibility() {
  try {
    const ocean = d3.select("text.label--ocean");
    if (ocean.empty()) return;

    // Ocean is Tier 1; whenever currentTier >= 1 it must be visible.
    if (_currentTier >= 1) {
      ocean.classed("culled", false)
           .classed("hidden", false)
           .style("display", null)
           .attr("visibility", null)
           .attr("opacity", null);
    }
  } catch (e) {
    console.warn('[labels] ensureOceanStickyVisibility: error', e);
  }
}

// Initialize throttled updater once (call from init time)
export function initLabelCulling(svgSelection) {
  if (!svgSelection || !svgSelection.node) {
    console.warn('[labels] initLabelCulling: invalid svgSelection', svgSelection);
    return;
  }
  const svgNode = svgSelection.node();
  if (!svgNode) {
    console.warn('[labels] initLabelCulling: no node in svgSelection');
    return;
  }
  _updateCullRaf = rafThrottle(() => updateViewportCull(svgNode));
}
// Smoothstep from edge0..edge1
function smoothRange01(x0, x1, k){ 
  if (typeof x0 !== 'number' || typeof x1 !== 'number' || typeof k !== 'number') {
    console.warn('[labels] smoothRange01: invalid parameters', {x0, x1, k});
    return 0;
  }
  return clamp01((k - x0) / Math.max(1e-6, (x1 - x0))); 
}

// Keep a smoothed k to reduce flicker near thresholds
let __LOD_prevK = 1.0;
export function getSmoothedK(k){
  if (typeof k !== 'number' || k <= 0) {
    console.warn('[labels] getSmoothedK: invalid k', k);
    return __LOD_prevK;
  }
  const α = 0.25;               // smoothing factor; 0=no smoothing, 1=instant
  __LOD_prevK = (1-α)*__LOD_prevK + α*k;
  return __LOD_prevK;
}

// LOD visibility policy by tier (2..4); tier 1 (ocean) is always visible
// Zoom breakpoints (D3 k): start to reveal, then ramp to full density
const LOD_BREAKS = {
  t2: { start: 1.12, full: 1.35 },  // Major Islands (unchanged)
  t3: { start: 1.45, full: 1.85 },  // Minor Islands & Large Lakes (later)
  t4: { start: 1.90, full: 2.40 }   // Tiny Islands & Small Lakes (even later)
};

// Per-tier separation in *screen* pixels (counter-scaled to world later)
function separationPxForTier(tier){
  if (typeof tier !== 'number' || tier < 1 || tier > 4) {
    console.warn('[labels] separationPxForTier: invalid tier', tier);
    return 22; // default to smallest separation
  }
  return tier === 2 ? 38 : tier === 3 ? 28 : 22;
}

// Minimum feature screen area (px^2) by tier as a function of k
function minAreaPxForTier(tier, k){
  if (typeof tier !== 'number' || tier < 1 || tier > 4) {
    console.warn('[labels] minAreaPxForTier: invalid tier', tier);
    return 28; // default to smallest area
  }
  if (typeof k !== 'number' || k <= 0) {
    console.warn('[labels] minAreaPxForTier: invalid k', k);
    return 28; // default to smallest area
  }
  const s2 = smoothRange01(LOD_BREAKS.t2.start, LOD_BREAKS.t2.full, k);
  const s3 = smoothRange01(LOD_BREAKS.t3.start, LOD_BREAKS.t3.full, k);
  const s4 = smoothRange01(LOD_BREAKS.t4.start, LOD_BREAKS.t4.full, k);
  if (tier === 2) return Math.round(lerp(420,  80, s2));
  if (tier === 3) return Math.round(lerp(360,  60, s3));
  return                Math.round(lerp(280,  28, s4)); // tier 4
}

// Budget (how many labels per tier) given k and candidate count n
function tierBudget(tier, k, n){
  const b = tier === 2 ? LOD_BREAKS.t2 : tier === 3 ? LOD_BREAKS.t3 : LOD_BREAKS.t4;
  const s = smoothRange01(b.start, b.full, k);
  const base   = tier === 2 ? 2 : 0;
  const growth = tier === 2 ? 6 : tier === 3 ? 10 : 14;
  return Math.min(n, Math.round(base + growth * s));
}

// Overlay-only updater for ocean labels (no world label interference)
export function updateOverlayOceanLabel(k) {
  // Recompute font size/position for ocean text if you need to respond to zoom k.
  // Must scope only to #labels-overlay.
  const overlay = d3.select('#labels-overlay');
  if (!overlay.empty()) {
    // Ocean labels are in screen space, so they don't need zoom scaling
    // But we can update font sizes if needed for readability
    overlay.selectAll('text.ocean-text')
      .style('font-size', d => {
        // Keep ocean labels at a consistent screen size regardless of zoom
        return (d.baseFontPx || 28) + 'px';
      });
  }
}

export function ensureLabelLayers(svg) {
  let root = svg.select('#labels-root');
  if (root.empty()) root = svg.append('g').attr('id', 'labels-root');
  let world = root.select('#labels-world');
  if (world.empty()) world = root.append('g').attr('id', 'labels-world');
  let overlay = root.select('#labels-overlay');
  if (overlay.empty()) {
    overlay = root.append('g').attr('id', 'labels-overlay');
    overlay.style('pointer-events','none');
  }
}

// NEW: ensure label containers are in the right coordinate space
export function ensureLabelContainers(svg) {
  if (!svg || !svg.select) {
    console.warn('[labels] ensureLabelContainers: invalid svg', svg);
    return;
  }
  
  const world = svg.select('#world');
  if (world.empty()) { console.warn('[labels] #world missing'); return; }

  let labelsRoot = svg.select('#labels');
  if (labelsRoot.empty()) labelsRoot = svg.append('g').attr('id', 'labels');

  let labelsWorld = svg.select('#labels-world');
  if (labelsWorld.empty()) labelsWorld = world.append('g').attr('id', 'labels-world');
  else if (labelsWorld.node().parentNode !== world.node()) world.node().appendChild(labelsWorld.node());

  let labelsOverlay = svg.select('#labels-overlay');
  if (labelsOverlay.empty()) labelsOverlay = svg.append('g').attr('id', 'labels-overlay');

  // make sure sub-containers exist (idempotent)
  if (labelsWorld.select('#labels-world-areas').empty()) {
    labelsWorld.append('g').attr('id', 'labels-world-areas');
  }
  if (labelsWorld.select('#labels-world-ocean').empty()) {
    labelsWorld.append('g').attr('id', 'labels-world-ocean');
  }

  // Critical: keep world labels on top of all world geometry
  labelsWorld.raise();

  // Make it obvious if a global style accidentally hid us
  labelsWorld.attr('display', null).style('opacity', 1).style('pointer-events', 'none');

  // Debug: show children order under #world
  try {
    const order = Array.from(world.node().children).map(n => n.id || n.className?.baseVal || n.nodeName);
    console.log('[labels] #world child order (top last):', order);
  } catch (e) {
    console.warn('[labels] ensureLabelContainers: error getting children order', e);
  }
  
  return labelsWorld;
}

/**
 * Draw a visible, fixed debug label to test basic rendering and layering
 * @param {Object} svg - D3 selection of the SVG element
 */
export function smokeLabel(svg) {
  if (!svg || !svg.node) {
    console.warn('[labels] smokeLabel: invalid svg', svg);
    return;
  }
  
  try {
    const k = d3.zoomTransform(svg.node()).k || 1;
    const g = svg.select('#labels-world').append('g')
      .attr('class', 'label dbg')
      .attr('transform', `translate(100,100) scale(${1/Math.max(k,1e-6)})`);

    g.append('circle').attr('r', 6).attr('cx', 0).attr('cy', 0).attr('fill', 'magenta');
    g.append('text').text('DBG').attr('x', 0).attr('y', -10).style('font-size', '22px')
      .style('font-family', 'IM FELL English, serif').style('fill', '#000');
    console.log('[labels] smokeLabel appended');
  } catch (e) {
    console.warn('[labels] smokeLabel: error', e);
  }
}

/**
 * Force all world labels to full opacity, bypassing LOD logic
 * @param {Object} svg - D3 selection of the SVG element
 */
export function forceAllLabelsVisible(svg) {
  if (!svg || !svg.select) {
    console.warn('[labels] forceAllLabelsVisible: invalid svg', svg);
    return;
  }
  
  try {
    const s = svg.select('#labels-world');
    s.selectAll('g.label, g.ocean-label, g.label--ocean')
      .style('opacity', 1)
      .attr('display', null);
    console.log('[labels] forceAllLabelsVisible count:',
      s.selectAll('g.label, g.ocean-label, g.label--ocean').size());
  } catch (e) {
    console.warn('[labels] forceAllLabelsVisible: error', e);
  }
}







// ensureScreenLabelLayer(svg)
export function ensureScreenLabelLayer(svg) {
  if (!svg || !svg.select) {
    console.warn('[labels] ensureScreenLabelLayer: invalid svg', svg);
    return d3.select(null);
  }
  
  let root = svg.select('#screen-labels');
  if (root.empty()) {
    root = svg.append('g')
      .attr('id','screen-labels')
      .attr('pointer-events','none'); // never intercept wheel/pan
  }
  return root;
}

function assertOceanWithinRect(textSel, rectPx, pad=2) {
  const n = textSel.node();
  if (!n) return;
  if (!rectPx || typeof rectPx.x !== 'number' || typeof rectPx.y !== 'number' || typeof rectPx.w !== 'number' || typeof rectPx.h !== 'number') {
    console.warn('[assert] assertOceanWithinRect: invalid rectPx', rectPx);
    return false;
  }
  const b = n.getBBox(); // in px because the element lives in the screen layer
  const ok =
    b.x >= rectPx.x + pad &&
    b.y >= rectPx.y + pad &&
    (b.x + b.width)  <= (rectPx.x + rectPx.w - pad) &&
    (b.y + b.height) <= (rectPx.y + rectPx.h - pad);

  DBG.assert && console.log('[assert] ocean in rect?', ok, {bboxPx: b, rectPx});
  return ok;
}

function screenToWorldXY(pxX, pxY) {
  if (typeof pxX !== 'number' || typeof pxY !== 'number') {
    console.warn('[labels] screenToWorldXY: invalid coordinates', {pxX, pxY});
    return {x: 0, y: 0};
  }
  const {k, x, y} = getZoomState();
  return {x: (pxX - x) / k, y: (pxY - y) / k};
}

function screenRectToWorldRect(rpx) {
  // rpx: {x, y, w, h} in screen pixels (top-left)
  if (!rpx || typeof rpx.x !== 'number' || typeof rpx.y !== 'number' || typeof rpx.w !== 'number' || typeof rpx.h !== 'number') {
    console.warn('[labels] screenRectToWorldRect: invalid rpx', rpx);
    return {x: 0, y: 0, w: 0, h: 0};
  }
  const tl = screenToWorldXY(rpx.x, rpx.y);
  const br = screenToWorldXY(rpx.x + rpx.w, rpx.y + rpx.h);
  return {x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y};
}

function pxToWorldFont(px) {
  if (typeof px !== 'number' || px <= 0) {
    console.warn('[labels] pxToWorldFont: invalid px', px);
    return 12;
  }
  const {k} = getZoomState();        // critical: divide by k
  return px / Math.max(k, 1e-6);
}

// Accept either a DOM node or a D3 selection and return a D3 selection
function asSel(svgOrSel) {
  if (!svgOrSel) return d3.select(null);
  return typeof svgOrSel.node === "function"
    ? svgOrSel
    : d3.select(svgOrSel);
}

// Safety toggles for easy rollback
export const USE_SA_LABELER = false;       // master switch - disabled to remove d3-labeler dependency
// Ocean labels now always participate in SA collision avoidance
export const DEBUG_LABEL_BOXES = false;   // show rects behind text

// --- DEBUG CONFIG ---
export const LABEL_DEBUG = false;  // flip to true to enable debug drawing/logs
let __labelProbeId = null; // chosen once per run
let __lastProbe = null; // cache for last probe state

const DBG = {labels:true, ocean:true, cost:true, assert:true};
function timeit(tag, fn) {
  if (!DBG.cost || !fn) return fn ? fn() : undefined;
  const t0 = performance.now();
  const out = fn();
  const t1 = performance.now();
  console.log(`[cost] ${tag}: ${(t1-t0).toFixed(1)} ms`);
  return out;
}



// --- pixel text measurement (cached canvas) ---
const __measureCtx = (() => {
  const c = document.createElement('canvas');
  return c.getContext('2d');
})();

export function labelFontFamily() {
  // keep in sync with CSS var/family used elsewhere
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--label-font-family');
    return (v && v.trim()) || 'Lora, serif';
  } catch (e) {
    return 'Lora, serif'; // fallback if getComputedStyle fails
  }
}

export function textWidthPx(str, sizePx, family = labelFontFamily()) {
  if (!str || !sizePx || sizePx <= 0) return 0;
  const ctx = __measureCtx;
  if (!ctx) return 0;
  ctx.font = `${Math.max(1, Math.round(sizePx))}px ${family}`;
  const m = ctx.measureText(str || '');
  return (m && m.width) ? m.width : 0;
}

// [ocean-wrap] only define once
if (typeof window.__wrapText__ === "undefined") {
  window.__wrapText__ = true;
  window.wrapText = function wrapText(textSel, maxWidth, lineHeightEm = 1.2) {
    if (!maxWidth || maxWidth <= 0) {
      console.warn('[labels] wrapText: invalid maxWidth', maxWidth);
      return;
    }
    textSel.each(function () {
      const text = d3.select(this);

      // Normalize anchoring and clear any inherited dx on the <text> itself
      const cx = +text.attr("x") || 0;
      const cy = +text.attr("y") || 0;
      text.attr("text-anchor", "middle").attr("dx", null);

      // Rebuild tspans
      const words = (text.text() || "").split(/\s+/).filter(Boolean);
      text.text(""); // clear
      let line = [], lineNumber = 0;

      // helper to create a new centered tspan with dx=0
      const newLine = (dyEm) =>
        text.append("tspan")
          .attr("x", cx)
          .attr("y", cy)
          .attr("dx", 0)
          .attr("dy", dyEm);

      let tspan = newLine("0em");

      for (const w of words) {
        line.push(w);
        tspan.text(line.join(" "));
        
        // Use getComputedTextLength if available, otherwise estimate
        let textWidth = 0;
        try {
          textWidth = tspan.node().getComputedTextLength();
        } catch (e) {
          // Fallback: estimate width based on character count and font size
          const fontSize = parseFloat(text.style('font-size')) || 22;
          const avgCharWidth = fontSize * 0.6; // rough estimate
          textWidth = tspan.text().length * avgCharWidth;
        }
        
        if (textWidth > maxWidth) {
          line.pop();
          tspan.text(line.join(" "));
          line = [w];
          tspan = newLine(`${++lineNumber * lineHeightEm}em`).text(w);
        }
      }

      // vertical center the block around (cx, cy)
      try {
        const bbox = this.getBBox();
        const midY = cy;
        const shift = midY - (bbox.y + bbox.height / 2);

        // FINAL GUARD: re-center every line & kill dx again after y-shift
        text.selectAll("tspan")
          .attr("y", function () { return +d3.select(this).attr("y") + shift; })
          .attr("x", cx)
          .attr("dx", 0);
      } catch (e) {
        // If getBBox fails, just center the first tspan
        const firstTspan = text.select("tspan");
        if (!firstTspan.empty()) {
          firstTspan.attr("x", cx).attr("dx", 0).attr("y", cy);
        }
      }
    });
  }
}

export function getZoomK() {
  const world = d3.select('#world').node() || d3.select('svg').node();
  if (!world) return 1;
  return d3.zoomTransform(world).k || 1;
}

// --- Ocean anchor storage (stable on the <svg> node) ---
function setOceanAnchor(svg, anchor) {
  const host = svg?.node();
  if (!host) return;
  host.__oceanWorldAnchor = anchor || null;
}
function getOceanAnchor(svg) {
  const host = svg?.node();
  if (!host) return null;
  return host.__oceanWorldAnchor || null;
}
function setOceanRectPx(svg, rectPx) {
  const host = svg?.node();
  if (!host) return;
  host.__oceanRectPx = rectPx || null;
}
function getOceanRectPx(svg) {
  const host = svg?.node();
  if (!host) return null;
  return host.__oceanRectPx || null;
}
export { getOceanAnchor, setOceanAnchor, getOceanRectPx, setOceanRectPx };

// Keep ocean labels away from edges by this many screen pixels
const OCEAN_EDGE_PAD_PX = 24; // tweak 20–32 to taste

// Place text element inside a rectangle with space-aware centering
export function placeTextInRect(textSel, rect, {space='px', lineH=1.1} = {}) {
  if (!rect || typeof rect.x !== 'number' || typeof rect.y !== 'number' || typeof rect.w !== 'number' || typeof rect.h !== 'number') {
    console.warn('[labels] placeTextInRect: invalid rect', rect);
    return;
  }
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;

  textSel
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle');

  if (space === 'px') {
    // element lives in screen space
    textSel.attr('x', cx).attr('y', cy);
    // recenter tspans if any
    const tspan = textSel.selectAll('tspan');
    if (!tspan.empty()) tspan.attr('x', cx).attr('dy', (d,i)=> i? (lineH+'em') : 0);
  } else {
    // world space (for later, if you move ocean into the world layer)
    textSel.attr('x', cx).attr('y', cy);
    const tspan = textSel.selectAll('tspan');
    if (!tspan.empty()) tspan.attr('x', cx).attr('dy', (d,i)=> i? (lineH+'em') : 0);
  }
}

function insetPxRect(rect, pad) {
  if (!rect || typeof rect.x0 !== 'number' || typeof rect.y0 !== 'number' || typeof rect.x1 !== 'number' || typeof rect.y1 !== 'number') {
    console.warn('[labels] insetPxRect: invalid rect', rect);
    return {x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0};
  }
  if (typeof pad !== 'number' || pad < 0) {
    console.warn('[labels] insetPxRect: invalid pad', pad);
    pad = 0;
  }
  return {
    x0: rect.x0 + pad,
    y0: rect.y0 + pad,
    x1: rect.x1 - pad,
    y1: rect.y1 - pad,
    w: (rect.x1 - rect.x0) - 2 * pad,
    h: (rect.y1 - rect.y0) - 2 * pad
  };
}

function worldPadFromPx(padPx) {
  if (typeof padPx !== 'number' || padPx < 0) {
    console.warn('[labels] worldPadFromPx: invalid padPx', padPx);
    return 0;
  }
  const k = getZoomK(); // you already have this helper
  return padPx / Math.max(1e-6, k);
}

function getK() {
  const worldNode = d3.select('#world').node() || d3.select('svg').node();
  return d3.zoomTransform(worldNode).k || 1;
}

function pickProbeLabel(selection) {
  if (!LABEL_DEBUG || __labelProbeId) return;
  // Prefer an island, fall back to any feature label
  let d = null;
  selection.each(function(dd, i, nodes) { 
    // Use normal function to get a real node-bound `this`
    const node = this;
    if (!node) return;
    const textSel = d3.select(node);
    if (textSel.empty()) return;
    // store for later debugging
    textSel.attr('data-label-id', dd?.id || `lbl-${i}`);
    
    if (!d && dd && (dd.kind === 'island' || dd.kind === 'lake')) d = dd; 
  });
  if (!d) selection.each(function(dd, i, nodes){ 
    // Use normal function to get a real node-bound `this`
    const node = this;
    if (!node) return;
    const textSel = d3.select(node);
    if (textSel.empty()) return;
    // store for later debugging
    textSel.attr('data-label-id', dd?.id || `lbl-${i}`);
    
    if (!d && dd) d = dd; 
  });
  if (d) {
    if (d.uid == null) d.uid = `lbl_${d.kind || 'unknown'}_${Math.random().toString(36).slice(2,7)}`;
    __labelProbeId = d.uid;
  }
}

function countScales(transformStr) {
  if (!transformStr || typeof transformStr !== 'string') return 0;
  const m = transformStr.match(/scale\(/g);
  return m ? m.length : 0;
}

function hasChanged(msg) {
  if (!msg) return false;
  const key = JSON.stringify([msg.k, msg.uid, msg.baseFontPx, msg.computedFontPx, msg.transform]);
  if (__lastProbe === key) return false;
  __lastProbe = key;
  return true;
}

// ==== ocean text fit helpers (screen-space) ====
function __clamp(v, a, b) { 
  if (typeof v !== 'number' || typeof a !== 'number' || typeof b !== 'number') {
    console.warn('[labels] __clamp: invalid parameters', {v, a, b});
    return a;
  }
  return Math.max(a, Math.min(b, v)); 
}
function __measureTextWidth(containerSel, cls, text, fontPx) {
  if (!containerSel || containerSel.empty() || !text || typeof fontPx !== 'number' || fontPx <= 0) {
    console.warn('[labels] __measureTextWidth: invalid parameters', {containerSel, cls, text, fontPx});
    return 0;
  }
  const ghost = containerSel.append("text")
    .attr("class", cls)
    .style("opacity", 0)
    .style("font-size", fontPx + "px")
    .text(text);
  const w = ghost.node().getComputedTextLength();
  ghost.remove();
  return w;
}

// Single or two-line fit with shrink-to-fit
export function fitTextToRect({ svg, textSel, text, rect, pad=8, maxPx=200, minPx=14, lineH=1.1, k }) {
  if (!textSel || textSel.empty()) return {ok:false, reason:'empty-selection'};
  if (!rect || typeof rect.w !== 'number' || typeof rect.h !== 'number') return {ok:false, reason:'invalid-rect'};
  const node = textSel.node();
  if (!node) return {ok:false, reason:'no-node'};
  // ensure tspans container
  if (!textSel.select('tspan').node()) {
    textSel.html(''); // reset
    textSel.append('tspan');
  }
  
  const svgSel = asSel(svg);
  const measure = svgSel.select("g.__measure");

  // rect is in WORLD units now, so our target W/H are just rect.w/h minus padding
  const targetW = Math.max(0, rect.w - 2 * pad);
  const targetH = Math.max(0, rect.h - 2 * pad);
  const words  = text.split(/\s+/);

  let fontPx = __clamp(Math.floor(targetH / (words.length >= 3 ? 2.4 : 1.4)), minPx, maxPx);
  let lines = [text];



  // measure() already returns width in WORLD units (because it's unscaled on <svg>)
  const measureText = (fontPx, s) => __measureTextWidth(measure, "label ocean", s, fontPx);

  const tryLayout = (fontPx) => {
    // 1) single line
    const w1 = measureText(fontPx, text);
    if (w1 <= targetW && fontPx <= targetH) {
      textSel.text(text)
        .style("font-size", fontPx + "px");
      lines = [text];
      return true;
    }
    // 2) balanced two-line
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const L = words.slice(0, i).join(" ");
      const R = words.slice(i).join(" ");
      const wL = measureText(fontPx, L);
      const wR = measureText(fontPx, R);
      const wMax = Math.max(wL, wR);
      if (!best || wMax < best.wMax) best = { L, R, wMax };
    }
    if (best) {
      const h2 = fontPx * lineH * 2;
      if (best.wMax <= targetW && h2 <= targetH) {
        textSel.text(null)
          .style("font-size", fontPx + "px");
        textSel.append("tspan").attr("x", 0).attr("dy", -fontPx * 0.6).text(best.L);
        textSel.append("tspan").attr("x", 0).attr("dy", fontPx * lineH).text(best.R);
        lines = [best.L, best.R];
        return true;
      }
    }
    return false;
  };

  for (let guard = 0; guard < 30; guard++) {
    if (tryLayout(fontPx)) {
      return {ok:true, fontPx: fontPx, anchorPx: {x: rect.x + rect.w/2, y: rect.y + rect.h/2}};
    }
    fontPx = Math.max(minPx, Math.floor(fontPx * 0.92));
  }
  // worst case
  textSel.text(text)
    .style("font-size", minPx + "px");
  
  return {ok:true, fontPx: minPx, anchorPx: {x: rect.x + rect.w/2, y: rect.y + rect.h/2}};
}

export function logProbe(tag, selection) {
  if (!LABEL_DEBUG || !__labelProbeId) return;
  let node = null, data = null;
  selection.each(function(d, i, nodes){
    // Use normal function to get a real node-bound `this`
    const currentNode = this;
    if (!currentNode) return;
    const textSel = d3.select(currentNode);
    if (textSel.empty()) return;
    // store for later debugging
    textSel.attr('data-label-id', d?.id || `lbl-${i}`);
    
    if (d?.uid === __labelProbeId && !node) { node = currentNode; data = d; }
  });
  if (!node) return;
  const g = d3.select(node);
  const tf = g.attr('transform') || '';
  const k = getK();

  // read one of the text children for computed font
  const textNode = g.select('text.fill').node() || g.select('text').node();
  const cs = textNode ? window.getComputedStyle(textNode) : null;
  const computedPx = cs ? parseFloat(cs.fontSize) : NaN;

  const base = data?.baseFontPx ?? data?.fontPx ?? NaN;
  const scales = countScales(tf);
  const msg = {
    tag, k,
    uid: data?.uid, kind: data?.kind, name: data?.label || data?.name,
    baseFontPx: base, computedFontPx: computedPx,
    transform: tf, scaleTokens: scales
  };

  if (!hasChanged(msg)) return;
  console.groupCollapsed(`🔎 [label-probe] ${tag}`);
  console.log(msg);
  // Warnings
  if (!Number.isNaN(base) && !Number.isNaN(computedPx) && Math.abs(computedPx - base) > 0.5) {
    console.warn(`⚠️ computed font (${computedPx}px) differs from baseline (${base}px)`);
  }
  if (scales > 1) {
    console.warn(`⚠️ multiple scale() detected in transform (${scales}) → potential double-scaling`);
  }
  console.groupEnd();
}

// (labelFontFamily function already defined above)

// Accurate text measurement using ghost element
export function measureTextWidth(svg, text, { fontSize = 28, family = labelFontFamily(), weight = 700 } = {}) {
  const svgSel = asSel(svg);
  const measure = svgSel.select("g.__measure");
  const ghost = measure.append('text')
    .attr('x', -99999).attr('y', -99999)
    .attr('font-size', fontSize).attr('font-family', family).attr('font-weight', weight)
    .text(text);
  const w = ghost.node().getComputedTextLength();
  ghost.remove();
  return Math.max(8, w);
}

// Text measurement and two-line wrapping helpers
// (measurePx replaced by textWidthPx for better performance)

// Try all single-break positions and pick the split that minimizes the max line width
function bestTwoLineSplit(words) {
  let best = { a: words.join(' '), b: '' };
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ');
    const b = words.slice(i).join(' ');
    if (!b) break;
    // choose the split that balances line lengths
    if (Math.abs(a.length - b.length) < Math.abs(best.a.length - best.b.length)) best = { a, b };
  }
  return best;
}

export function fitOceanToRectPx(label, rectPx, pad = 10) {
  const k = getZoomK();
  const fam = labelFontFamily();
  const text = (label.label || label.name || '').trim();
  const words = text.split(/\s+/).filter(Boolean);
  const maxW = Math.max(0, rectPx.w - 2 * pad);
  const maxH = Math.max(0, rectPx.h - 2 * pad);

  const MIN_OCEAN_PX = 34;           // screen pixels floor
  const MAX_OCEAN_PX = 44;           // existing cap is fine
  const lineH = f => f * 1.2;

  // Prefer label.baseFontPx first, then shrink until it fits
  const preferred = Math.min(label.baseFontPx || 40, MAX_OCEAN_PX);
  let best = null;

  // Try preferred → down to MIN_OCEAN_PX, then continue if needed
  for (let f = preferred; f >= 12; f--) {
    // try one line
    const fitsOne = textWidthPx(text, f, fam) <= maxW && lineH(f) <= maxH;
    if (fitsOne) {
      best = Math.max(f, MIN_OCEAN_PX);
      break;
    }
  }

  let lines = [text];
  let fontPx = best || 12; // fallback to 12px if nothing fits
  let wpx = textWidthPx(text, fontPx, fam);
  let hpx = lineH(fontPx);

  // if one line doesn't fit, go to two
  if (wpx > maxW || hpx > maxH) {
    const sp = bestTwoLineSplit(words);
    // try two-line with preferred size first, then step down
    for (let f = preferred; f >= 12; f--) {
      const w1 = textWidthPx(sp.a, f, fam);
      const w2 = textWidthPx(sp.b, f, fam);
      const H = lineH(f) * 2;
      if (Math.max(w1, w2) <= maxW && H <= maxH) {
        fontPx = Math.max(f, MIN_OCEAN_PX);
        lines = [sp.a, sp.b];
        wpx = Math.max(w1, w2);
        hpx = H;
        break;
      }
    }
  }

  // store pixel and world boxes + fonts
  label.lines = lines;
  label.font_px = fontPx;        // screen px (for logs)
  label.font_world_px = fontPx / k; // what we actually write to SVG
  label._box_px = { w: wpx, h: hpx };
  label._box = { w: wpx / k, h: hpx / k }; // keep SA/collision in world units
}

// Normalize label data for SA labeler - compute anchors and dimensions
export function computeLabelMetrics({ svg, labels }) {
  // Filter out ocean labels - they're handled separately in the world layer
  const nonOceanLabels = labels.filter(d => d.kind !== 'ocean');
  
  return nonOceanLabels.map(l => {
    // Ocean labels are now excluded from SA processing
    
    // Set baseline font size if not already set
    if (l.baseFontPx == null) {
      l.baseFontPx = l.fontSize || (
        l.kind === 'ocean'  ? 28 :
        l.kind === 'lake'   ? 14 :
        l.kind === 'island' ? 12 : 12
      );
    }
    
    // Use the fitted dimensions if available, otherwise measure
    const width = l.width || measureTextWidth(svg, l.multiline ? l.text.split('\n')[0] : l.text, { fontSize: l.baseFontPx, weight: 700 });
    const height = l.height || Math.max(10, Math.round(l.baseFontPx * (l.multiline ? 2.4 : 0.9)));

    return {
      ...l,
      font: l.baseFontPx,
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

// Fit ocean label text to rectangle with font scaling and optional line breaks
function fitOceanLabelToRect(oceanLabel, rect, svg) {
  if (!oceanLabel.keepWithinRect || !oceanLabel.text) return oceanLabel;
  
  // Convert world rect to pixel rect for fitting
  const z = d3.zoomTransform(svg.node());
  const rectPx = {
    w: rect.w * z.k,
    h: rect.h * z.k
  };
  
  // Use the new pixel-based fitting function
  fitOceanToRectPx(oceanLabel, rectPx, 10);
  
  // Set width/height from the computed world box
  oceanLabel.width = oceanLabel._box.w;
  oceanLabel.height = oceanLabel._box.h;
  
  // 🔒 Post-measure clamp: ensures center stays inside the keep rect
  clampToKeepRect(oceanLabel);
  
  // Debug logging after ocean fit-to-rect finalizes size
  if (LABEL_DEBUG) {
    // Try to find the ocean label group if already bound, otherwise log datum
    const g = d3.select('#labels-world').selectAll('g.label');
    logProbe('ocean-fit:final-size', g);
  }
  
  return oceanLabel;
}

// Clamp label to its keepWithinRect constraint
export function clampToKeepRect(lbl) {
  if (!lbl || !lbl.keepWithinRect) return;
  const k = getZoomK();
  const px = lbl._box_px || { w: 0, h: 0 };
  const halfW = (px.w / k) / 2;
  const halfH = (px.h / k) / 2;
  const { x, y, w, h } = lbl.keepWithinRect;
  lbl.x = Math.min(Math.max(lbl.x, x + halfW), x + w - halfW);
  lbl.y = Math.min(Math.max(lbl.y, y + halfH), y + h - halfH);
}

// Custom energy function that gives ocean labels higher mass/penalty
function customEnergy(index, lab, anc, originalLabels, bounds) {
  // Standard energy weights
  const w_len = 0.2;      // leader line length 
  const w_inter = 1.0;    // leader line intersection
  const w_lab2 = 30.0;    // label-label overlap
  const w_lab_anc = 30.0; // label-anchor overlap
  const w_orient = 3.0;   // orientation bias
  
  // Higher mass multiplier for ocean labels (makes them harder to move)
  const oceanMassMultiplier = 3.0;
  
  // Get current zoom transform for world coordinate calculations
  const worldNode = d3.select('#world').node() || d3.select('svg').node();
  const z = d3.zoomTransform(worldNode);
  const padWorld = 16 / z.k; // ~16px in world coordinates
  
  const m = lab.length;
  let ener = 0;
  const dx = lab[index].x - anc[index].x;
  const dy = anc[index].y - lab[index].y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  let overlap = true;
  let amount = 0;
  let theta = 0;

  // penalty for length of leader line
  if (dist > 0) ener += dist * w_len;

  // label orientation bias
  if (dist > 0) {
    const dxNorm = dx / dist;
    const dyNorm = dy / dist;
    if (dxNorm > 0 && dyNorm > 0) { ener += 0 * w_orient; }
    else if (dxNorm < 0 && dyNorm > 0) { ener += 1 * w_orient; }
    else if (dxNorm < 0 && dyNorm < 0) { ener += 2 * w_orient; }
    else { ener += 3 * w_orient; }
  }

  const x21 = lab[index].x;
  const y21 = lab[index].y - lab[index].height + 2.0;
  const x22 = lab[index].x + lab[index].width;
  const y22 = lab[index].y + 2.0;
  let x11, x12, y11, y12, x_overlap, y_overlap, overlap_area;

  for (let i = 0; i < m; i++) {
    if (i != index) {
      // penalty for intersection of leader lines
      overlap = intersect(anc[index].x, lab[index].x, anc[i].x, lab[i].x,
                        anc[index].y, lab[index].y, anc[i].y, lab[i].y);
      if (overlap) ener += w_inter;

      // penalty for label-label overlap
      x11 = lab[i].x;
      y11 = lab[i].y - lab[i].height + 2.0;
      x12 = lab[i].x + lab[i].width;
      y12 = lab[i].y + 2.0;
      x_overlap = Math.max(0, Math.min(x12,x22) - Math.max(x11,x21));
      y_overlap = Math.max(0, Math.min(y12,y22) - Math.max(y11,y21));
      overlap_area = x_overlap * y_overlap;
      
      // Apply higher penalty for ocean labels (they're "heavier")
      const massMultiplier = (originalLabels && originalLabels[index] && originalLabels[index].kind === 'ocean') ? oceanMassMultiplier : 1.0;
      ener += (overlap_area * w_lab2 * massMultiplier);
    }

    // penalty for label-anchor overlap
    x11 = anc[i].x - anc[i].r;
    y11 = anc[i].y - anc[i].r;
    x12 = anc[i].x + anc[i].r;
    y12 = anc[i].y + anc[i].r;
    x_overlap = Math.max(0, Math.min(x12,x22) - Math.max(x11,x21));
    y_overlap = Math.max(0, Math.min(y12,y22) - Math.max(y11,y21));
    overlap_area = x_overlap * y_overlap;
    ener += (overlap_area * w_lab_anc);
  }
  
  // Add ocean separation penalty for soft avoidance
  if (originalLabels && originalLabels[index] && originalLabels[index].kind === 'ocean') {
    // Convert current label position to world coordinates for separation calculation
    const currentLabel = {
      ...originalLabels[index],
      x: (lab[index].x + lab[index].width/2 + (bounds?.x0 || 0)) / z.k,
      y: (lab[index].y + lab[index].height/2 + (bounds?.y0 || 0)) / z.k,
      _box: { w: lab[index].width / z.k, h: lab[index].height / z.k }
    };
    
    // Get other labels in world coordinates
    const otherLabels = [];
    for (let i = 0; i < originalLabels.length; i++) {
      if (i === index) continue; // Skip the current label
      const originalLabel = originalLabels[i];
      otherLabels.push({
        ...originalLabel,
        x: (lab[i].x + lab[i].width/2 + (bounds?.x0 || 0)) / z.k,
        y: (lab[i].y + lab[i].height/2 + (bounds?.y0 || 0)) / z.k,
        _box: { w: lab[i].width / z.k, h: lab[i].height / z.k }
      });
    }
    
    ener += oceanSeparationPenalty(currentLabel, otherLabels, padWorld) * 5; // weight to taste
  }
  
  return ener;
}

// Helper function for line intersection (copied from d3-labeler)
function intersect(x1, x2, x3, x4, y1, y2, y3, y4) {
  const mua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));
  const mub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / ((y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1));
  return !(mua < 0 || mua > 1 || mub < 0 || mub > 1);
}

// Helper function to calculate rectangle-to-rectangle distance
function rectRectDistance(a, b) {
  const dx = Math.max(0, Math.max(a.x0 - b.x1, b.x0 - a.x1));
  const dy = Math.max(0, Math.max(a.y0 - b.y1, b.y0 - a.y1));
  return Math.hypot(dx, dy);
}

// Calculate separation penalty for ocean labels to avoid other labels
function oceanSeparationPenalty(lbl, others, minPadWorld) {
  if (lbl.kind !== 'ocean' || !lbl._box) return 0;
  const me = { x0: lbl.x - lbl._box.w/2, x1: lbl.x + lbl._box.w/2,
               y0: lbl.y - lbl._box.h/2, y1: lbl.y + lbl._box.h/2 };
  let p = 0;
  for (const o of others) {
    if (o === lbl || !o._box) continue;
    const ot = { x0: o.x - o._box.w/2, x1: o.x + o._box.w/2,
                 y0: o.y - o._box.h/2, y1: o.y + o._box.h/2 };
    const d = rectRectDistance(me, ot);
    if (d < minPadWorld) p += (minPadWorld - d) * (minPadWorld - d);
  }
  return p;
}

// Wrapper around D3-Labeler simulated annealing
export function annealLabels({ labels, bounds, sweeps = 400, svg }) {
  if (!labels.length) return labels;
  
  // Filter out ocean labels - they're handled separately in the world layer
  const nonOceanLabels = labels.filter(d => d.kind !== 'ocean');
  if (!nonOceanLabels.length) return labels;

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
  for (const l of nonOceanLabels) {
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
  const la = nonOceanLabels.map(l => ({
    x: l.x - x0,
    y: l.y - y0,
    width:  l.width,
    height: l.height,
    name:   l.text || ''
  }));
  const aa = nonOceanLabels.map(l => ({
    x: (l.anchor?.x ?? (l.x + l.width/2)) - x0,
    y: (l.anchor?.y ?? (l.y + l.height/2)) - y0,
    r: l.anchor?.r ?? 3
  }));

  // Use custom energy function with higher mass for ocean labels
  d3.labeler().label(la).anchor(aa).width(+W).height(+H).alt_energy((index, lab, anc) => customEnergy(index, lab, anc, labels, {x0, y0})).start(sweeps);

  // Map back out and clamp box fully inside bounds
  for (let i=0;i<nonOceanLabels.length;i++) {
    const l = nonOceanLabels[i], bx = la[i].x + x0, by = la[i].y + y0;
    l.placed = { x: bx, y: by };
    const minX = x0, maxX = x0 + W - l.width;
    const minY = y0, maxY = y0 + H - l.height;
    l.placed.x = Math.max(minX, Math.min(maxX, l.placed.x));
    l.placed.y = Math.max(minY, Math.min(maxY, l.placed.y));
    
    // Apply keepWithinRect constraints for ocean labels
    if (l.keepWithinRect) {
      // Set _box property for clamping
      l._box = { w: l.width, h: l.height };
      l._box_px = { w: l.width, h: l.height }; // Store in pixels for zoom-aware clamping
      // Set x,y to the center of the placed position for clamping
      l.x = l.placed.x + l.width / 2;
      l.y = l.placed.y + l.height / 2;
      
      // 🔒 Post-measure clamp: ensures center stays inside the keep rect
      clampToKeepRect(l);
      // Update placed position to match clamped position
      l.placed.x = l.x - l.width / 2;
      l.placed.y = l.y - l.height / 2;
    }
    
    // Ensure baseline font size is set for idempotent zoom updates
    if (l.baseFontPx == null) {
      l.baseFontPx = l.font || 28;
    }
    if (l.baseStrokePx == null) {
      l.baseStrokePx = 2;
    }
  }
  return labels;
}

// Try to pan the viewport to give more space for the label
function tryPanToFit(rect, labelPxWidth, viewport, t, nudge = 40) {
  // If rect is cramped near a landmass, pan away within current world bounds.
  const [minX, minY, maxX, maxY] = viewport;
  const rectW = rect.w;
  const rectH = rect.h;
  
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
    const newRectX0 = Math.max(rect.x + dx, newMinX);
    const newRectX1 = Math.min(rect.x + rect.w + dx, newMaxX);
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
    .attr('font-family', labelFontFamily())
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

  // If font size would be below minimum, try gentle panning (but not after autofit)
  let panned = false;
  if (fs <= minFS && textW > maxW && !window.state?.didAutofitToLand) {
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
  oceanLabel.baseFontPx = fs;
  oceanLabel.fixed = true;
  oceanLabel.keepWithinRect = { 
    x: rect.x + pad, 
    y: rect.y + pad, 
    w: rect.w - 2 * pad, 
    h: rect.h - 2 * pad 
  };
  
  console.log(`[labels] Ocean "${oceanLabel.text}" placed in rectangle: (${cx.toFixed(1)}, ${cy.toFixed(1)}) fontSize: ${fs}, rect: ${rect.w.toFixed(0)}x${rect.h.toFixed(0)}`);
  
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
  // console.log(`[ocean] Corner ${corner} water test at (${ax}, ${ay}): isWater=${isWater}`);
  
  if (!isWater) {
    // Try a few nearby points
    const nearbyPoints = [
      [ax + step, ay], [ax, ay + step], [ax + step, ay + step],
      [ax - step, ay], [ax, ay - step], [ax - step, ay - step]
    ];
    
    let foundWater = false;
    for (const [nx, ny] of nearbyPoints) {
      if (nx >= minX && nx <= maxX && ny >= minY && ny <= maxY && isWaterAt(nx, ny)) {
        // console.log(`[ocean] Corner ${corner} using nearby water at (${nx}, ${ny}) instead of (${ax}, ${ay})`);
        ax = nx;
        ay = ny;
        foundWater = true;
        break;
      }
    }
    
    if (!foundWater) {
      // console.log(`[ocean] Corner ${corner} failed: no water at (${ax}, ${ay}) or nearby`);
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
  
  // console.log('[ocean] Corner results:', corners.map((r, i) => ({
//   corner: ['tl','tr','bl','br'][i],
//   area: r.area,
//   touchesCoast: r.touchesCoast,
//   w: r.w,
//   h: r.h,
//   aspect: r.w > 0 ? (r.w / r.h).toFixed(2) : 'N/A',
//   isWater: r.area > 0 ? '✅' : '❌'
// })));
  
  const withCoast = corners.filter(r => r.area > 0 && r.touchesCoast);
  const pool = withCoast.length ? withCoast : corners.filter(r => r.area > 0);
  
  // console.log('[ocean] Pool results:', {
//   withCoast: withCoast.length,
//   totalValid: pool.length,
//   pool: pool.map(r => ({ area: r.area, corner: r.corner, touchesCoast: r.touchesCoast, aspect: (r.w / r.h).toFixed(2) })),
//   sanity: withCoast.length === 4 ? '✅ All corners touch coast' : 
//           withCoast.length > 0 ? `✅ ${withCoast.length}/4 corners touch coast` : '❌ No corners touch coast'
// });
  
  if (!pool.length) {
    // Fallback: try to find any large water rectangle in the center area
    console.log('[ocean] No corner rectangles found, trying center-based approach');
    return findCenterBasedOceanRect(opts);
  }
  
  // console.log('[ocean] Initial seed rectangles:', pool.map(r => ({
//   corner: r.corner,
//   w: r.w,
//   h: r.h,
//   aspect: (r.w / r.h).toFixed(2),
//   area: r.area
// })));
  
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

  // Assemble all labels
  const labels = [...oceans, ...lakes, ...islands];

  // ------------------------------
  // Tier assignment (rank-based)
  // ------------------------------
  function assignTiersByRank(featureLabels, opts = {}) {
    const {
      // minimum number of Tier-1 labels (besides ocean)
      t1Min = 2,
      // use sqrt of total as Tier-1 budget (feels good at many densities)
      t1UseSqrt = true,
      // Tier-2 / Tier-3 cumulative fractions
      t2Frac = 0.35,
      t3Frac = 0.70,
    } = opts;

    if (!Array.isArray(featureLabels) || !featureLabels.length) return;

    // Partition ocean vs. other features
    const oceans = featureLabels.filter(f => f.isOcean || /ocean|sea|expanse|gulf/i.test(f.kind || f.type || f.name || ""));
    const rest   = featureLabels.filter(f => !oceans.includes(f));

    // Score: area/radius/weight with a type boost so landmasses outrank tiny pools
    function typeBoost(f) {
      const k = (f.kind || f.type || "").toLowerCase();
      if (/island|isle|holm|atoll/.test(k)) return 1.00;
      if (/lake|mere|mirror|reservoir|pool/.test(k)) return 0.80;
      return 0.70;
    }
    rest.forEach(f => {
      const base = +f.score || +f.area || +f.radius || +f.weight || 1;
      f.__tierScore = base * typeBoost(f);
    });

    // Sort by score (desc)
    rest.sort((a, b) => (b.__tierScore || 0) - (a.__tierScore || 0));

    // Budgets
    const n  = rest.length;
    let t1N  = t1UseSqrt ? Math.max(t1Min, Math.round(Math.sqrt(n))) : t1Min;
    const t2N = Math.max(t1N, Math.round(n * t2Frac));
    const t3N = Math.max(t2N, Math.round(n * t3Frac));

    // Assign tiers by bucket
    rest.forEach((f, i) => {
      f.tier = (i < t1N) ? 1 : (i < t2N) ? 2 : (i < t3N) ? 3 : 4;
    });

    // Ensure the largest island is Tier-1 (safety pin)
    const largestIsland = rest
      .filter(f => /island|isle|holm|atoll/i.test((f.kind || f.type || "")))
      .sort((a, b) => (+b.area || 0) - (+a.area || 0))[0];
    if (largestIsland) largestIsland.tier = 1;

    // Oceans are always Tier-1
    oceans.forEach(f => { f.tier = 1; });

    // Final visibility sanity fallback
    featureLabels.forEach(f => { if (f.tier == null) f.tier = 4; });

    // Debug counts (now includes t1)
    const counts = { t1: 0, t2: 0, t3: 0, t4: 0 };
    featureLabels.forEach(f => counts[`t${f.tier}`]++);
    console.log("[tiers] counts (ranked):", counts);
  }

  // After you build featureLabels[] and BEFORE you append any <text> labels:
  assignTiersByRank(labels, {
    t1Min: 2,     // ensure at least two non-ocean Tier-1 labels
    t1UseSqrt: true,
    t2Frac: 0.40, // feel free to tweak
    t3Frac: 0.75
  });

  // Set font sizes based on assigned tiers
  for (const l of labels) {
    if (l.kind === 'ocean') {
      l.baseFontPx = 40; // preferred; fitter may shrink
    } else {
      l.baseFontPx = baseFontPxForTier(l.tier);
    }
  }

  // DEBUG once per run
  if (!window.__loggedTierStats) {
    window.__loggedTierStats = true;
  }

  // NOTE: Labels will be processed by placeLabelsAvoidingCollisions() which checks USE_SA_LABELER flag
  return labels;
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
  if (!d || !d.keepWithin) return;
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
  if (!d) return;
  const r = d.keepWithinRect;
  if (!r) return;
  if (d.x < r.x0) d.x = r.x0;
  if (d.x > r.x1) d.x = r.x1;
  if (d.y < r.y0) d.y = r.y0;
  if (d.y > r.y1) d.y = r.y1;
}

export function placeLabelsAvoidingCollisions({ svg, labels }) {
  // Filter out ocean labels - they're handled separately in the world layer
  const nonOceanLabels = labels.filter(d => d.kind !== 'ocean');
  
  // Check feature flag for new annealer system
  if (USE_SA_LABELER) {
    console.log('[labels] Using SA labeler for all feature labels (ocean excluded)');
    
    const metrics = computeLabelMetrics({ svg, labels: nonOceanLabels });
    const clusters = findLabelClusters(metrics);
    
    const placed = [];
    const processedIds = new Set();
    
    // Step 1: Process all feature clusters with performance guardrails
    for (const cluster of clusters) {
      const members = cluster; // include ocean labels in SA
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
      
      const annealed = timeit(`SA anneal ${members.length} labels`, () => annealLabels({ labels: members, bounds, sweeps }));
      placed.push(...annealed);
      
      // Mark as processed
      annealed.forEach(l => processedIds.add(l.id));
    }
    
    // Step 3: Merge in any labels we skipped (non-ocean labels only)
    for (const label of nonOceanLabels) {
      if (!processedIds.has(label.id)) {
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
        const fallbackAnnealed = timeit(`SA fallback anneal ${nonOceanLabels.length} labels`, () => annealLabels({ labels: nonOceanLabels, bounds, sweeps }));
        
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
  
  // Fallback to original system (ocean labels excluded)
  const placed = [];
  const ordered = [...nonOceanLabels.filter(d => d.fixed), ...nonOceanLabels.filter(d => !d.fixed)];

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
export function filterByZoom(placed, k){
  // Until zoom is "locked" post-autofit, show everything (existing behavior)
  const svg = d3.select('svg');
  if (svg.empty() || svg.attr('data-zoom-locked') !== '1') return placed;

  // Smooth k to reduce flicker near thresholds
  const ks = getSmoothedK(k);

  // Always keep the (single) ocean label
  const oceans   = placed.filter(p => p.kind === 'ocean');

  // Group non-ocean by tier (expects .tier set earlier in buildFeatureLabels)
  const t2 = placed.filter(p => p.kind !== 'ocean' && (p.tier === 2));
  const t3 = placed.filter(p => p.kind !== 'ocean' && (p.tier === 3));
  const t4 = placed.filter(p => p.kind !== 'ocean' && (p.tier === 4));

  // Sort candidates biggest-first with a tiny bias for higher tier at equal area
  const area = p => (p.area || 0);
  const bias = p => (5 - (p.tier || 4)) * 1e-6;
  const byArea = (a,b) => (area(b)+bias(b)) - (area(a)+bias(a));
  [t2,t3,t4].forEach(arr => arr.sort(byArea));

  // Tier-wise budgets and thresholds (screen px^2); spacing per tier (px)
  function acceptGreedy(candidates, tier, out){
    const minPx = minAreaPxForTier(tier, ks);
    const sepPx = separationPxForTier(tier);
    const budget = tierBudget(tier, ks, candidates.length);

    // world-space separation threshold
    const sepWorld = sepPx / ks;

    // For speed, maintain accepted list and reject too-close ones
    for (let i=0; i<candidates.length && out.length < 9999; i++){
      const p = candidates[i];

      // Pixel area gating: worldArea * k^2
      const pxArea = (p.area || 0) * ks * ks;
      if (pxArea < minPx) continue;

      // Separation gating vs already-accepted non-ocean labels
      let close = false;
      for (let j=0; j<out.length; j++){
        const q = out[j];
        if (q.kind === 'ocean') continue;
        const dx = (p.x - q.x), dy = (p.y - q.y);
        if (dx*dx + dy*dy < (sepWorld*sepWorld)) { close = true; break; }
      }
      if (close) continue;

      out.push(p);
      // Stop if this tier has met its budget
      const countThisTier = out.filter(x => x.tier === tier && x.kind !== 'ocean').length;
      if (countThisTier >= budget) break;
    }
  }

  const keep = [...oceans];
  acceptGreedy(t2, 2, keep);
  acceptGreedy(t3, 3, keep);
  acceptGreedy(t4, 4, keep);

  return keep;
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
    if (!l?.id) issues.push(`Label missing ID: ${l}`);
    if (!l?.text) issues.push(`Label missing text: ${l?.id || 'unknown'}`);
    if (!l?.placed || l.placed.x == null || l.placed.y == null) issues.push(`Label missing position: ${l?.id || 'unknown'}`);
    if (!l?.w || l.w <= 0 || !l?.h || l.h <= 0) issues.push(`Label invalid size: ${l?.id || 'unknown'} (${l?.w || 0}x${l?.h || 0})`);
    if (!l?.scale || l.scale <= 0) issues.push(`Label invalid scale: ${l?.id || 'unknown'} (${l?.scale || 0})`);
    if (!l?.area || l.area <= 0) issues.push(`Label invalid area: ${l?.id || 'unknown'} (${l?.area || 0})`);
  });
  
  if (issues.length > 0) {
    console.warn('[labels] Issues found:', issues);
  } else {
    console.log('[labels] No obvious issues detected');
  }
  
  // LOD Debug: Check current visibility state (world labels only) - commented out to reduce spam
  // const currentK = window.currentTransform ? window.currentTransform.k : 1;
  // const worldOnly = placed.filter(l => l.kind !== 'ocean');
  // const visible = filterByZoom(worldOnly, currentK);
  // console.log(`[labels] Current LOD state: k=${currentK.toFixed(2)}, visible=${visible.length}/${worldOnly.length} (world labels only)`);
  
  // Show visible vs hidden breakdown (world labels only) - commented out to reduce spam
  // const visibleByKind = { lake: [], island: [] };
  // visible.forEach(l => {
  //   const kind = l?.kind || 'other';
  //   if (visibleByKind[kind]) visibleByKind[kind].push(l);
  // });
  
  // console.log('[labels] Currently visible by kind (world labels):', {
  //   lake: visibleByKind.lake.length,
  //   island: visibleByKind.island.length
  // });
  
  // Show all labels with their data - commented out to reduce spam
  // console.table(placed.map(l => ({
  //   id: l?.id || 'unknown',
  //   kind: l?.kind || 'other',
  //   text: l?.text || '',
  //   area: l?.area || 0,
  //   x: l?.placed?.x || l?.x || 0,
  //   y: l?.placed?.y || l?.y || 0,
  //   w: l?.w || 0,
  //   h: l?.h || 0,
  //   scale: l?.scale || 0,
  //   priority: l?.priority || 0,
  //   visible: visible.some(v => v?.id === l?.id)
  // })));
  
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
    if (!d) continue; // Skip undefined labels
    
    // font by kind — match your current styles
    if (!Number.isFinite(d.font)) {
      d.font = (d?.kind === 'ocean' ? 28 : d?.kind === 'lake' ? 14 : 12);
    }
    if (!Number.isFinite(d.width) || d.width <= 0) {
      const approx = Math.max(8, (d?.text?.length || 0) * (d.font || 16) * 0.6);
      // Safety check: ensure svg is a D3 selection
      if (svg && typeof svg.append === 'function') {
        // Handle multiline text for measurement
        const textToMeasure = d.multiline && d.text.includes('\n') ? d.text.split('\n')[0] : d.text;
        const measured = measureTextWidth(svg, textToMeasure || '', { fontSize: d.font || 16, weight: 700 });
        d.width = Number.isFinite(measured) && measured > 0 ? measured : approx;
      } else {
        d.width = approx;
      }
    }
    if (!Number.isFinite(d.height) || d.height <= 0) {
      // Handle multiline height calculation
      const heightMultiplier = d.multiline ? 2.4 : 0.9;
      d.height = Math.max(10, Math.round((d.font || 16) * heightMultiplier));
    }
  }
}

// Seed ocean labels inside their chosen rectangle
function seedOceanIntoRect(oceanLabel) {
  if (!oceanLabel || !oceanLabel.keepWithinRect) return;
  const r = oceanLabel.keepWithinRect;
  if (!r || typeof r.x0 !== 'number' || typeof r.x1 !== 'number' || typeof r.y0 !== 'number' || typeof r.y1 !== 'number') {
    console.warn('[labels] seedOceanIntoRect: invalid rect', r);
    return;
  }
  if (typeof oceanLabel.width !== 'number' || typeof oceanLabel.height !== 'number') {
    console.warn('[labels] seedOceanIntoRect: invalid dimensions', {width: oceanLabel.width, height: oceanLabel.height});
    return;
  }
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
  if (!l || !l.keepWithinRect) {
    console.warn('[labels] seedOceanIntoWorldRect: invalid label or rect', l);
    return;
  }
  const r = l.keepWithinRect;        // world coords!
  if (!r || typeof r.x !== 'number' || typeof r.y !== 'number' || typeof r.w !== 'number' || typeof r.h !== 'number') {
    console.warn('[labels] seedOceanIntoWorldRect: invalid rect', r);
    return;
  }
  if (typeof l.width !== 'number' || typeof l.height !== 'number') {
    console.warn('[labels] seedOceanIntoWorldRect: invalid dimensions', {width: l.width, height: l.height});
    return;
  }
  
  const mapNode = d3.select('#map').node();
  if (!mapNode) {
    console.warn('[labels] seedOceanIntoWorldRect: #map not found');
    return;
  }
  const k = d3.zoomTransform(mapNode).k || 1;

  // your d.width/d.height are in *screen* px; convert to world units
  const wWorld = l.width  / k;
  const hWorld = l.height / k;

  const cx = r.x + Math.max(0, (r.w - wWorld)) / 2;
  const cy = r.y + Math.max(0, (r.h - hWorld)) / 2;

  // SA uses top-left box; store world-space box
  l.x = cx;
  l.y = cy;

  // anchor = rect center in world coords so energy doesn't pull to old centroid
  l.anchor = { x: r.x + r.w / 2, y: r.y + r.h / 2, r: 4 };
}

// Helper function to get label position, preferring SA output when present
function labelDrawXY(d) {
  if (!d) return { x: 0, y: 0 }; // Safety guard
  
  if (d.placed && Number.isFinite(d.placed.x) && Number.isFinite(d.placed.y)) {
    // Non-ocean labels should use world coordinates directly (no inverse scaling)
    if (d.kind !== 'ocean') {
      return { x: d.placed.x, y: d.placed.y };
    } else {
      // Ocean labels may need screen-to-world conversion
      const mapNode = d3.select('#map').node();
      if (!mapNode) {
        console.warn('[labels] labelDrawXY: #map not found');
        return { x: d.placed.x, y: d.placed.y };
      }
      const k = d3.zoomTransform(mapNode).k || 1;
      const wWorld = (d.width || 0) / k;
      const hWorld = (d.height || 0) / k;
      return { x: d.placed.x + wWorld / 2, y: d.placed.y + hWorld * 0.75 };
    }
  }
  return { x: d.x || 0, y: d.y || 0 };
}

// Render world layer: oceans + lakes + islands (single source of truth)
export function renderWorldLabels(svg, features) {
  if (!svg || !features || !Array.isArray(features)) {
    console.warn('[labels] renderWorldLabels: invalid parameters', {svg, features});
    return;
  }
  
  // Ensure label containers are in the right coordinate space
  ensureLabelContainers(svg);
  
  // DIAG: count features by kind making it to this function
  if (window.DEBUG) {
    const counts = (arr) => arr.reduce((m,d)=> (m[d.kind]=(m[d.kind]||0)+1, m), {});
    console.debug('[labels] input feature counts:', counts(features));
  }

  // Build world dataset explicitly
  const WORLD_KINDS = new Set(['lake','island']);
  const worldData = features.filter(d => d && WORLD_KINDS.has(d.kind));

  if (window.DEBUG) {
    const wc = worldData.reduce((m,d)=> (m[d.kind]=(m[d.kind]||0)+1, m), {});
    console.debug('[labels] worldData counts:', wc);
  }

  // Keyed join prevents duplicates even if render runs twice
  const worldSel = svg.select('#labels-world-areas')
    .selectAll('g.label')
    .data(worldData, labelKey);

  worldSel.exit().remove();

  const worldEnter = worldSel.enter()
    .append('g')
    .attr('class', 'label');

  const worldMerged = worldEnter.merge(worldSel);

  // Apply tier classes to every label
  applyTierClasses(worldMerged);

  // Apply positioning and text content
  const sizeFor = d => {
    if (!d) return 12; // Default size for undefined data
    const base = baseFontPxForTier(d.tier ?? 3);
    if (d.kind === 'lake')   return Math.max(Math.min(base, 18), 11);
    if (d.kind === 'island') {
      const big = (d.area ?? 0) > 15000;
      return big ? Math.min(base + 2, 24) : base;
    }
    return base;
  };
  
  // Create/update text elements inside the g.label groups
  worldMerged.each(function(d) {
    if (!d) return; // Skip undefined data
    
    const g = d3.select(this);
    let text = g.select('text');
    
    if (text.empty()) {
      text = g.append('text');
    }
    
    // Store world coordinates in anchor property for applyLabelTransforms to use
    d.anchor = { x: d.x, y: d.y };
    
    text
      .style('font-size', `${sizeFor(d)}px`)  // screen-space sizing
      .text(d.text || '')
      // Only assign x/y for features that rely on a point anchor (lakes/islands).
      .attr('x', d => {
        if (d.kind === 'lake' || d.kind === 'island') return labelAnchorWorld(d).x;
        // oceans typically set their own rect/anchor elsewhere; keep as-is
        return d.getAttribute?.('x') ?? null;
      })
      .attr('y', d => {
        if (d.kind === 'lake' || d.kind === 'island') return labelAnchorWorld(d).y;
        return d.getAttribute?.('y') ?? null;
      })
      // Optional, improves centering for area names:
      .attr('text-anchor', d => (d.kind === 'lake' || d.kind === 'island') ? 'middle' : null)
      .attr('dominant-baseline', d => (d.kind === 'lake' || d.kind === 'island') ? 'middle' : null)
      .classed('is-visible', true)
      .classed('ocean', d.kind === 'ocean')
      .classed('lake', d.kind === 'lake')
      .classed('island', d.kind === 'island')
      .classed('label', true)
      .classed('tier-1', d.tier === 1)
      .classed('tier-2', d.tier === 2)
      .classed('tier-3', d.tier === 3)
      .classed('tier-4', d.tier === 4 || !d.tier);
  });

  // DEBUG assertions
  if (window.DEBUG) {
    const seen = new Set();
    worldData.forEach(d => {
      const k = labelKey(d);
      if (seen.has(k)) console.warn('[dup world]', k);
      seen.add(k);
    });
    
    // Sanity check for non-finite coordinates
    const bad = worldData.filter(d => !isFinite(d.x) || !isFinite(d.y));
    if (bad.length) console.warn('[labels] non-finite coords in worldData:', bad.map(b=>b.name));
  }

  // Sanity log after the merge so we can verify anchors are numbers
  if (window.DEBUG) {
    const sample = worldMerged.filter(d => d.kind === 'lake' || d.kind === 'island')
      .nodes().slice(0, 5)
      .map(n => ({ txt: n.textContent.trim(), x: n.getAttribute('x'), y: n.getAttribute('y') }));
    console.debug('[labels] lake/island anchors (first 5):', sample);
  }
}

// Render overlay layer: no lakes/islands right now (HUD/debug only)
export function renderOverlayLabels(svg, features) {
  if (!svg) {
    console.warn('[labels] renderOverlayLabels: invalid svg', svg);
    return;
  }
  
  // Ensure label containers are in the right coordinate space
  ensureLabelContainers(svg);
  
  // Overlay labels are disabled for area features for now to avoid world→screen mismatch
  const overlayData = []; // or keep your HUD only, but do not bind lakes/islands here.

  const overlaySel = svg.select('#labels-overlay')
    .selectAll('text.label--overlay')
    .data(overlayData, labelKey);

  overlaySel.exit().remove();
  // no .enter() for labels here yet
}

// Ensure every label has one tier class
function applyTierClasses(sel) {
  sel.classed('tier-1', d => (d?.tier ?? 3) === 1)
     .classed('tier-2', d => (d?.tier ?? 3) === 2)
     .classed('tier-3', d => (d?.tier ?? 3) === 3)
     .classed('tier-4', d => (d?.tier ?? 3) >= 4);
  // Optional style hooks (behind your flags)
  if (window.labelFlags?.styleTokensOnly) {
    sel.classed('label--water', d => d?.kind === 'lake')
       .classed('label--area',  d => d?.kind === 'island' && (d?.area ?? 0) > 15000);
  } else {
    sel.classed('label--water', false).classed('label--area', false);
  }
}

// Legacy function for backward compatibility
export function renderNonOceanLabels(gAll, labels) {
  // Ensure label containers are in the right coordinate space
  ensureLabelContainers(gAll);
  
  // Filter out ocean labels
  const nonOceanLabels = labels.filter(d => d && d.kind !== 'ocean');
  
  if (nonOceanLabels.length === 0) {
    // Clear layer if no non-ocean labels, but preserve ocean labels
    const gAreas = d3.select('svg').select('#labels-world-areas');
    gAreas.selectAll('*').remove();
    return;
  }

  // Operate only in #labels-world-areas
  const gAreas = d3.select('svg').select('#labels-world-areas');
  
  // Keyed join for lakes/islands; never touch the ocean group
  const sel = gAreas.selectAll('g.label')
    .data(nonOceanLabels, d => d.label_id || d.id || `${d.kind}:${(d.name||'').toUpperCase()}`);

  sel.exit().remove();

  const enter = sel.enter().append('g').attr('class', 'label');
  const merged = enter.merge(sel);
  
  // Apply tier classes to every label
  applyTierClasses(merged);
  
  // IMPORTANT: never select/remove all g.label at '#labels-world' scope anymore.
  // Keep all subsequent selects scoped to gAreas only.
  // If you had generic cleanup, change:
  //   svg.select('#labels-world').selectAll('g.label').remove()
  // to:
  //   gAreas.selectAll('g.label').remove()
  
  // Initialize LOD after labels are rendered
  initLabelLOD();
  
  // Initialize viewport culling
  initLabelCulling(d3.select('svg'));
  
  // Apply font caps after labels are rendered (but ocean label may not exist yet)
  // We'll call this again after ocean label is placed
  applyFontCaps();
  
  // Ensure initial culling state is correct
  updateViewportCull(d3.select('svg').node());
}

// Put this near other render helpers
export function renderOceanInWorld(svg, text) {
  if (!svg) {
    console.warn('[labels] renderOceanInWorld: invalid svg', svg);
    return;
  }
  
  // Ensure label containers are in the right coordinate space
  ensureLabelContainers(svg);
  
  // Use dedicated ocean container
  const gOcean = svg.select('#labels-world-ocean');
  
  // Move any existing ocean groups living elsewhere into the right container
  svg.selectAll('#labels-world .label--ocean, #labels .label--ocean').filter(function(){
    return this.parentNode && this.parentNode.id !== 'labels-world-ocean';
  }).each(function(){
    gOcean.node().appendChild(this); // reparent
  });
  
  // One and only one ocean datum
  const oceanDatum = window.state?.ocean || {};
  // Ensure ocean has tier 1
  if (oceanDatum && typeof oceanDatum === 'object') {
    oceanDatum.tier = 1;
  }
  const oceanSel = gOcean
    .selectAll('g.label--ocean')
    .data([oceanDatum], d => d?.id || 'OCEAN');

  oceanSel.exit().remove();

  const ocean = oceanSel.enter()
    .append('g')
    .attr('class', 'ocean-label label label--ocean ocean tier-1')
    .merge(oceanSel);
  
  // When creating the ocean label group:
  console.log('[ocean] appended ocean label group', ocean.node());
  
  // Apply tier classes to ocean label
  applyTierClasses(ocean);
  
  // Store world coordinates in anchor property for applyLabelTransforms to use
  ocean.each(function(d) {
    if (!d) return;
    if (d.rectWorld) {
      d.anchor = { 
        x: d.rectWorld.x + d.rectWorld.w / 2, 
        y: d.rectWorld.y + d.rectWorld.h / 2 
      };
    } else {
      d.anchor = { x: 0, y: 0 };
    }
  });
  
  // Build/update the text inside
  let txt = ocean.selectAll('text').data([oceanDatum]);
  txt = txt.enter().append('text').merge(txt);
  txt
    .attr('class', 'label label--ocean tier-1' + (window.labelFlags?.styleTokensOnly ? ' label--water label--area' : ''))
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('vector-effect', 'non-scaling-stroke')
    .style('paint-order', 'stroke')
    .text(text);
  
  // Normalize ocean text size right after you update its <text> in renderOceanInWorld
  const OCEAN_PX = 22; // calm but leading
  ocean.select('text').style('font-size', `${OCEAN_PX}px`);
  
  // Apply text wrapping if we have a rectangle
  if (window.state?.ocean?.rectWorld) {
    const { rectWorld } = window.state.ocean;
    if (rectWorld && typeof rectWorld.w === 'number' && typeof rectWorld.h === 'number') {
      // Convert world rect to screen pixels for wrapping
      const z = d3.zoomTransform(svg.node());
      const rectPx = {
        w: rectWorld.w * z.k,
        h: rectWorld.h * z.k
      };
      // Wrap text to 85% of rectangle width
      window.wrapText(txt, rectPx.w * 0.85);
    }
  }
  
  // VERIFICATION CHECKS - Log parent transform and verify roundtrip coordinates
  if (window.state?.ocean?.rectWorld) {
    const r = window.state.ocean.rectWorld;
    if (r && typeof r.x === 'number' && typeof r.y === 'number' && typeof r.w === 'number' && typeof r.h === 'number') {
      // Check 1: Verify parent transform (should be the same as other labels)
      const parentTransform = d3.select(gOcean.node().parentNode).attr('transform');
      console.log('[ocean] parent <g> transform =', parentTransform);
      
      // Check 2: Verify roundtrip coordinate conversion
      const t = d3.zoomTransform(svg.node());
      const x0 = t.applyX(r.x), y0 = t.applyY(r.y);
      const x1 = t.applyX(r.x + r.w), y1 = t.applyY(r.y + r.h);
      
      console.log('[ocean] Roundtrip verification:', {
        worldRect: r,
        screenRect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
        zoomTransform: { k: t.k, x: t.x, y: t.y }
      });
      
      // Check 3: Verify the ocean label is in the dedicated container
      const oceanParent = gOcean.node().parentNode;
      const areasParent = svg.select('#labels-world-areas').node()?.parentNode;
      console.log('[ocean] Container check:', {
        oceanParent: oceanParent?.id || oceanParent?.className || 'unknown',
        areasParent: areasParent?.id || areasParent?.className || 'unknown',
        sameParent: oceanParent === areasParent
      });
    }
  }
  
  // (Dev) sanity log at the end of ocean render
  if (window.DEBUG) {
    const oceanNode = svg.select('#labels-world .label--ocean').node();
    console.log('[labels] ocean parent id:', oceanNode?.parentNode?.id);
  }
}

// Render all labels once with keyed join (hidden by default)
export function renderLabels({ svg, placed, groupId }) {
  if (!svg || !placed || !Array.isArray(placed)) {
    console.warn('[labels] renderLabels: invalid parameters', {svg, placed, groupId});
    return;
  }
  
  // Ensure label containers are in the right coordinate space
  ensureLabelContainers(svg);
  
  // Route non-ocean joins to their own container
  const g = groupId === 'labels-world' ? svg.select('#labels-world-areas') : svg.select(`#${groupId}`);
  
  if (window.DEBUG) {
    console.log('[labels] DEBUG: renderLabels called with', placed.length, 'labels, groupId:', groupId);
  }
  
  // Safety check: ensure placed is an array
  if (placed.length === 0) {
    console.warn('[labels] renderLabels: no labels to render');
    return;
  }
  
  // Keyed join on stable IDs - filter out null/undefined elements
  const validPlaced = placed.filter(Boolean);
  const sel = g.selectAll('g.label:not(.label--ocean)').data(validPlaced, keyWorld);
  
  // Remove old labels
  sel.exit().remove();
  
  // Create new labels
  const enter = sel.enter().append('g').attr('class', d => `label ${d?.kind || 'unknown'} tier-${d?.tier || 4}`);
  
  // Add stroke and fill text elements
  enter.append('text').attr('class', d => `label stroke tier-${d?.tier || 4}`)
    .attr('vector-effect', 'non-scaling-stroke')
    .style('paint-order', 'stroke');
  enter.append('text').attr('class', d => `label fill tier-${d?.tier || 4}`)
    .attr('vector-effect', 'non-scaling-stroke');
  
  // Update all labels (enter + update)
  const merged = enter.merge(sel);
  
  // Apply tier classes to every label
  applyTierClasses(merged);
  
  // Set baseline font sizes (persist on datum)
  merged.each(function(d, i, nodes) {
    // Use normal function to get a real node-bound `this`
    const node = this;
    if (!node) return;
    const textSel = d3.select(node);
    if (textSel.empty()) return;
    // store for later debugging
    textSel.attr('data-label-id', d.id || `lbl-${i}`);
    // baseline font (persist on datum). For oceans, this may come from fit-to-rect.
    if (d.baseFontPx == null) d.baseFontPx = d.fontPx || d.font || 28; // pick your default
    if (d.baseStrokePx == null) d.baseStrokePx = 2;          // default outline
  });
  
  // Tag labels with stable uid and pick a probe once
  const labels = g.selectAll('g.label:not(.label--ocean)');
  labels.each(function(d, i, nodes){
    // Use normal function to get a real node-bound `this`
    const node = this;
    if (!node) return;
    const textSel = d3.select(node);
    if (textSel.empty()) return;
    // store for later debugging
    textSel.attr('data-label-id', d.id || `lbl-${i}`);
    // stable uid for debugging & joins
    if (d.uid == null) d.uid = `lbl_${d?.kind || 'unknown'}_${Math.random().toString(36).slice(2,7)}`;
    // establish baselines once (Prompt 7 set these; keep here to be safe)
    if (d.baseFontPx == null) d.baseFontPx = d.fontPx || 28;
    if (d.baseStrokePx == null) d.baseStrokePx = 2;
  });
  // choose one probe label for this run
  pickProbeLabel(labels);
  logProbe('renderLabels:after-join', labels);
  
  // Position labels in world coordinates (transforms handled by applyLabelTransforms)
  merged.each(function(d) {
    if (!d) return; // Safety guard
    const p = labelDrawXY(d);
    // Store world coordinates in anchor property for applyLabelTransforms to use
    d.anchor = { x: p.x, y: p.y };
  });
  
  // Update stroke text
  merged.select('text.stroke')
    .each(function(d, i, nodes) {
      // Use normal function to get a real node-bound `this`
      const node = this;
      if (!node) return;
      const textElement = d3.select(node);
      if (textElement.empty()) return;
      // store for later debugging
      textElement.attr('data-label-id', d?.id || `lbl-${i}`);
      
      if (!d || !d.text) return;
      textElement
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .style('font-size', d => {
          // Non-ocean labels use baseFontPx from tiering
          // Ocean labels use their stored world font size
          return (d.font_world_px ?? (d.baseFontPx || 24)) + 'px';
        })
        .classed('is-visible', true)
        .classed('ocean', d?.kind === 'ocean')
        .classed('lake', d?.kind === 'lake')
        .classed('island', d?.kind === 'island')
        .classed('label', true)
        .classed(`tier-${d?.tier || 4}`, true);
      
      // Handle ocean labels with keepWithinRect using fitTextToRect
      if (d?.kind === 'ocean' && d.keepWithinRect) {
        // Use world coordinates directly with fitTextToRect
        const {k} = getZoomState();
        const rw = d.keepWithinRect; // world units

        // Run fitter with world coordinates
        const res = fitTextToRect({
          svg,
          textSel: textElement,
          text: d.text,
          rect: rw,
          pad: 8,
          maxPx: 200,
          minPx: 14,
          lineH: 1.1,
          k
        });

        // Apply results and place text in rect
        if (res && res.ok) {
          textElement.attr('font-size', res.fontPx);
          textElement.attr('data-fit', JSON.stringify({fontPx: res.fontPx, k}));
          // Place text in the SAT rectangle (world units)
          placeTextInRect(textElement, rw);
          // Convert back to screen for assertion check
          const rectPx = { x: rw.x * k + getZoomState().x, y: rw.y * k + getZoomState().y, w: rw.w * k, h: rw.h * k };
          assertOceanWithinRect(textElement, rectPx, 2);
        } else {
          console.warn('[ocean] fit failed; falling back to min size world units');
          textElement.attr('font-size', 14);
          // Still place text in rect even with fallback font size
          placeTextInRect(textElement, rw);
        }
      } else if (d.lines && d.lines.length === 2) {
        // Use the lines array from fitOceanToRectPx
        textElement.selectAll('tspan').remove(); // Clear existing tspans
        d.lines.forEach((line, i) => {
          textElement.append('tspan')
            .attr('x', 0)
            .attr('dy', i === 0 ? 0 : '1.2em')
            .text(line);
        });
      } else if (d.multiline && d.text.includes('\n')) {
        // Fallback for legacy multiline text
        const lines = d.text.split('\n');
        textElement.selectAll('tspan').remove(); // Clear existing tspans
        lines.forEach((line, i) => {
          textElement.append('tspan')
            .attr('x', 0)
            .attr('dy', i === 0 ? 0 : '1.2em')
            .text(line);
        });
      } else {
        textElement.text(d.text);
      }
    });
  
  // Update fill text
  merged.select('text.fill')
    .each(function(d, i, nodes) {
      // Use normal function to get a real node-bound `this`
      const node = this;
      if (!node) return;
      const textElement = d3.select(node);
      if (textElement.empty()) return;
      // store for later debugging
      textElement.attr('data-label-id', d.id || `lbl-${i}`);
      
      if (!d || !d.text) return;
      textElement
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central')
        .style('font-size', d => {
          // Non-ocean labels use baseFontPx from tiering
          // Ocean labels use their stored world font size
          return (d.font_world_px ?? (d.baseFontPx || 24)) + 'px';
        })
        .classed('is-visible', true)
        .classed('ocean', d.kind === 'ocean')
        .classed('lake', d.kind === 'lake')
        .classed('island', d.kind === 'island')
        .classed('label', true)
        .classed(`tier-${d.tier || 4}`, true)
        // Style token classes when enabled
        .classed('label--water', window.labelFlags?.styleTokensOnly && (d?.kind === 'ocean' || d?.kind === 'lake'))
        .classed('label--area', window.labelFlags?.styleTokensOnly && (
          d?.kind === 'ocean' || 
          (d?.kind === 'island' && (d?.area ?? 0) > 15000)
        ));
      
      // Handle ocean labels with keepWithinRect using fitTextToRect
      if (d?.kind === 'ocean' && d.keepWithinRect) {
        // Use world coordinates directly with fitTextToRect
        const {k} = getZoomState();
        const rw = d.keepWithinRect; // world units

        // Run fitter with world coordinates
        const res = fitTextToRect({
          svg,
          textSel: textElement,
          text: d.text,
          rect: rw,
          pad: 8,
          maxPx: 200,
          minPx: 14,
          lineH: 1.1,
          k
        });

        // Apply results and place text in rect
        if (res && res.ok) {
          textElement.attr('font-size', res.fontPx);
          textElement.attr('data-fit', JSON.stringify({fontPx: res.fontPx, k}));
          // Place text in the SAT rectangle (world units)
          placeTextInRect(textElement, rw);
          // Convert back to screen for assertion check
          const rectPx = { x: rw.x * k + getZoomState().x, y: rw.y * k + getZoomState().y, w: rw.w * k, h: rw.h * k };
          assertOceanWithinRect(textElement, rectPx, 2);
        } else {
          console.warn('[ocean] fit failed; falling back to min size world units');
          textElement.attr('font-size', 14);
          // Still place text in rect even with fallback font size
          placeTextInRect(textElement, rw);
        }
      } else if (d.lines && d.lines.length === 2) {
        // Use the lines array from fitOceanToRectPx
        textElement.selectAll('tspan').remove(); // Clear existing tspans
        d.lines.forEach((line, i) => {
          textElement.append('tspan')
            .attr('x', 0)
            .attr('dy', i === 0 ? 0 : '1.2em')
            .text(line);
        });
      } else if (d.multiline && d.text.includes('\n')) {
        // Fallback for legacy multiline text
        const lines = d.text.split('\n');
        textElement.selectAll('tspan').remove(); // Clear existing tspans
        lines.forEach((line, i) => {
          textElement.append('tspan')
            .attr('x', 0)
            .attr('dy', i === 0 ? 0 : '1.2em')
            .text(line);
        });
      } else {
        textElement.text(d.text);
      }
    });
  
  if (window.DEBUG) console.log('[labels] DEBUG: Rendered', merged.size(), 'labels');
  
  // Debug overlay: show final boxes behind text
  if (window.DEBUG && DEBUG_LABEL_BOXES) {
    const dbg = d3.select('#labels-debug').selectAll('rect').data(placed.filter(Boolean), keyWorld);
    dbg.enter().append('rect')
      .attr('fill', 'none')
      .attr('stroke', '#000')
      .attr('stroke-opacity', 0.25)
      .merge(dbg)
      .attr('x', function(d) {
        if (!d) return 0;
        return (d.placed ? d.placed.x : d.x - (d.width || 0)/2);
      })
      .attr('y', function(d) {
        if (!d) return 0;
        return (d.placed ? d.placed.y : d.y - (d.height || 0)/2);
      })
      .attr('width',  function(d) { return d && d.width ? d.width : 0; })
      .attr('height', function(d) { return d && d.height ? d.height : 0; });
    dbg.exit().remove();
  }
  
  // Count overlaps after placement
  function countOverlaps(arr){
    let n=0;
    for (let i=0;i<arr.length;i++){
      const a = arr[i];
      if (!a) continue;
      const ax = (a.placed?.x ?? a.x - (a.width || 0)/2), ay = (a.placed?.y ?? a.y - (a.height || 0)/2);
      for (let j=i+1;j<arr.length;j++){
        const b = arr[j];
        if (!b) continue;
        const bx = (b.placed?.x ?? b.x - (b.width || 0)/2), by = (b.placed?.y ?? b.y - (b.height || 0)/2);
        if (ax < bx + (b.width || 0) && ax + (a.width || 0) > bx && ay < by + (b.height || 0) && ay + (a.height || 0) > by) n++;
      }
    }
    return n;
  }
  console.log('[labels] overlaps after SA:', countOverlaps(validPlaced));
}

// On zoom: labels are now counter-scaled by the zoom handler, so no font-size changes needed
// This function is kept for compatibility but no longer performs any scaling operations
export function updateLabelZoom({ svg, groupId = 'labels-world' }) {
  const worldNode = d3.select('#world').node() || svg.node();
  const k = d3.zoomTransform(worldNode).k;
  const g = d3.select('#labels-world');

  // Ocean labels are handled separately in the world layer - skip them here
  // From here on, operate only on non-ocean labels.
  const sel = g.selectAll('.label').filter(d => d && d.kind !== 'ocean');

  // Labels are now counter-scaled by the zoom handler to maintain constant screen size
  // No font-size changes needed - the counter-scaling handles this automatically
  
  // Debug logging inside updateLabelZoom (after applying transform)
  if (LABEL_DEBUG) {
    logProbe('updateLabelZoom:after-apply', sel);
  }
}



// Real LOD: compute the visible set and toggle class
export function updateLabelVisibilityWithOptions(opts = {}) {
  const placed = Array.isArray(opts.placed) ? opts.placed : [];

  // Back-compat: compute 'visible' if not provided
  let visible = Array.isArray(opts.visible) ? opts.visible : null;

  if (!visible) {
    const svg = d3.select('svg');
    const k =
      typeof opts.k === 'number'
        ? opts.k
        : (svg.empty() ? 1 : d3.zoomTransform(svg.node()).k);

    const fbz = typeof opts.filterByZoom === 'function'
      ? opts.filterByZoom
      : (arr) => arr; // identity if no filter provided

    try {
      visible = fbz(placed, k);
      if (!Array.isArray(visible)) visible = placed;
    } catch (e) {
      console.warn('[lod] fallback to placed after filter error:', e);
      visible = placed;
    }
  }

  const visIds = new Set((visible || []).map(d => d && d.id).filter(Boolean));
  const isVisible = d => !!(d && visIds.has(d.id));

  // Overlay labels
  d3.select('#labels-overlay')
    .selectAll('text')
    .classed('is-visible', isVisible);

  // World-space (ocean etc.)
  d3.select('#labels-world')
    .selectAll('text')
    .classed('is-visible', isVisible);
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
function buildWaterMaskSAT(bounds, step = 8, pointIsOcean, existingLabels = []) {
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
  
  // Paint existing label areas as land (hard avoidance)
  const labelPadPx = 16; // ~16px padding around labels
  for (const label of existingLabels) {
    if (!label._box || label.kind === 'ocean') continue; // Skip ocean labels and labels without boxes
    
    // Convert label bounds to screen coordinates
    const worldNode = d3.select('#world').node() || d3.select('svg').node();
    const z = d3.zoomTransform(worldNode);
    const labelX0 = label.x - label._box.w/2;
    const labelY0 = label.y - label._box.h/2;
    const labelX1 = label.x + label._box.w/2;
    const labelY1 = label.y + label._box.h/2;
    
    // Convert to screen coordinates
    const screenX0 = labelX0 * z.k + z.x - labelPadPx;
    const screenY0 = labelY0 * z.k + z.y - labelPadPx;
    const screenX1 = labelX1 * z.k + z.x + labelPadPx;
    const screenY1 = labelY1 * z.k + z.y + labelPadPx;
    
    // Find grid cells that overlap with the label area
    const gridX0 = Math.max(0, Math.floor((screenX0 - minX) / step));
    const gridY0 = Math.max(0, Math.floor((screenY0 - minY) / step));
    const gridX1 = Math.min(cols - 1, Math.floor((screenX1 - minX) / step));
    const gridY1 = Math.min(rows - 1, Math.floor((screenY1 - minY) / step));
    
    // Paint the label area as land (mask = 0)
    for (let r = gridY0; r <= gridY1; r++) {
      for (let c = gridX0; c <= gridX1; c++) {
        if (r >= 0 && r < rows && c >= 0 && c < cols) {
          mask[r][c] = 0; // Mark as land
        }
      }
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
  
  // console.log(`[ocean] Searching for rectangles in ${cols}x${rows} grid`);
  
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
  
  // console.log(`[ocean] Found ${out.length} raw rectangles before deduplication`);

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

// SAT cache to avoid rebuilding when land/water geometry hasn't changed
const satCache = new Map();

// Expose cache management for debugging
window.clearSATCache = () => {
  const size = satCache.size;
  satCache.clear();
  console.log(`[ocean] SAT cache cleared (${size} entries removed)`);
};

window.getSATCacheSize = () => {
  console.log(`[ocean] SAT cache size: ${satCache.size}`);
  return satCache.size;
};

function getOrBuildSAT(key, buildFn) {
  if (satCache.has(key)) {
    console.log('[ocean] SAT cache HIT:', key);
    return satCache.get(key);
  }
  console.log('[ocean] SAT cache MISS, building:', key);
  const sat = buildFn();
  satCache.set(key, sat);
  
  // Prevent cache from growing too large (keep last 10 entries)
  if (satCache.size > 10) {
    const firstKey = satCache.keys().next().value;
    satCache.delete(firstKey);
    console.log('[ocean] SAT cache cleanup: removed oldest entry');
  }
  
  return sat;
}

// Exported entry point: call this AFTER autofit
// Performance optimization: Uses raster scale factor to reduce SAT computation cost
// SAT speed is ~O(n), so even 0.6× can nearly halve the cost with minimal quality loss
export function findOceanLabelRectAfterAutofit(
  visibleBounds,
  getCellAtXY,
  seaLevel = 0.2,
  step = 8,
  pad = 1,
  minAspect = 2.0,
  rasterScale = 0.6
) {
  console.log(`[ocean] Using post-autofit bounds: [${visibleBounds.join(', ')}]`);

  // Raster scale factor for performance (often imperceptible for ocean text)
  // SAT speed is ~O(n), so even 0.6× can nearly halve the cost
  const RASTER_SCALE = rasterScale;
  const scaledStep = step / RASTER_SCALE;
  
  console.log(`[ocean] Raster scale: ${RASTER_SCALE}x (step: ${step} → ${scaledStep.toFixed(1)})`);

  const worldNode = d3.select('#world').node() || d3.select('svg').node();
  const z = d3.zoomTransform(worldNode);
  const pxToWorld = (px, py) => ({ x: (px - z.x)/z.k, y: (py - z.y)/z.k });

  // screen-space viewport
  const svg = d3.select('svg');
  const svgWidth = +svg.attr('width');
  const svgHeight = +svg.attr('height');
  const viewportPx = { x0: 0, y0: 0, x1: svgWidth, y1: svgHeight };
  
  // search only inside an inset box
  const searchPx = insetPxRect(viewportPx, OCEAN_EDGE_PAD_PX);
  console.log('[ocean] search rect (px):', searchPx);

  function pixelPointIsOcean(px, py) {
    const radius = 3; // ≈ 7x7 window
    for (let dy=-radius; dy<=radius; dy++) {
      for (let dx=-radius; dx<=radius; dx++) {
        const {x, y} = pxToWorld(px+dx, py+dy);
        const c = getCellAtXY?.(x, y);
        if (c && (c.height ?? 1) > seaLevel) return false;
      }
    }
    return true;
  }

  // Wrapper for scaled SAT coordinates
  function scaledPixelPointIsOcean(scaledPx, scaledPy) {
    // Map scaled coordinates back to original coordinate space
    const px = scaledPx / RASTER_SCALE;
    const py = scaledPy / RASTER_SCALE;
    return pixelPointIsOcean(px, py);
  }

  // Get existing visible labels for hard avoidance
  const existingLabels = window.__labelsPlaced?.features || [];
  
  // Use inset search bounds instead of full viewport
  const insetBounds = [searchPx.x0, searchPx.y0, searchPx.x1, searchPx.y1];
  
  // Scale down bounds for rasterization (performance optimization)
  const scaledBounds = [
    insetBounds[0] * RASTER_SCALE,
    insetBounds[1] * RASTER_SCALE,
    insetBounds[2] * RASTER_SCALE,
    insetBounds[3] * RASTER_SCALE
  ];
  
  // Create cache key based on seed + viewport size + water comps count
  const cacheKey = {
    seed: window.state?.seed || 'unknown',
    viewportSize: `${Math.round(insetBounds[2] - insetBounds[0])}x${Math.round(insetBounds[3] - insetBounds[1])}`,
    waterCompsCount: existingLabels.filter(l => l.kind === 'ocean').length,
    step: scaledStep,
    seaLevel: seaLevel
  };
  const cacheKeyStr = JSON.stringify(cacheKey);
  
  const satEnv = timeit('SAT build water mask', () => 
    getOrBuildSAT(cacheKeyStr, () => buildWaterMaskSAT(scaledBounds, scaledStep, scaledPixelPointIsOcean, existingLabels))
  );

  // NEW: collect top-K horizontal rects, then re-rank by a label-friendly score
  const candidates = timeit('SAT search rects', () => largestHorizontalWaterRects(satEnv, 12));
  if (!candidates.length) {
    console.warn('[ocean] No horizontal water rect candidates; will fallback.');
    return null;
  }

  let bestPx = null; let bestScore = -Infinity;
  for (const r of candidates) {
    let rect = shrinkUntilAllWater(r, satEnv.landCount, pad, minAspect);
    if (rect.width < 1 || rect.height < 1) continue;
    // Map scaled grid results back to original coordinate space
    let px = gridRectToPixels(rect, satEnv.origin, satEnv.step);
    px = {
      x: px.x / RASTER_SCALE,
      y: px.y / RASTER_SCALE,
      w: px.w / RASTER_SCALE,
      h: px.h / RASTER_SCALE
    };
    if (px.w < px.h * minAspect) px = enforceMinAspect(px, minAspect);
    
    // Clamp to inset search bounds
    const X_MIN = searchPx.x0, Y_MIN = searchPx.y0;
    const X_MAX = searchPx.x1, Y_MAX = searchPx.y1;
    
    // Ensure rectangle stays within inset bounds
    if (px.x < X_MIN || px.y < Y_MIN || px.x + px.w > X_MAX || px.y + px.h > Y_MAX) {
      continue; // Skip rectangles that extend beyond inset bounds
    }
    
    const score = scoreOceanRect(px, insetBounds);
    
    // Optional bias: add tiny penalty for hugging edges
    const edgeDist = Math.min(
      (px.x - X_MIN), (px.y - Y_MIN), (X_MAX - (px.x + px.w)), (Y_MAX - (px.y + px.h))
    );
    // prefer centers; 0.001 is enough to break ties without dominating ocean-area score
    const edgePenalty = Math.max(0, (OCEAN_EDGE_PAD_PX - edgeDist)) * 0.001;
    const finalScore = score - edgePenalty;
    
    if (finalScore > bestScore) { bestScore = finalScore; bestPx = px; }
  }

  if (!bestPx) {
    console.warn('[ocean] All candidate rects invalid after shrink; will fallback.');
    return null;
  }

  console.log(`[ocean] Final pixels (ranked): ${bestPx.w}x${bestPx.h} at (${bestPx.x},${bestPx.y})`);
  
  // world-space clamp rect derived from the full viewport, but inset by EDGE_PAD
  const worldViewport = { x0: 0, y0: 0, x1: svgWidth / z.k, y1: svgHeight / z.k };
  const padWorld = worldPadFromPx(OCEAN_EDGE_PAD_PX);
  const worldRect = {
    x0: worldViewport.x0 + padWorld,
    y0: worldViewport.y0 + padWorld,
    x1: worldViewport.x1 - padWorld,
    y1: worldViewport.y1 - padWorld
  };
  
  // Convert pixel rect to world coordinates using current zoom transform
  const t = d3.zoomTransform(svg.node());
  const rWorld = pxToWorldRect(bestPx, t);
  bestPx._debugRectScreen = bestPx; // for dashed red box
  bestPx.keepWithinRect = {...rWorld, units: 'world'}; // use this for placement
  
  DBG.ocean && console.log('[ocean] Stored world rect:', rWorld);
  
  // Store the world anchor for re-projection
  const anchor = { x: rWorld.x + rWorld.w * 0.5, y: rWorld.y + rWorld.h * 0.5 };
  const rectPx = { w: bestPx.w, h: bestPx.h };
  
  // Store as canonical world coordinates in state (primary storage)
  if (window.state) {
    window.state.ocean = { anchor, rectWorld: rWorld, rectPx: { w: bestPx.w, h: bestPx.h } };
    console.debug('[ocean] anchor stored in state', { anchor, rectWorld: rWorld, rectPx });
    
    // VERIFICATION: Log the coordinate conversion for debugging
    console.log('[ocean] Coordinate conversion verification:', {
      originalPx: bestPx,
      worldRect: rWorld,
      zoomTransform: { k: t.k, x: t.x, y: t.y },
      roundtripCheck: {
        pxFromWorld: {
          x: t.applyX(rWorld.x),
          y: t.applyY(rWorld.y),
          w: t.applyX(rWorld.x + rWorld.w) - t.applyX(rWorld.x),
          h: t.applyY(rWorld.y + rWorld.h) - t.applyY(rWorld.y)
        }
      }
    });
  }
  
  // Save on the SVG (fallback) and screen-labels (fallback)
  const svgSel = d3.select('svg');
  const svgNode = svgSel.node();
  const rootNode = svgSel.select('#screen-labels').node();
  if (svgNode) { svgNode.__oceanWorldAnchor = anchor; svgNode.__oceanRectPx = rectPx; }
  if (rootNode) { rootNode.__oceanWorldAnchor = anchor; rootNode.__oceanRectPx = rectPx; }
  console.debug('[ocean] anchor stored', {
    onSvg: !!(svgNode && svgNode.__oceanWorldAnchor),
    onRoot: !!(rootNode && rootNode.__oceanWorldAnchor),
    inState: !!(window.state && window.state.ocean),
    anchor,
    svgNodeId: svgNode?.id || 'no-id',
    rootNodeId: rootNode?.id || 'no-id'
  });
  
  return bestPx;
}

// Convert pixel rectangle to world coordinates using zoom transform
function pxToWorldRect(px, t) {
  const x0 = t.invertX(px.x),          y0 = t.invertY(px.y);
  const x1 = t.invertX(px.x + px.w),   y1 = t.invertY(px.y + px.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Simple pixel-based font fitter for ocean labels
function fitFontPx(text, maxWidthPx, basePx = 28, family = labelFontFamily()) {
  // Use the existing measureTextWidth function for consistency
  const svg = d3.select('svg');
  const MIN_OCEAN_PX = 34; // screen pixels floor
  let fs = basePx;
  
  while (fs > 12) { // don't go smaller than 12px
    const textW = measureTextWidth(svg, text, { fontSize: fs, family, weight: 700 });
    if (textW <= maxWidthPx) break;
    fs -= 2; // reduce by 2px each iteration
  }
  
  return Math.max(fs, MIN_OCEAN_PX); // enforce minimum
}

// Optional (nice UX): only accept rects that can fit the text horizontally at (or slightly below) your base font size
export function fitFontToRect(text, rect, basePx, family = labelFontFamily()) {
  // Use the existing measureTextWidth function for consistency
  const svg = d3.select('svg');
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

  // console.log(`[ocean] Debug rect clamped to viewport: ${clamped.width}x${clamped.height} at (${clamped.x},${clamped.y})`);
}

// Minimal, screen-space ocean renderer
function renderOceanOverlay(rectPx, text) {
  const sel = d3.select('#labels-overlay')
    .selectAll('g.ocean-label')
    .data([{ id: 0, rectPx, text }], d => `ocean:${d.id}`);

  const gEnter = sel.enter().append('g')
    .attr('class', 'feature-label ocean-label')
    .attr('id', 'ocean-label'); // Add stable ID for reprojection

  gEnter.append('text').attr('class','ocean-text')
    .attr('vector-effect', 'non-scaling-stroke')
    .style('paint-order', 'stroke');

  const g = gEnter.merge(sel);
  g.attr('transform', `translate(${rectPx.x},${rectPx.y})`);

  g.select('text')
    .text(d => d.text)
    .attr('x', rectPx.w/2)
    .attr('y', rectPx.h/2)
    .attr('text-anchor','middle')
    .attr('dominant-baseline','middle')
    .style('display', null);

  sel.exit().remove();
}

// Render ocean labels only (separate layer to avoid affecting other labels)
export function renderOceanOnly(gOcean, oceanDatum, rectPx) {
  if (!oceanDatum || !oceanDatum.text) {
    // Clear ocean layer if no ocean data
    gOcean.selectAll('*').remove();
    return;
  }

  // Use the minimal overlay renderer
  renderOceanOverlay(rectPx, oceanDatum.text);
  
  console.log(`[ocean] Rendered ocean label in screen space at rect: ${rectPx.w}x${rectPx.h} at (${rectPx.x},${rectPx.y})`);
  
  if (window.DBG && window.DBG.safety === true) {
    d3.select('#labels-world').selectAll('g.feature-label')
      .style('display', null)
      .attr('opacity', null);
  }
}

// Place ocean label in screen space using SAT rectangle
export function placeOceanLabelInScreenSpace(rectPx, oceanText, svg) {
  // Ensure ocean label layer exists
  let gOcean = svg.select('#labels-overlay');
  if (gOcean.empty()) {
    gOcean = svg.append('g').attr('id', 'labels-overlay');
  }
  
  // Ensure it's on top
  gOcean.raise();
  
  // Center in screen space
  placeTextInRect(oceanText, rectPx, { space: 'px' });
  
  console.log(`[ocean] Placed ocean label in screen space at rect: ${rectPx.w}x${rectPx.h} at (${rectPx.x},${rectPx.y})`);
}

// Place ocean label with font scaling to fit the rectangle
// NOTE: This function uses screen coordinates and is primarily for testing.
// For production use, ocean labels are now handled by the world-space label system.
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
    .attr('font-family', labelFontFamily())
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
  const screenLabelsGroup = ensureScreenLabelLayer(svg);
  // Ensure it's above other elements but below HUD
  screenLabelsGroup.raise();
  
  // the screen-space ocean text
  const oceanText = screenLabelsGroup.append('text')
    .attr('id', 'ocean-label')
    .attr('class', 'place-label ocean')
    .attr('x', cx)
    .attr('y', cy)
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('vector-effect', 'non-scaling-stroke')
    .style('paint-order', 'stroke')
    .style('font-size', `${getLabelTokens().sizes_px.t1_major}px`)  // token-driven sizing
    .text(oceanLabel.text)
    .classed('ocean', true)
    .attr('data-ocean', '1')
    .attr('transform', null); // IMPORTANT: keep only x/y, no transforms

  // --- persist world-space anchor and rect size for zoom re-projection ---
  // world anchor at rect center
  const wr = worldRect || rectWorld || oceanLabel?.rectWorld;
  console.debug('[ocean] anchor storage check', { 
    hasWorldRect: !!worldRect, 
    hasRectWorld: !!rectWorld, 
    hasOceanLabelRect: !!oceanLabel?.rectWorld,
    wr: wr 
  });
  if (wr) {
    const anchor = { x: wr.x + wr.w * 0.5, y: wr.y + wr.h * 0.5 };
    const rectPx = { w: rectPx?.w ?? rectPx?.width ?? 0, h: rectPx?.h ?? rectPx?.height ?? 0 };
    
    // Store as canonical world coordinates in state (primary storage)
    if (window.state) {
      window.state.ocean = { anchor, rectWorld: wr, rectPx: { w: rectPx?.w ?? rectPx?.width ?? 0, h: rectPx?.h ?? rectPx?.height ?? 0 } };
      console.debug('[ocean] anchor stored in state', { anchor, rectWorld: wr, rectPx });
    }
    
    // Save on the SVG (fallback) and screen-labels (fallback)
    const svgNode = svg.node();
    const rootNode = screenLabelsGroup.node();
    if (svgNode) { svgNode.__oceanWorldAnchor = anchor; svgNode.__oceanRectPx = rectPx; }
    if (rootNode) { rootNode.__oceanWorldAnchor = anchor; rootNode.__oceanRectPx = rectPx; }
    console.debug('[ocean] anchor stored', {
      onSvg: !!(svgNode && svgNode.__oceanWorldAnchor),
      onRoot: !!(rootNode && rootNode.__oceanWorldAnchor),
      inState: !!(window.state && window.state.ocean),
      anchor,
      svgNodeId: svgNode?.id || 'no-id',
      rootNodeId: rootNode?.id || 'no-id'
    });
  } else {
    // last-resort fallback (should almost never hit)
    const t = d3.zoomTransform(svg.node());
    const anchor = { x: (cx - t.x) / t.k, y: (cy - t.y) / t.k };
    
    // Store as canonical world coordinates in state (primary storage)
    if (window.state) {
      window.state.ocean = { anchor, rectWorld: null, rectPx: { w: 0, h: 0 } };
      console.debug('[ocean] fallback anchor stored in state', { anchor });
    }
    
    const svgNode = svg.node();
    const rootNode = screenLabelsGroup.node();
    if (svgNode) { svgNode.__oceanWorldAnchor = anchor; }
    if (rootNode) { rootNode.__oceanWorldAnchor = anchor; }
  }

  console.log(`[ocean] Placed label "${oceanLabel.text}" at screen coords (${cx.toFixed(1)}, ${cy.toFixed(1)}) with font size ${fs}px`);
  
  // Create debug rect if needed
  if (window.DBG?.labels && rectPx && (rectPx.w || rectPx.width)) {
    const pxW = rectPx.w ?? rectPx.width ?? 0;
    const pxH = rectPx.h ?? rectPx.height ?? 0;
    screenLabelsGroup.append('rect')
      .attr('id', 'ocean-rect')
      .attr('class', 'ocean-bbox')
      .attr('x', cx - pxW/2)
      .attr('y', cy - pxH/2)
      .attr('width', pxW)
      .attr('height', pxH);
  }
  
  return oceanText;
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
  const screenLabels = ensureScreenLabelLayer(svg);
  screenLabels.selectAll('*').remove();
}

// Reposition the ocean screen label based on the current zoom transform.
// Keeps size constant (no scaling), only translates to the projected world anchor.
export function updateOceanLabelScreenPosition(svg, transform) {
  const t = transform ?? d3.zoomTransform(svg.node());

  // try state first (canonical), then SVG fallback, then #screen-labels fallback
  let anchor, rectPx;
  
  if (window.state && window.state.ocean) {
    // Use canonical state data
    anchor = window.state.ocean.anchor;
    rectPx = window.state.ocean.rectPx;
  } else {
    // Fallback to SVG node storage
    const svgNode  = svg.node();
    const rootNode = svg.select('#screen-labels').node();
    anchor = (svgNode && svgNode.__oceanWorldAnchor)
          || (rootNode && rootNode.__oceanWorldAnchor);
    rectPx = (svgNode && svgNode.__oceanRectPx)
          || (rootNode && rootNode.__oceanRectPx);
  }

  if (!anchor) {
    if (window.DBG?.labels) console.debug('[ocean] reproj skipped: no anchor on svg or #screen-labels');
    return;
  }

  const sx = t.applyX(anchor.x);
  const sy = t.applyY(anchor.y);

  const labelSel = svg.select('#ocean-label');
  if (labelSel.empty()) {
    if (window.DBG?.labels) console.debug('[ocean] reproj skipped: #ocean-label not found');
    return;
  }

  // Update the group's transform to position the ocean label
  labelSel.attr('transform', `translate(${sx},${sy})`);

  const rectSel = svg.select('#ocean-rect');
  if (!rectSel.empty() && rectPx) {
    rectSel.attr('x', sx - rectPx.w / 2)
           .attr('y', sy - rectPx.h / 2)
           .attr('width', rectPx.w)
           .attr('height', rectPx.h);
  }

  if (window.DBG?.labels) console.debug('[ocean] reproj', { k: t.k, x: t.x, y: t.y, anchor, sx, sy });
}

// Debug helper for testing ocean label reprojection
window.__dbgReprojectOcean = () => {
  const svg = d3.select('svg');
  updateOceanLabelScreenPosition(svg);
  const anchor = (window.state && window.state.ocean) ? window.state.ocean.anchor : svg.node().__oceanWorldAnchor;
  console.log('[dbg] reprojection nudged to', anchor);
};

// Remove any previously placed ocean labels
export function clearExistingOceanLabels(rootSel = d3.select('#labels-overlay')) {
  try { rootSel.selectAll('g.ocean-label').remove(); } catch (e) {}
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
  // Get the active zoom transform from the *world* svg group
  const world = d3.select('#world').node() || d3.select('svg').node();
  const z = d3.zoomTransform(world);

  // convert pixel -> world
  function pxToWorld(px, py) {
    return { x: (px - z.x) / z.k, y: (py - z.y) / z.k };
  }

  // Wrapper used by buildWaterMaskSAT
  function localPointIsOcean(px, py) {
    const { x, y } = pxToWorld(px, py);         // <-- convert first
    const cell = getCellAtXY?.(x, y);
    if (!cell) return true;                      // treat unknown as water (safe)
    let h = cell.height ?? cell.data?.height ?? cell.polygon?.height ?? null;
    if (h == null) return true;
    return h <= seaLevel;
  }
  const satEnv = timeit('SAT build water mask (bbox)', () => buildWaterMaskSAT(visibleBounds, step, localPointIsOcean));
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
          const satRect = findOceanLabelRectAfterAutofit(visibleBounds, getCellAtXY, seaLevel, step, pad, minAspect, 0.6);
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

// DEBUG: count world vs overlay label nodes
export function __debugCountLabels() {
  const areas = d3.select('#labels-world-areas').selectAll('g.feature-label');
  const ocean = d3.select('#labels-world-ocean').selectAll('g.ocean-label');
  const overlay = d3.select('#labels-overlay').selectAll('g.ocean-label');
  const on = s => s.filter(function(){ return this.style.display !== 'none' }).size();
  console.table({
    areas_nodes: areas.size(),
    areas_visible: on(areas),
    ocean_nodes: ocean.size(),
    ocean_visible: on(ocean),
    overlay_nodes: overlay.size(),
    overlay_visible: on(overlay)
  });
}

/**
 * Update label visibility based on zoom level and tier
 * @param {Object} svg - D3 selection of the SVG element
 */
export function updateLabelVisibilityByTier(svg) {
  if (!window.labelFlags?.fadeBands) {
    // fallback: show all by class
    svg.selectAll('#labels-world-areas text.label, #labels-world-ocean text.label--ocean')
       .classed('is-visible', true)
       .style('opacity', null);
    return;
  }
  const k = getZoomState().k;

  const sel = svg.selectAll('#labels-world-areas text.label, #labels-world-ocean text.label--ocean');
  sel.each(function(d) {
    const tier = d?.tier ?? 3;
    const o = opacityForZoom(k, tier);
    d3.select(this)
      .classed('is-visible', o > 0)
      .style('opacity', o);
  });
}
