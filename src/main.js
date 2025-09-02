// Global debug toggle - flip to true when tuning
window.DEBUG = false;

// Label system temporarily disabled - flags removed until new modules arrive
window.labelFlags = {};

// URL flag helper for QA overlays and feature toggles
const urlFlags = (new URLSearchParams(location.search).get('flags') || "")
  .split(",").filter(Boolean);
const hasFlag = f => urlFlags.includes(f);

// Performance timing function
function timeit(tag, fn) {
  const t0 = performance.now();
  const out = fn();
  const t1 = performance.now();
  console.log(`[cost] ${tag}: ${(t1-t0).toFixed(1)} ms`);
  return out;
}

// Safely insert new nodes before an in-parent anchor; otherwise append.
// Works with D3 v5 .enter() selections.
function safeInsertBefore(parentSel, enterSel, tag, beforeSelector) {
  const parentNode = parentSel.node();
  // Anchor must be selected inside the SAME parent
  const beforeNode = beforeSelector ? parentSel.select(beforeSelector).node() : null;

  const sameParent = !!beforeNode && beforeNode.parentNode === parentNode;
  console.log('[safeInsertBefore] parent=#' + (parentNode && parentNode.id),
              { beforeSelector, beforeNodeTag: beforeNode && beforeNode.tagName, sameParent });

  if (sameParent) {
    // Per-group insert (D3 v5): pass a function returning the before node
    return enterSel.insert(tag, function() { return beforeNode; });
  } else {
    console.warn('[safeInsertBefore] anchor invalid or not in parent; using append');
    return enterSel.append(tag);
  }
}

import { RNG } from "./core/rng.js";
import { Timers } from "./core/timers.js";
import { ensureLayers } from "./render/layers.js";
// ensureLabelSubgroups temporarily disabled until new labeling system arrives
import { runSelfTests, renderSelfTestBadge, clamp01, ensureReciprocalNeighbors } from "./selftest.js";
import { initLabelingStyle } from "./labels/index.js";
import { poissonDiscSampler, buildVoronoi, detectNeighbors } from "./modules/geometry.js";
import { randomMap } from "./modules/heightmap.js";
import { markFeatures } from "./modules/features.js";
import { makeNamer } from "./modules/names.js";
import { drawCoastline } from "./modules/coastline.js";
import { drawPolygons, toggleBlur } from "./modules/rendering.js";
import { attachInteraction, getVisibleWorldBounds, padBounds, zoom } from "./modules/interaction.js";
import { fitToLand, autoFitToWorld, afterLayout, clampRectToBounds } from './modules/autofit.js';
import { refineCoastlineAndRebuild } from "./modules/refine.js";
import { buildProtoAnchors } from "./labels/anchors.js";
import { makeAnchorIndex } from "./labels/spatial-index.js";
import { enrichAnchors } from "./labels/enrich.js";
import { attachStyles } from "./labels/style-apply.js";
import { computeWaterComponentsTopo, applyWaterKindsToAnchors } from "./labels/water-split.js";
import { buildWaterComponentAnchors } from "./labels/anchors-water.js";
import { renderQAWaterAnchors } from "./labels/debug-markers.js";
// Null shim for old labeling functions (temporary until new modules arrive)
import {
  ensureLabelContainers,
  buildFeatureLabels,
  placeLabelsAvoidingCollisions,
  renderWorldLabels,
  renderOverlayLabels,
  updateLabelVisibilityLOD,
  updateLabelTransforms,
  clearLabels,
  ensureMetrics,
  measureTextWidth,
  renderOceanInWorld,
  findOceanLabelSpot,
  placeOceanLabelAtSpot,
  labelKey,
  // Additional functions still being called in the code
  getVisibleWorldBoundsFromLabels,
  updateLabelVisibility,
  updateLabelVisibilityWithOptions,
  filterByZoom,
  clampToKeepRect,
  drawDebugOceanRect,
  findOceanLabelRectAfterAutofit,
  makeIsWater,
  applyFontCaps,
  LABEL_DEBUG,
  smokeLabel,
  debugLabels,
  placeOceanLabelsAfterAutofit
} from "./modules/labels-null-shim.js";

// === Water Reclassification Helper ==========================================
// Live reclassification helper (tune Step 3b without reloads)
window.reclassWater = (opts = {}) => {
  // Check if we have the necessary data
  if (!window.currentPolygons || !window.__anchorsEnriched) {
    console.warn('[reclassWater] No map data available. Generate a map first.');
    return null;
  }

  // Get map dimensions from various sources
  const svg = d3.select('svg');
  const mapW = svg.attr('width') ? +svg.attr('width') : (svg.node()?.clientWidth || 1024);
  const mapH = svg.attr('height') ? +svg.attr('height') : (svg.node()?.clientHeight || 768);

  const {
    seaLevel  = 0.20,   // height <= seaLevel -> water
    seaAreaPx = Math.max(900, 0.004 * mapW * mapH), // absolute threshold in px²
    seaFrac   = 0.004,  // fallback: 0.4% of map area if seaAreaPx is null
    quant     = 1       // vertex rounding decimals for adjacency
  } = opts;

      // Import the water-split functions dynamically
    import('./labels/water-split.js').then(({ computeWaterComponentsTopo, applyWaterKindsToAnchors }) => {
    import('./labels/style-apply.js').then(({ attachStyles }) => {
      const water = computeWaterComponentsTopo({
        polygons: window.currentPolygons,
        width: mapW,
        height: mapH,
        seaLevel,
        seaFrac,
        seaAreaPx,
        quant
      });

      const refined = applyWaterKindsToAnchors(window.__anchorsEnriched, water.classByPoly);
      const styled  = attachStyles(refined);

      window.__waterComponents = water.components;
      window.__waterMetrics    = water.metrics;
      window.__anchorsRefined  = refined;
      window.__anchorsStyled   = styled;

      const count = k => refined.filter(a => a.kind === k).length;
      console.log("[water:tune]", {
        params: { seaLevel, seaAreaPx, seaFrac, quant },
        components: {
          total: water.components.length,
          oceans: water.components.filter(c => c.kind === "ocean").length,
          seas:   water.components.filter(c => c.kind === "sea").length,
          lakes:  water.components.filter(c => c.kind === "lake").length
        },
        anchors: { ocean: count("ocean"), sea: count("sea"), lake: count("lake") }
      });

      return { water, refined, styled };
    });
  }).catch(error => {
    console.error('[reclassWater] Failed to import water-split module:', error);
  });
};

// === Minimal Perf HUD ==========================================
const Perf = (() => {
  const s = {zoom:[], hover:[], paint:[]};
  const hud = d3.select('body').append('div')
    .attr('id','perfHUD')
    .style('position','fixed').style('left','8px').style('bottom','8px')
    .style('background','rgba(0,0,0,.6)').style('color','#fff')
    .style('font','12px/1.2 system-ui').style('padding','6px 8px').style('border-radius','6px')
    .style('z-index', 99999).style('pointer-events','none');

  let last = performance.now(), frames = 0, fps = 0;
  (function loop(){
    const now = performance.now(); frames++;
    if (now - last > 500) { fps = frames * 1000 / (now - last); frames = 0; last = now; }
    hud.text(`FPS ${fps.toFixed(0)}  |  zoom ${avg(s.zoom)}ms  hover ${avg(s.hover)}ms  paint ${avg(s.paint)}ms`);
    requestAnimationFrame(loop);
  })();

  function avg(a){ return a.length ? (a.reduce((x,y)=>x+y,0)/a.length).toFixed(2) : '—'; }
  function time(bucket, fn){
    const t0 = performance.now(); const r = fn(); const dt = performance.now() - t0;
    const arr = s[bucket]; arr.push(dt); if (arr.length > 60) arr.shift(); return r;
  }
  return {time};
})();

// Global state object for seed management
const state = {
  seed: Math.floor(Math.random() * 1000000), // Random seed for initial generation
  getCellAtXY: null, // Will be set after Voronoi/refine
  seaLevel: 0.2
};

// Build robust XY→cell accessor using simple nearest-neighbor search (D3 v5 compatible)
function buildXYAccessor(cells) {
  if (!cells || cells.length === 0) {
    console.warn('[accessor] No cells provided to buildXYAccessor');
    return null;
  }
  
  // Extract centroids for nearest-neighbor search
  const points = cells.map((cell, index) => {
    // Calculate centroid from polygon vertices
    let cx = 0, cy = 0, count = 0;
    if (cell && cell.length > 0) {
      cell.forEach(vertex => {
        if (vertex && vertex.length >= 2) {
          cx += vertex[0];
          cy += vertex[1];
          count++;
        }
      });
    }
    return {
      x: count > 0 ? cx / count : 0,
      y: count > 0 ? cy / count : 0,
      index
    };
  });
  
  // Return accessor function using simple nearest-neighbor search
  return (x, y) => {
    let nearest = null;
    let minDist = Infinity;
    
    for (const point of points) {
      const dx = point.x - x;
      const dy = point.y - y;
      const dist = dx * dx + dy * dy; // squared distance (faster than sqrt)
      
      if (dist < minDist) {
        minDist = dist;
        nearest = cells[point.index];
      }
    }
    
    return nearest;
  };
}

// Old labeling system removed - makeIsWater function cleaned out (now imported from null shim)

// Helper to get visible world bounds after current zoom/pan (with explicit width/height)
function getVisibleWorldBoundsWithSize(svg, zoom, width, height) {
  const t = d3.zoomTransform(svg.node());
  // Inverse-transform the viewport corners into world space:
  const topLeft = t.invert([0, 0]);
  const bottomRight = t.invert([width, height]);
  return [topLeft[0], topLeft[1], bottomRight[0], bottomRight[1]];
}

// Get viewport bounds in screen coordinates (for SAT-based ocean label placement)
function getViewportBounds(pad = 0) {
  const svg = d3.select('svg');
  const W = +svg.attr('width'), H = +svg.attr('height');
  return [pad, pad, W - pad, H - pad]; // left, top, right, bottom — all <= svg size
}

// Old labeling system removed - placeOceanLabelAtSpot function cleaned out



// Spatial picking system (no DOM hit-testing) - DEPRECATED: Now using buildXYAccessor
// Keeping for backward compatibility with existing code
// ⚠️ NOTE: This is NOT used for ocean label placement anymore
let spatialIndex;
function buildPickingIndex(cells) {
  // Build simple spatial index from cell centroids
  // For D3 v5 compatibility, use simple distance-based picking
  spatialIndex = cells.map((cell, index) => {
    // Calculate centroid from polygon vertices
    let cx = 0, cy = 0, count = 0;
    if (cell && cell.length > 0) {
      cell.forEach(vertex => {
        if (vertex && vertex.length >= 2) {
          cx += vertex[0];
          cy += vertex[1];
          count++;
        }
      });
    }
    return {
      index,
      x: count > 0 ? cx / count : 0,
      y: count > 0 ? cy / count : 0,
      cell
    };
  });
}

function pickCellAt(wx, wy) {
  if (!spatialIndex || spatialIndex.length === 0) return null;
  
  // Simple nearest-neighbor search
  let nearest = null;
  let minDist = Infinity;
  
  spatialIndex.forEach(point => {
    const dx = point.x - wx;
    const dy = point.y - wy;
    const dist = dx * dx + dy * dy; // squared distance (faster than sqrt)
    
    if (dist < minDist) {
      minDist = dist;
      nearest = point.cell;
    }
  });
  
  return nearest;
}

// Raster LOD for cells
function ensureCellsRaster() {
  let raster = d3.select('#cellsRaster');
  if (raster.empty()) {
    raster = d3.select('#world').insert('image', '.mapCells')
      .attr('id', 'cellsRaster').attr('x', 0).attr('y', 0)
      .attr('preserveAspectRatio', 'none');
  }
  return raster;
}

function rasterizeCellsToImageURL(w, h, cells) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  
  // draw fills only (strokes are too expensive at low zoom)
  for (const cell of cells) {
    const poly = cell; // cell is the polygon array
    if (!poly || !poly.length) continue;
    
    // Use the same color logic as the rendering module
    const height = cell.height || 0;
    const color = d3.scaleSequential(d3.interpolateSpectral)(1 - height);
    
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]);
    ctx.closePath();
    ctx.fill();
  }
  return c.toDataURL('image/png');
}

// call after each generation
function updateCellsRaster() {
  const raster = ensureCellsRaster();
  const mapW = +d3.select('svg').attr('width');
  const mapH = +d3.select('svg').attr('height');
  raster.attr('href', rasterizeCellsToImageURL(mapW, mapH, window.currentPolygons));
}

// Toggle LOD by zoom level
function updateCellsLOD(k) {
  const gCells = d3.select('.mapCells');
  const raster = ensureCellsRaster();
  
  const showVectors = k >= 2.0;
  gCells.style('display', showVectors ? null : 'none');
  raster.style('display', showVectors ? 'none' : null);

  // hide strokes until closer to avoid paint cost
  gCells.classed('no-stroke', k < 3.0);
}

// Wire it at generation end
function afterGenerate() {
  buildPickingIndex(window.currentPolygons);
  updateCellsRaster();
  // Disable pointer events on heavy layers (use spatial picking instead)
  d3.select('.mapCells').style('pointer-events', 'none');
  
  // Also ensure the XY accessor is built for ocean label placement
  if (!state.getCellAtXY && window.currentPolygons) {
    state.getCellAtXY = buildXYAccessor(window.currentPolygons);
    console.log(`[afterGenerate] Built XY accessor for ${window.currentPolygons.length} cells`);
  }
}

// Track user interaction for intelligent ocean placement deferral
function setupInteractionTracking() {
  // Track mouse movement
  document.addEventListener('mousemove', () => {
    window.lastMouseMove = Date.now();
  }, { passive: true });
  
  // Track touch events
  document.addEventListener('touchstart', () => {
    window.lastTouchEvent = Date.now();
  }, { passive: true });
  
  // Track scroll events
  document.addEventListener('scroll', () => {
    window.lastScrollEvent = Date.now();
  }, { passive: true });
  
  console.log('[ocean] Interaction tracking enabled for intelligent placement deferral');
}

// Global transform tracking for coordinate space conversions
let currentTransform = d3.zoomIdentity;
window.currentTransform = currentTransform; // Global transform tracking

// Label scaling configuration - now handled by per-label transforms
// const LABELS_NONSCALING = true; // DEPRECATED: Now using per-label transform system

// Feature label system configuration - using new system

// Suppress console warnings for D3 wheel events globally
// This prevents the expected D3 v5 wheel event warnings from cluttering the console
// Note: These warnings are expected for D3 v5 zoom behavior and can be safely ignored
const originalWarn = console.warn;
console.warn = function(...args) {
  const message = args[0];
  if (typeof message === 'string' && 
      (message.includes('non-passive event listener') || 
       message.includes('scroll-blocking') ||
       message.includes('wheel'))) {
    return; // Suppress D3 wheel event warnings
  }
  originalWarn.apply(console, args);
};

// Seeded RNG + Timers singletons
const rng = new RNG(state.seed);
const timers = new Timers();

// Set up interaction tracking for intelligent ocean placement deferral
setupInteractionTracking();

console.group('Urban Train - Initial Generation');
console.time('generate');
generate(5); // Generate a random map with 5 features on initial load
console.timeEnd('generate');
console.groupEnd();

// general function; run onload of to start from scratch
async function generate(count) {
  timers.clear();
  timers.mark('generate');

  // Initialize Step-1 style system (no placement/render yet)
  try {
    initLabelingStyle();
  } catch (e) {
    console.error(e);
    throw e; // fail fast so we see schema errors
  }

  // STEP 0: no labels — stub arrays so legacy calls don't explode
  let featureLabels = [];
  let oceanLabels = [];
  window.__featureLabels = featureLabels;   // some logs check this
  window.featureLabels   = featureLabels;   // some code inspects this too

  // Old labeling system removed

  // make RNG deterministic for this generation
  rng.reseed(state.seed);
  
  // Old labeling system removed
  
  // Clear any debug circles from previous generation
  const existingDebugCircles = d3.selectAll('.debug-circle');
  if (!existingDebugCircles.empty()) {
    existingDebugCircles.remove();
  }
  
  // Clear any existing screen labels from previous generation (no longer needed - ocean labels now in world space)

  var svg = d3.select("svg"),
    mapWidth = +svg.attr("width"),
    mapHeight = +svg.attr("height"),
    defs = svg.select("defs");
    
  // Ensure proper layer structure
  const layers = ensureLayers(svg);
  // Old labeling system removed - ensureLabelContainers temporarily disabled
  
  // One-time, non-zoomed container only for text measurement
  let gMeasure = svg.select("g.__measure");
  if (gMeasure.empty()) {
    gMeasure = svg.append("g")
      .attr("class", "__measure")
      .style("pointer-events", "none");
  }
  
  // Use the world container for map elements
  const world = layers.world;
  const islandBack = world.append("g").attr("class", "islandBack");
  const mapCells = world.append("g").attr("class", "mapCells");
  const oceanLayer = world.append("g").attr("class", "oceanLayer");
  const circles = world.append("g").attr("class", "circles");
  const coastline = world.append("g").attr("class", "coastline");
  const shallow = world.append("g").attr("class", "shallow");
  const lakecoast = world.append("g").attr("class", "lakecoast");
    
  // Create HUD layer outside the world container
  let gHUD = svg.append("g").attr("id", "hud").style("pointer-events", "none");
  
  // Create screen-space overlay for debug rectangles (no zoom transform)
  const overlayScreen = svg.append("g")
    .attr("id", "overlay-screen")
    .attr("pointer-events", "none");
  
  // Create world-space overlay for any future world-coordinate debug elements
  const overlayWorld = world.append("g")
    .attr("id", "overlay-world")
    .attr("pointer-events", "none");
  
  // Make debug overlays available globally
  window.debugOverlays = { overlayScreen, overlayWorld };
  
  // Poisson-disc sampling from https://bl.ocks.org/mbostock/99049112373e12709381
  const sampler = poissonDiscSampler(mapWidth, mapHeight, sizeInput.valueAsNumber, rng);
  let samples = [];
  for (let s; (s = sampler()); ) samples.push(s);
  // Voronoi D3
  let diagram, polygons;
  ({ diagram, polygons } = buildVoronoi(samples, mapWidth, mapHeight));
  window.currentPolygons = polygons; // keep a global mirror for late callbacks
  
  // Guard against undefined polygons
  if (typeof polygons === 'undefined' || !polygons) {
    console.error('[guard] polygons unavailable; cannot continue generation');
    return; // Exit early if polygons are not available
  }
  
  // Store polygons globally for access by other functions
  window.currentPolygons = polygons;
  // Colors D3 interpolation
  const color = d3.scaleSequential(d3.interpolateSpectral);
  // Queue array  
  const queue = [];



  // Create fantasy namer for this generation
  const namer = makeNamer(() => rng.random());

  detectNeighbors(diagram, polygons);
  
  // Ensure reciprocal neighbors for self-tests
  ensureReciprocalNeighbors({ cells: polygons });

  // Attach interaction handlers (zoom + hover HUD)
  const svgSel = d3.select('svg');
  const worldSel = d3.select('#world');
  const hudRefs = { 
    cellEl:   document.getElementById('cell'),
    heightEl: document.getElementById('height'),
    featureEl:document.getElementById('feature')
  };
  const interact = attachInteraction({
    svg: svgSel,
    viewbox: worldSel, // Use world container instead of viewbox
    diagram,
    polygons,
    hud: hudRefs
  });











  // Click handler removed - no longer adding terrain on click

  if (count != undefined) {
    randomMap(count, {
      rng, diagram, polygons,
      heightInput, radiusInput, sharpnessInput,
      circlesLayer: circles,
      mapWidth, mapHeight, color, radiusOutput
    });
    
    // === Adaptive Coastline Refinement ===================================
    {
      // Pre-refinement height check
      (function logHeightStats(tag, polys){
        let c = 0, min = Infinity, max = -Infinity, sum = 0;
        for (const p of polys) {
          const h = p.height ?? 0;
          if (h < min) min = h;
          if (h > max) max = h;
          sum += h; c++;
        }
        console.log(`${tag} height stats: count=${c} min=${min.toFixed(3)} max=${max.toFixed(3)} mean=${(sum/c).toFixed(3)}`);
      })('[pre-refine]', polygons);
      
      const seaLevel = 0.2; // keep consistent with existing logic
      // More aggressive spacing for noticeable refinement:
      const targetSpacing = Math.max(4, sizeInput.valueAsNumber * 0.4);
      const minSpacingFactor = 0.6;

      const refined = refineCoastlineAndRebuild({
        samples,
        diagram,
        polygons,
        mapWidth,
        mapHeight,
        seaLevel,
        targetSpacing,
        minSpacingFactor
      });

      if (refined && refined.polygons && refined.diagram) {
        samples = refined.samples;
        diagram = refined.diagram;
        polygons = refined.polygons;
        window.currentPolygons = polygons; // update global reference

        // Recompute neighbors after topology change
        detectNeighbors(diagram, polygons);

        console.log(`[refine] Added ${refined.added} coastal points; polygons now: ${polygons.length}`);
      }
    }
    // =====================================================================
    
    // Step 2: build proto-anchors + index (no rendering yet)
    const { anchors, metrics } = buildProtoAnchors({ polygons, max: 200 });
    const anchorIndex = makeAnchorIndex(anchors);
    window.__anchors = anchors;
    window.__anchorIndex = anchorIndex;
    console.log("[anchors] built", metrics, { sample: anchors.slice(0, 5) });
    console.log("[anchors:index] size", anchorIndex.size());
    
    // Step 3: enrich anchors with kinds + attach styles (no rendering yet)
    const { anchors: enriched, metrics: enrichMetrics } =
      enrichAnchors({ anchors, polygons: window.currentPolygons, sea: 0.10 });

    // Step 3b: split water into ocean/sea/lake (data-only)
    const mapW = mapWidth || 1024;
    const mapH = mapHeight || 768;

    console.log("[water:debug]", {
      polygonsCount: window.currentPolygons?.length || 0,
      mapW, mapH,
      seaLevel: 0.20
    });

    const water = computeWaterComponentsTopo({
      polygons: window.currentPolygons,
      width: mapW,
      height: mapH,
      seaLevel: 0.20,
      seaAreaPx: Math.max(900, 0.004 * mapW * mapH), // ≈ "big lake → sea"
      // seaFrac: 0.004, // (fallback if you prefer fraction)
      quant: 1
    });

    const refined = applyWaterKindsToAnchors(enriched, water.classByPoly);

    // logs + window handles for QA
    window.__waterComponents = water.components;
    window.__waterMetrics    = water.metrics;
    window.__anchorsRefined  = refined;

    console.log("[water:components]", {
      comps: water.components.length,
      oceans: water.components.filter(c => c.kind === "ocean").length,
      seas:   water.components.filter(c => c.kind === "sea").length,
      lakes:  water.components.filter(c => c.kind === "lake").length
    }, water.metrics);

    // Build one anchor per inland water component (no rendering yet)
    const waterAnchorBuild = buildWaterComponentAnchors({
      components: water.components,
      polygons: window.currentPolygons,
      includeOcean: false
    });

    const waterAnchors = waterAnchorBuild.anchors;
    const waterAnchorsStyled = attachStyles(waterAnchors);

    window.__waterAnchors = waterAnchors;
    window.__waterAnchorsStyled = waterAnchorsStyled;

    // QA overlay: render water component centroids if flag is present
    if (hasFlag('qaCentroids')) {
      const svgNode = (typeof svg !== 'undefined' && svg.node) ? svg : d3.select('svg');
      renderQAWaterAnchors(svgNode, window.__waterAnchorsStyled || window.__waterAnchors || []);
      console.log("[qa] water centroid markers rendered:", (window.__waterAnchors || []).length);
    }

    console.log("[water:anchors] built", waterAnchorBuild.metrics,
      { sample: waterAnchorsStyled.slice(0, 5).map(a => ({ id:a.id, kind:a.kind })) });

    // Live reclassification helper moved to global scope

    const styledAnchors = attachStyles(refined);

    window.__anchorsEnriched = enriched;
    window.__anchorsRefined  = refined;
    window.__anchorsStyled   = styledAnchors;

    console.log("[anchors:enrich] metrics", enrichMetrics);
    console.log("[anchors:style] sample",
      styledAnchors.slice(0, 5).map(a => ({
        id: a.id, kind: a.kind, tier: a.tier,
        style: a.style && { category: a.style.category, tier: a.style.tier, size: a.style.size?.[a.tier] }
      }))
    );
    
    // Build robust XY accessor after refine/Voronoi (when cells have x,y,height,featureType)
    state.getCellAtXY = buildXYAccessor(polygons);
    if (!state.getCellAtXY) {
      console.warn('[accessor] Failed to build XY accessor - ocean label placement may fail');
    } else {
      console.log(`[accessor] Built XY accessor for ${polygons.length} cells`);
    }
    
    // Sanity check: verify heights are preserved
    (function logHeightStats(tag, polys){
      let c = 0, min = Infinity, max = -Infinity, sum = 0;
      for (const p of polys) {
        const h = p.height ?? 0;
        if (h < min) min = h;
        if (h > max) max = h;
        sum += h; c++;
      }
      console.log(`${tag} height stats: count=${c} min=${min.toFixed(3)} max=${max.toFixed(3)} mean=${(sum/c).toFixed(3)}`);
    })('[post-refine]', polygons);
    
    // process the calculations
    markFeatures({
      diagram,
      polygons,
      rng
    });
    
    // Old labeling system removed
    
    // Old label system removed - using new feature labels
    drawCoastline({
      polygons,
      diagram,
      mapWidth,
      mapHeight,
      svg,
      islandBack,
      coastline,
      lakecoast,
      oceanLayer
    });
    
    // Ocean label placement moved to after autofit completes
    // We'll place ocean labels after autofit completes, not here

    drawPolygons({
      polygons,
      color,
      seaInput,
      blurInput,
      mapCellsLayer: mapCells,
      oceanLayer: oceanLayer,
      shallowLayer: shallow,
      circlesLayer: circles,
      svg
    });
    
    // Re-ensure label containers are on top after drawing terrain/water/coastlines
    ensureLabelContainers(svg);
    
    // Re-add smoke test label to ensure it's still visible after terrain drawing
    smokeLabel(svg);
    
    // Ensure labels are on top after all map elements are rendered
    const labelsGroup = svgSel.select('#labels');
    if (!labelsGroup.empty()) {
      labelsGroup.raise();
    }
    document.querySelectorAll('.circles').forEach(el => el.style.display = 'none');
  }

  // Wire up post-generation setup
  afterGenerate();
  
  // Expose fitLand helper after rendering completes
  window.fitLand = () => fitToLand({
    svg: svgSel,
    zoom: zoom,
    polygons,
    width: mapWidth,
    height: mapHeight,
    seaLevel: 0.2,
    preferFeatureType: true,
    margin: 0.08,
    duration: 600
  });
  
  // Expose label configuration globally
  // window.LABELS_NONSCALING = LABELS_NONSCALING; // DEPRECATED: Now using per-label transform system
  window.debugLabels = debugLabels; // Expose debug function globally

  // OPTIONAL: auto-fit after generation
  const AUTO_FIT = true;
  if (AUTO_FIT) {
    console.log('[autofit] Starting autofit to land...');
    
    // Method 1: Promise-based autofit (preferred approach)
    try {
      console.log('[autofit] 🎯 Method 1: Using Promise-based autofit...');
      
      // Use the existing fitLand function which returns a Promise
      await window.fitLand();
      console.log('[autofit] ✅ Promise-based autofit completed successfully');
      
      // Set flag to prevent re-fitting after autofit
      state.didAutofitToLand = true;
      
      // Mark zoom as locked to enable LOD filtering
      d3.select("svg").attr("data-zoom-locked", "1");
      
      // Lock zoom to prevent zooming out beyond autofit level
      lockZoomToAutofitLevel();
      
      // Now place ocean labels with the correct post-autofit bounds
      // Defer to idle when possible to avoid blocking requestAnimationFrame
      deferOceanPlacement(placeOceanLabelsAfterAutofit);
      
    } catch (error) {
      console.warn('[autofit] Method 1 failed, falling back to Method 2:', error);
      
      // Method 2: Transition event handling
      try {
        console.log('[autofit] 🔄 Method 2: Using transition event handling...');
        
        // Create a transition and set up event handlers
        const tr = svgSel.transition().duration(600);
        
        // Set up transition event handlers
        tr.on('end.placeOcean.autofit', () => deferOceanPlacement(placeOceanLabelsAfterAutofit));
        tr.on('interrupt.placeOcean.autofit', () => deferOceanPlacement(placeOceanLabelsAfterAutofit)); // safety
        
        // Start the autofit
        await window.fitLand();
        
        // Mark zoom as locked to enable LOD filtering
        d3.select("svg").attr("data-zoom-locked", "1");
        
        // Lock zoom to prevent zooming out beyond autofit level
        lockZoomToAutofitLevel();
        
      } catch (error2) {
        console.warn('[autofit] Method 2 failed, falling back to Method 3:', error2);
        
        // Method 3: Direct call with afterLayout safety
        console.log('[autofit] 🔄 Method 3: Using afterLayout fallback...');
        await window.fitLand();
        
        // Mark zoom as locked to enable LOD filtering
        d3.select("svg").attr("data-zoom-locked", "1");
        
        // Lock zoom to prevent zooming out beyond autofit level
        lockZoomToAutofitLevel();
        
        afterLayout(() => deferOceanPlacement(placeOceanLabelsAfterAutofit));
      }
    }
  }

  // Helper function to lock zoom to prevent zooming out beyond autofit level
  function lockZoomToAutofitLevel() {
    const currentZoom = d3.zoomTransform(svgSel.node());
    const autofitZoomLevel = currentZoom.k;
    // Use the shared zoom instance from interaction.js
    if (zoom) {
      // Set minimum zoom to the autofit level to prevent zooming out
      zoom.scaleExtent([autofitZoomLevel, 32]);
      console.log(`[autofit] 🔒 Locked zoom extent: [${autofitZoomLevel.toFixed(2)}, 32]`);
    }
  }

  // Check if ocean placement should be immediate (e.g., user is actively interacting)
  function shouldPlaceImmediately() {
    // Check if user is actively interacting
    const isUserInteracting = document.hasFocus() && (
      // Mouse movement in last 100ms
      (window.lastMouseMove && Date.now() - window.lastMouseMove < 100) ||
      // Touch events in last 100ms  
      (window.lastTouchEvent && Date.now() - window.lastTouchTouch < 100) ||
      // Scroll events in last 100ms
      (window.lastScrollEvent && Date.now() - window.lastScrollEvent < 100)
    );
    
    // Check if we're in a critical rendering phase
    const isCriticalPhase = window.state?.isRendering || window.state?.isGenerating;
    
    return isUserInteracting || isCriticalPhase;
  }

  // Defer ocean placement to idle time when possible to avoid blocking requestAnimationFrame
  // This improves perceived performance by:
  // - Allowing smooth animations to continue uninterrupted
  // - Reducing frame drops during autofit operations
  // - Prioritizing user interactions over background label placement
  // - Using browser idle time when available (requestIdleCallback)
  function deferOceanPlacement(callback, options = {}) {
    const { 
      immediate = false,           // Force immediate execution
      timeout = 1000,             // Idle callback timeout (ms)
      fallbackDelay = 16          // Fallback delay (ms)
    } = options;

    // Determine if immediate placement is needed
    const needsImmediate = immediate || shouldPlaceImmediately();

    // If immediate placement is required, execute now
    if (needsImmediate) {
      console.log('[ocean] Immediate placement (blocking) - user interaction or critical phase');
      callback();
      return;
    }

    // Check if requestIdleCallback is available
    if (typeof requestIdleCallback !== 'undefined') {
      // Defer to idle time with configurable timeout
      requestIdleCallback(callback, { timeout });
      console.log(`[ocean] Deferred placement to idle time (timeout: ${timeout}ms)`);
    } else {
      // Fallback for browsers without requestIdleCallback
      // Use a small delay to avoid blocking the current frame
      setTimeout(callback, fallbackDelay);
      console.log(`[ocean] Fallback: deferred placement with setTimeout (${fallbackDelay}ms)`);
        }
  }
  
  // Expose ocean placement control for debugging
  window.forceImmediateOceanPlacement = () => {
    console.log('[ocean] Forcing immediate placement (debug)');
    deferOceanPlacement(placeOceanLabelsAfterAutofit, { immediate: true });
  };

  window.forceDeferredOceanPlacement = () => {
    console.log('[ocean] Forcing deferred placement (debug)');
    deferOceanPlacement(placeOceanLabelsAfterAutofit, { timeout: 5000, fallbackDelay: 100 });
  };
  
  // Old labeling system removed
    
    console.log('[ocean] DEBUG: After autofit, featureLabels available:', {
      stored: !!window.__featureLabels,
      count: featureLabels.length,
      oceanCount: oceanLabels.length,
      sample: oceanLabels.slice(0, 2).map(l => ({ kind: l.kind, text: l.text }))
    });
    
    // --- Shared labels store (debug-friendly) ---
    // Helper (global; keep in sync with labels.js logic)
    function isOceanFeature(d) {
      return d && (d.type === 'ocean' || d.kind === 'ocean' || d.isOcean === true);
    }
    
    (function ensureLabelsStore(){
      if (!window.__labelsStoreMeta) window.__labelsStoreMeta = {};

      // Store the array used for rendering labels (ALL features)
      window.__labelsStore = Array.isArray(featureLabels) ? featureLabels : [];
      const oceanCount = window.__labelsStore.filter(isOceanFeature).length;
      window.__labelsStoreMeta.lastSet = {
        total: window.__labelsStore.length,
        ocean: oceanCount,
        nonOcean: window.__labelsStore.length - oceanCount,
      };
      console.log('[store] set __labelsStore', window.__labelsStoreMeta.lastSet);
    })();
    
    // --- Stabilize feature keys for joins ---
    (function stabilizeLabelIds(){
      const store = window.__labelsStore || [];
      const meta = window.__labelsStoreMeta || (window.__labelsStoreMeta = {});
      // Prefer existing ids; fall back to a centroid-ish fingerprint
      function labelKey(d, i) {
        return (
          d.labelId ||
          d.id || d.gid || d.uid ||
          (d.properties && (d.properties.id || d.properties.gid || d.properties.name)) ||
          // conservative fallback: type + rounded coords; good enough within a single generation
          `${d.type || d.kind || 'feat'}:${Math.round(d.x || d.cx || d.lon || 0)}:${Math.round(d.y || d.cy || d.lat || 0)}:${i}`
        );
      }
      let collision = 0;
      const seen = new Set();
      for (let i = 0; i < store.length; i++) {
        const k = labelKey(store[i], i);
        if (seen.has(k)) collision++;
        store[i].labelId = k;
        seen.add(k);
      }
      meta.keys = { total: store.length, unique: seen.size, collision };
      console.log('[store] stabilized ids', meta.keys, { sample: store.slice(0,5).map(d => d.labelId) });
    })();
    
    if (oceanLabels.length > 0) {
      console.log('[ocean] 🎯 Placing ocean labels after autofit with correct bounds');
      
      // Get the viewport bounds in screen coordinates (for SAT-based placement)
      const viewportBounds = getViewportBounds(0);
      
      console.log('[ocean] DEBUG: Viewport bounds (screen coordinates):', {
        bounds: viewportBounds,
        svgWidth: mapWidth,
        svgHeight: mapHeight
      });
      
      // Guard call order - don't run rectangle search until accessor exists
      if (typeof state.getCellAtXY !== 'function') {
        console.warn('[ocean] getCellAtXY not ready; using fallback circle-based placement.');
        
        // Fallback to circle-based placement
        for (const oceanLabel of oceanLabels) {
          const t = d3.zoomTransform(svgSel.node());
          const [x0, y0, x1, y1] = getVisibleWorldBoundsFromLabels(svgSel, mapWidth, mapHeight);
          const visibleWorld = [x0, y0, x1, y1];
          const paddedBounds = padBounds(visibleWorld, 32, t.k);
          
          // Create water test function for this ocean label
          const isWaterAt = makeIsWater((x, y) => diagram.find(x, y), 0.2);
          
          const spot = findOceanLabelSpot({
            svg: svgSel,
            getCellAtXY: (x, y) => diagram.find(x, y),
            isWaterAt: isWaterAt,
            bounds: paddedBounds,
            text: oceanLabel.text,
            baseFontSize: 28,
            minFontSize: 16,
            coastStep: 4,
            gridStep: 16,
            refinements: [8, 4, 2],
            margin: 10
          });
          
          if (spot) {
            placeOceanLabelAtSpot(oceanLabel, spot, svgSel);
            // Render ocean label in world space using the spot
            renderOceanInWorld(svgSel, oceanLabel.text);
            // Apply per-label transforms with zoom
            const oceanZoom = d3.zoomTransform(svgSel.node()).k || 1;
            updateLabelTransforms(svgSel, oceanZoom); // After ocean placement, no zoom
          } else {
            console.log(`[labels] Ocean "${oceanLabel.text}" using centroid: (${oceanLabel.y.toFixed(1)}, ${oceanLabel.y.toFixed(1)}) - no suitable spot found`);
            // Still render the ocean label even if no spot found
            renderOceanInWorld(svgSel, oceanLabel.text);
            // Apply per-label transforms with zoom
            const oceanZoom2 = d3.zoomTransform(svgSel.node()).k || 1;
            updateLabelTransforms(svgSel, oceanZoom2); // After ocean placement, no zoom
          }
        }
      } else {
        // Primary: Use SAT-based placement with post-autofit bounds
        console.log('[ocean] 🎯 Primary path: Using SAT-based ocean label placement with post-autofit bounds');
        
        // Calculate dynamic step size based on viewport dimensions
        const vw = viewportBounds[2] - viewportBounds[0];
        const vh = viewportBounds[3] - viewportBounds[1];
        const maxDim = Math.max(vw, vh);
        const step = Math.max(8, Math.min(14, Math.round(maxDim / 120)));
        
        // Use the new SAT-based rectangle finder with viewport bounds
        const pxRect = findOceanLabelRectAfterAutofit(viewportBounds, state.getCellAtXY, state.seaLevel, step, 1, 2.0, 0.6);
        
        if (pxRect) {
          console.log(`[ocean] ✅ Using SAT-based placement for ${oceanLabels.length} ocean label(s)`);
          
          // Set the world keep-in rect on the ocean label datum
          const ocean = featureLabels.find(l => l.kind === 'ocean');
          if (ocean && pxRect?.keepWithinRect) {
            ocean.keepWithinRect = pxRect.keepWithinRect;  // WORLD rect
            // center seed stays the center of the chosen world rect
            ocean.x = ocean.keepWithinRect.x + ocean.keepWithinRect.w / 2;
            ocean.y = ocean.keepWithinRect.y + ocean.keepWithinRect.h / 2;
            
            // Ocean text fitting now handled in renderLabels via fitTextToRect
            // Just ensure the label stays within bounds
            clampToKeepRect(ocean);
            
            // Ocean text fitting now handled in renderLabels via fitTextToRect
            // No need for post-fit nudge since fitTextToRect handles positioning
          }

          // Re-apply LOD now that zoom is locked and oceans are placed
          {
            const svg = d3.select('svg');
            const k = d3.zoomTransform(svg.node()).k;
            const visible = filterByZoom(featureLabels, k);
            updateLabelVisibilityWithOptions({ placed: featureLabels, visible });
          }

          // Draw debug rectangle
          if (LABEL_DEBUG) drawDebugOceanRect(pxRect);
          
          // Set up areas layer for non-ocean labels
          const gAll = svgSel.select('#labels-world-areas');    // islands + lakes (areas layer)
          
                      // Place ocean label in world space using the SAT rectangle
            if (ocean && pxRect) {
              renderOceanInWorld(svgSel, ocean.text);
              
              // Apply per-label transforms with zoom
              const satZoom = d3.zoomTransform(svgSel.node()).k || 1;
              updateLabelTransforms(svgSel, satZoom); // After ocean placement, no zoom
            
            // Apply font caps after ocean label is placed (now we can read its size)
            applyFontCaps();
          }
          
          // Guard: if ocean label was placed successfully (has keepWithinRect)
          // skip re-running global culls to avoid nuking island/lake labels.
          const okOcean = ocean && ocean.keepWithinRect;
          if (!okOcean) {
            // Now run the normal label system to place all labels including oceans
            console.log('[ocean] 🎯 Running normal label system with ocean constraints...');
            
            // Ensure metrics are computed for the updated ocean labels
            ensureMetrics(featureLabels, svgSel);
            
            // Run collision avoidance (now includes oceans with keepWithinRect)
            const placedFeatures = timeit('SA collision avoidance', () => placeLabelsAvoidingCollisions({ svg: svgSel, labels: featureLabels }));
            
            // Apply LOD filtering after autofit + ocean placement (single pass)
            const t = d3.zoomTransform(svgSel.node());
            const selected = filterByZoom(placedFeatures, t.k);
            
            // Render world layer (oceans + lakes + islands) and overlay layer (HUD/debug only)
            console.debug('[LOD] non-ocean selected:', selected.length, 'of', placedFeatures.length);
            renderWorldLabels(svgSel, selected);
            renderOverlayLabels(svgSel, selected);
            

            
            // Apply per-label transforms with zoom
            const saZoom = d3.zoomTransform(svgSel.node()).k || 1;
            updateLabelTransforms(svgSel, saZoom); // After SA placement, no zoom
            
            // Debug logging after SA placement render
            if (LABEL_DEBUG) {
              const g = gAll.selectAll('g.label');
              logProbe('post-SA-render', g);
            }
            
            // Store updated labels (with LOD filtering applied)
            window.__labelsPlaced = { features: selected };
          } else {
            console.log('[labels] ok==true; skipping global re-cull BUT re-rendering non-ocean labels');
            






            // ---- Instrumented re-render for NON-ocean labels
            (function instrumentedNonOceanRerender() {

              // DOM snapshot BEFORE join
              const domBefore = {
                worldGroups: d3.select('#labels-world').selectAll('g').size(),
                oceanGroups: d3.select('#labels-world').selectAll('g.label--ocean').size(),
                areaGuess: d3.select('#labels-world-areas').selectAll('g.label').size()
              };

              // Source sanity: compare old vs new
              console.log('[non-ocean] source sanity', {
                fromWindowFeature: (window.featureLabels || []).length,
                fromStore: (window.__labelsStore || []).length
              });

              // Use the unified store
              const nonOceans = (window.__labelsStore || []).filter(f => !isOceanFeature(f));

              // If it's empty, bail early to avoid turning everything into exits
              if (!nonOceans.length) {
                console.warn('[non-ocean] EMPTY DATA — skipping join to prevent accidental deletions');
                return;
              }

              console.log('[non-ocean] data before join', {
                totalFeatures: (window.__labelsStore || []).length,
                nonOceans: nonOceans.length,
                domBefore
              });

              // Work only inside the non-ocean container
              let labelsWorld = d3.select('#labels-world-areas');
              if (labelsWorld.empty()) {
                console.warn('[non-ocean] #labels-world-areas not found; falling back to #labels-world');
                labelsWorld = d3.select('#labels-world'); // last resort
              }

              const keyFn = d => d.labelId;

              // JOIN (scoped to the correct parent)
              const sel = labelsWorld
                .selectAll('.label--area, .label--river, .label--lake, .label--island')
                .data(nonOceans, keyFn);

              // EXIT
              const exitSel = sel.exit();
              console.log('[non-ocean] exiting count', exitSel.size());
              exitSel.each(d => console.log('[non-ocean] removing node', d && d.labelId, d && d.type))
                     .remove();

              // ENTER
              const enterSel = sel.enter();
              console.log('[non-ocean] enter count', enterSel.size());

              // Simple append to the non-ocean container (z-order handled by container hierarchy)
              const enterG = enterSel.append('g')
                .attr('class', d => {
                  // keep your existing class logic here
                  // e.g., return `label ${d.kindClass} ${d.tierClass} label--${d.type}`;
                  return d.class || 'label non-ocean';
                });

              // Basic text creation for entered labels
              enterG.append('text')
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'middle')
                .style('font-size', '14px')
                .style('font-family', 'serif')
                .text(d => d.text || d.name || 'Label');

              // UPDATE + MERGE
              const merged = enterG.merge(sel);

              // (Optional) if you rely on z-order after update, you can re-assert it safely:
              // merged.each(function() { this.parentNode && this.parentNode.appendChild(this); }); // bring to front
              // or merged.lower(); // send behind (D3 adds .lower in v5)

              // Post-join integrity logs
              const domAfter = {
                worldGroups: d3.select('#world').selectAll(':scope > g').size(),
                oceanGroups: d3.selectAll('#labels-world-ocean .ocean-label').size(),
                nonOceanGroups: d3.selectAll('#labels-world-areas .label').size(),
              };
              console.log('[non-ocean] after merge size', merged.size());
              console.log('[non-ocean] DOM after cleanup', domAfter);

              // Also log the join delta with keys for clarity
              console.log('[non-ocean] join delta (keys)', {
                entered: enterSel.size(),
                updated: merged.size() - enterSel.size(),
                exiting: 0 // we removed them above
              });

              // Explicit z-order (optional, but removes any doubt)
              // After your non-ocean join, adjust stacking once, not per label:
              svg.select('#labels-world-areas').raise(); // put areas above
              svg.select('#labels-world-ocean').lower(); // keep ocean below
              // (Flip these if you want oceans on top.)


            })();
            
            // Ocean labels are already placed, but we still need to render lakes/islands
            // No need to re-run LOD filtering or collision avoidance, but we must render world labels
          }

          // NEW: unconditionally render/update lakes + islands on the world layer.
          // Apply LOD filtering for the re-render case
          const t = d3.zoomTransform(svgSel.node());
          const selected = filterByZoom(featureLabels, t.k);
          console.debug('[LOD] re-render selected:', selected.length, 'of', featureLabels.length);
          renderWorldLabels(svgSel, selected);
          
          // Apply per-label transforms with zoom
          const reRenderZoom = d3.zoomTransform(svgSel.node()).k || 1;
          updateLabelTransforms(svgSel, reRenderZoom); // After re-render, no zoom
          
        } else {
          console.warn('[ocean] ❌ No suitable SAT rectangle found; ocean labels will use default placement.');
          
          // Set up areas layer for non-ocean labels
          const gAll = svgSel.select('#labels-world-areas');    // islands + lakes (areas layer)
          
          // Run normal label system without ocean constraints
          console.log('[ocean] 🔄 Running normal label system without ocean constraints...');
          
          // Ensure metrics are computed
          ensureMetrics(featureLabels, svgSel);
          
          // Run collision avoidance
          const placedFeatures = timeit('SA collision avoidance', () => placeLabelsAvoidingCollisions({ svg: svgSel, labels: featureLabels }));
          
          // Apply LOD filtering after autofit + ocean placement (single pass)
          const t = d3.zoomTransform(svgSel.node());
          const selected = filterByZoom(placedFeatures, t.k);
          
          // Render world layer (oceans + lakes + islands) and overlay layer (HUD/debug only)
          console.debug('[LOD] non-ocean selected:', selected.length, 'of', placedFeatures.length);
          renderWorldLabels(svgSel, selected);
          renderOverlayLabels(svgSel, selected);
          

          
          // Apply per-label transforms with zoom
          const saPlacementZoom = d3.zoomTransform(svgSel.node()).k || 1;
          updateLabelTransforms(svgSel, saPlacementZoom); // After SA placement, no zoom
          
          // Debug logging after SA placement render
          if (LABEL_DEBUG) {
            const g = gAll.selectAll('g.label');
            logProbe('post-SA-render', g);
          }
          
          // Store updated labels (with LOD filtering applied)
          window.__labelsPlaced = { features: selected };
        }
      }
    }
  }

  // Clamp and normalize height values for self-tests (safe at top-level)
  {
    const P = window.currentPolygons;
    if (Array.isArray(P) && P.length) {
      const heightArray = P.map(p => p.height ?? 0);
      clamp01(heightArray);
      P.forEach((p, i) => { p.height = heightArray[i]; });

      // Add timing and self-tests
      timers.lap('generate', 'Generate() – total');
      const cache = { graph: { cells: P }, height: P.map(p => p.height ?? 0), rivers: [] };
      const results = runSelfTests(cache, { svg: d3.select('svg').node() });
      renderSelfTestBadge(results);

      console.group('Urban Train - Generation Complete');
      console.table(timers.summary());
      console.groupEnd();
    } else {
      console.warn('[guard] polygons missing; skipping self-test block');
    }
  }

  // Old labeling system removed

  // redraw all polygons on SeaInput change 
  document.getElementById("seaInput").addEventListener("change", function() {
    // Ocean labels now handled by normal label system - no need to clear screen labels
    
    drawPolygons({
      polygons,
      color,
      seaInput,
      blurInput,
      mapCellsLayer: mapCells,
      oceanLayer: oceanLayer,
      shallowLayer: shallow,
      circlesLayer: circles,
      svg
    });
  });

  // Draw of remove blur polygons on intup change
  document.getElementById("blurInput").addEventListener("change", function() {
    toggleBlur({
      polygons,
      color,
      seaInput,
      blurInput,
      mapCellsLayer: mapCells
    });
  });



  // Draw of remove blur polygons on intup change
  document.getElementById("strokesInput").addEventListener("change", function() {
    toggleStrokes();
  });





// Old labeling system removed

// Generate a completely new random map with a fresh seed
function generateRandomMap(count = 5) {
  // Generate a new random seed
  state.seed = Math.floor(Math.random() * 1000000);
  
  // Generate new map with the new seed
  generate(count);
}

// Toggle options panel visibility
function toggleOptions() {
  var optionsPanel = document.getElementById('options');
  if (optionsPanel.hidden) {
    optionsPanel.hidden = false;
  } else {
    optionsPanel.hidden = true;
  }
}

// Toggle blob centers visibility
function toggleBlobCenters() {
  document.querySelectorAll('.circles').forEach(el => {
    el.style.display = el.style.display === 'none' ? '' : 'none';
  });
}

// Toggle label scaling mode - DISABLED: Now using per-label transforms
function toggleLabelScaling() {
  if (window.DEBUG) {
    console.log('Label scaling toggle disabled - now using per-label transform system');
    console.log('Labels automatically maintain constant size with proper anchoring');
  }
}

// Change polygons stroke-width,
// in case of low width svg background will be shined through 
function toggleStrokes() {
  if (strokesInput.checked == true) {
    var limit = 0.2;
    if (seaInput.checked == true) {
      limit = 0;
    }
    // Get the current mapCells layer
    var mapCells = d3.select(".mapCells");
    if (!mapCells.empty()) {
      // Get all polygons from the current state
      var polygons = window.currentPolygons || [];
      polygons.forEach(function(i) {
        if (i.height >= limit) {
          mapCells.append("path")
            .attr("d", "M" + i.join("L") + "Z")
            .attr("class", "mapStroke")
            .attr("stroke", "grey");
        }
      });
    }
  } else {
    d3.selectAll(".mapStroke").remove();
  }
}

// Make functions available globally for HTML onclick handlers
window.generate = generate;
window.generateRandomMap = generateRandomMap;
window.toggleOptions = toggleOptions;
window.toggleBlobCenters = toggleBlobCenters;
window.toggleStrokes = toggleStrokes;
window.toggleLabelScaling = toggleLabelScaling; // Expose label scaling toggle

window.state = state; // Make state accessible globally
window.rng = rng; // Make RNG accessible globally for debugging
window.Perf = Perf; // Make profiler accessible globally
window.buildPickingIndex = buildPickingIndex; // Make spatial picking functions accessible
window.pickCellAt = pickCellAt; // Make spatial picking functions accessible
window.updateCellsRaster = updateCellsRaster; // Make raster functions accessible
window.updateCellsLOD = updateCellsLOD; // Make LOD functions accessible
window.afterGenerate = afterGenerate; // Make afterGenerate function accessible

// Test functions for the new naming system
window.testNames = function() {
  console.group('🧙‍♂️ Fantasy Names Test');
  
  // Create a test namer
  const testRng = () => Math.random(); // Use Math.random for testing
  const namer = makeNamer(testRng);
  
  console.log('Ocean names:');
  for (let i = 0; i < 5; i++) {
    console.log(`  ${i+1}. ${namer.ocean()}`);
  }
  
  console.log('\nLake names:');
  for (let i = 0; i < 5; i++) {
    console.log(`  ${i+1}. ${namer.lake()}`);
  }
  
  console.log('\nIsland names:');
  for (let i = 0; i < 5; i++) {
    console.log(`  ${i+1}. ${namer.island()}`);
  }
  
  console.groupEnd();
};

window.testFlavorPacks = function() {
  console.group('🎭 New Naming System Test');
  
  const testRng = () => Math.random();
  const namer = makeNamer(testRng);
  
  console.log('Ocean names (with size variations):');
  for (let i = 0; i < 3; i++) {
    console.log(`  Small: ${namer.ocean(0.2)}`);
    console.log(`  Medium: ${namer.ocean(0.5)}`);
    console.log(`  Large: ${namer.ocean(0.8)}`);
  }
  
  console.log('\nLake names (with size variations):');
  for (let i = 0; i < 3; i++) {
    console.log(`  Small: ${namer.lake(0.1)}`);
    console.log(`  Medium: ${namer.lake(0.3)}`);
    console.log(`  Large: ${namer.lake(0.6)}`);
  }
  
  console.log('\nIsland names (with cluster size variations):');
  for (let i = 0; i < 3; i++) {
    console.log(`  Single: ${namer.island(1)}`);
    console.log(`  Cluster: ${namer.island(3)}`);
    console.log(`  Archipelago: ${namer.island(8)}`);
  }
  
  console.groupEnd();
};

// === Performance Isolation Toggles ==========================================
// Quick toggles for binary search performance debugging
window.toggleHUD = () => {
  const hud = d3.select('#perfHUD');
  if (hud.style('display') === 'none') {
    hud.style('display', 'block');
    console.log('HUD: ON');
  } else {
    hud.style('display', 'none');
    console.log('HUD: OFF (should jump FPS)');
  }
};

window.toggleLabels = () => {
  const labels = d3.select('#labels');
  if (labels.style('display') === 'none') {
    labels.style('display', 'block');
    console.log('Labels: ON');
  } else {
    labels.style('display', 'none');
    console.log('Labels: OFF');
  }
};

window.toggleMapCells = () => {
  const mapCells = d3.select('.mapCells');
  if (mapCells.style('display') === 'none') {
    mapCells.style('display', 'block');
    console.log('Map Cells: ON');
  } else {
    mapCells.style('display', 'none');
    console.log('Map Cells: OFF (water/roads off)');
  }
};

window.toggleCoastline = () => {
  const coastline = d3.select('.coastline');
  if (coastline.style('display') === 'none') {
    coastline.style('display', 'block');
    console.log('Coastline: ON');
  } else {
    coastline.style('display', 'none');
    console.log('Coastline: OFF');
  }
};

window.toggleOcean = () => {
  const ocean = d3.select('.oceanLayer');
  if (ocean.style('display') === 'none') {
    ocean.style('display', 'block');
    console.log('Ocean: ON');
  } else {
    ocean.style('display', 'none');
    console.log('Ocean: OFF');
  }
};

window.toggleShallow = () => {
  const shallow = d3.select('.shallow');
  if (shallow.style('display') === 'none') {
    shallow.style('display', 'block');
    console.log('Shallow: ON');
  } else {
    shallow.style('display', 'none');
    console.log('Shallow: OFF');
  }
};

window.toggleLakeCoast = () => {
  const lakecoast = d3.select('.lakecoast');
  if (lakecoast.style('display') === 'none') {
    lakecoast.style('display', 'block');
    console.log('Lake Coast: ON');
  } else {
    lakecoast.style('display', 'none');
    console.log('Lake Coast: OFF');
  }
};

window.toggleIslandBack = () => {
  const islandBack = d3.select('.islandBack');
  if (islandBack.style('display') === 'none') {
    islandBack.style('display', 'block');
    console.log('Island Back: ON');
  } else {
    islandBack.style('display', 'none');
    console.log('Island Back: OFF');
  }
};

// Disable hover completely (early return)
window.toggleHover = () => {
  if (window.hoverDisabled) {
    window.hoverDisabled = false;
    console.log('Hover: ON');
  } else {
    window.hoverDisabled = true;
    console.log('Hover: OFF (should jump FPS)');
  }
};

// Reset all toggles to visible
window.resetToggles = () => {
  d3.selectAll('#world > g').style('display', 'block');
  d3.select('#perfHUD').style('display', 'block');
  d3.select('#labels').style('display', 'block');
  window.hoverDisabled = false;
  console.log('All layers: RESET to visible');
};

// Log current toggle states
window.logToggles = () => {
  console.group('Current Toggle States:');
  console.log('HUD:', d3.select('#perfHUD').style('display') !== 'none' ? 'ON' : 'OFF');
  console.log('Labels:', d3.select('#labels').style('display') !== 'none' ? 'ON' : 'OFF');
  console.log('Map Cells:', d3.select('.mapCells').style('display') !== 'none' ? 'ON' : 'OFF');
  console.log('Coastline:', d3.select('.coastline').style('display') !== 'none' ? 'ON' : 'OFF');
  console.log('Ocean:', d3.select('.oceanLayer').style('display') !== 'none' ? 'ON' : 'OFF');
  console.log('Shallow:', d3.select('.shallow').style('display') !== 'none' ? 'ON' : 'OFF');
  console.log('Lake Coast:', d3.select('.lakecoast').style('display') !== 'none' ? 'ON' : 'OFF');
  console.log('Island Back:', d3.select('.islandBack').style('display') !== 'none' ? 'ON' : 'OFF');
  console.log('Hover:', window.hoverDisabled ? 'OFF' : 'ON');
  console.groupEnd();
};

// === Advanced Performance Diagnostics ==========================================
// Quick DevTools toggles for pinpointing bottlenecks

// A) Disable hit-testing on cells (event overhead probe)
window.toggleCellHitTesting = () => {
  const cells = d3.select('.mapCells');
  if (cells.style('pointer-events') === 'none') {
    cells.style('pointer-events', null);
    console.log('Cell hit-testing: ON');
  } else {
    cells.style('pointer-events', 'none');
    console.log('Cell hit-testing: OFF (if this helps → event overhead)');
  }
};

// B) Remove strokes (paint cost probe)
window.toggleCellStrokes = () => {
  const paths = d3.selectAll('.mapCells path, .mapCells polygon');
  if (window.strokesHidden) {
    // Restore strokes
    paths.each(function() {
      if (this.__oldStroke != null) {
        this.setAttribute('stroke', this.__oldStroke);
      }
    });
    window.strokesHidden = false;
    console.log('Cell strokes: RESTORED');
  } else {
    // Hide strokes
    paths.each(function() {
      this.__oldStroke = this.__oldStroke || this.getAttribute('stroke');
      this.setAttribute('stroke', 'none');
    });
    window.strokesHidden = true;
    console.log('Cell strokes: HIDDEN (if this helps → stroke painting cost)');
  }
};

// C) Show only every Nth cell (node-count probe)
window.toggleCellLOD = (N = 5) => {
  const paths = d3.selectAll('.mapCells path, .mapCells polygon');
  if (window.cellLODEnabled) {
    // Restore all cells
    paths.style('display', null);
    window.cellLODEnabled = false;
    console.log(`Cell LOD: DISABLED (showing all cells)`);
  } else {
    // Show only every Nth cell
    paths.style('display', (d, i) => (i % N ? 'none' : null));
    window.cellLODEnabled = true;
    console.log(`Cell LOD: ENABLED (showing every ${N}th cell)`);
  }
};

// D) Count nodes (diagnostic info)
window.countNodes = () => {
  const counts = {
    cells: d3.select('.mapCells').selectAll('path,polygon').size(),
    labels: d3.select('#labels').selectAll('text').size(),
    total: 0
  };
  counts.total = counts.cells + counts.labels;
  
  console.group('Node Counts:');
  console.table(counts);
  console.log(`Total DOM nodes: ${counts.total}`);
  console.groupEnd();
  
  return counts;
};

// Quick performance test suite
window.runPerfTests = () => {
  console.group('Performance Test Suite');
  
  // Count nodes first
  const counts = window.countNodes();
  
  // Test each toggle and report
  console.log('\n=== Testing Cell Hit-Testing ===');
  window.toggleCellHitTesting();
  console.log('→ If FPS jumps significantly, event overhead is the issue');
  
  console.log('\n=== Testing Cell Strokes ===');
  window.toggleCellStrokes();
  console.log('→ If FPS jumps significantly, stroke painting is expensive');
  
  console.log('\n=== Testing Cell LOD (every 5th) ===');
  window.toggleCellLOD(5);
  console.log('→ If FPS jumps proportionally, DOM size is the culprit');
  
  console.log('\n=== Recommendations ===');
  if (counts.cells > 1000) {
    console.log('⚠️  High cell count detected. Consider LOD or culling.');
  }
  if (counts.total > 2000) {
    console.log('⚠️  High total node count. Consider virtualization.');
  }
  
  console.groupEnd();
};
