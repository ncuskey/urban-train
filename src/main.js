import { RNG } from "./core/rng.js";
import { Timers } from "./core/timers.js";
import { ensureLayers, ensureLabelSubgroups } from "./render/layers.js";
import { runSelfTests, renderSelfTestBadge, clamp01, ensureReciprocalNeighbors } from "./selftest.js";
import { poissonDiscSampler, buildVoronoi, detectNeighbors } from "./modules/geometry.js";
import { randomMap } from "./modules/heightmap.js";
import { markFeatures } from "./modules/features.js";
import { makeNamer } from "./modules/names.js";
import { drawCoastline } from "./modules/coastline.js";
import { drawPolygons, toggleBlur } from "./modules/rendering.js";
import { attachInteraction } from "./modules/interaction.js";
import { fitToLand } from './modules/autofit.js';
import { refineCoastlineAndRebuild } from "./modules/refine.js";
import { buildFeatureLabels, placeLabelsAvoidingCollisions, renderLabels, filterByZoom, updateLabelVisibility, debugLabels } from "./modules/labels.js";

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
  seed: Math.floor(Math.random() * 1000000) // Random seed for initial generation
};

// Spatial picking system (no DOM hit-testing)
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

console.group('Urban Train - Initial Generation');
console.time('generate');
generate(5); // Generate a random map with 5 features on initial load
console.timeEnd('generate');
console.groupEnd();

// general function; run onload of to start from scratch
function generate(count) {
  timers.clear();
  timers.mark('generate');

  // make RNG deterministic for this generation
  rng.reseed(state.seed);
  
  // Clear any existing labels from previous generation
  const existingLabels = d3.select('#labels');
  if (!existingLabels.empty()) {
    existingLabels.selectAll('*').remove();
  }

  var svg = d3.select("svg"),
    mapWidth = +svg.attr("width"),
    mapHeight = +svg.attr("height"),
    defs = svg.select("defs");
    
  // Ensure proper layer structure
  const layers = ensureLayers(svg);
  ensureLabelSubgroups(svg);
  
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
  // Poisson-disc sampling from https://bl.ocks.org/mbostock/99049112373e12709381
  const sampler = poissonDiscSampler(mapWidth, mapHeight, sizeInput.valueAsNumber, rng);
  let samples = [];
  for (let s; (s = sampler()); ) samples.push(s);
  // Voronoi D3
  let { diagram, polygons } = buildVoronoi(samples, mapWidth, mapHeight);
  
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
    
    // Build & place feature labels - no minimum size for lakes/islands
    const featureLabels = buildFeatureLabels({
      polygons,
      mapWidth,
      mapHeight,
      minLakeArea: 0,      // no minimum - even smallest lakes get names
      minIslandArea: 0,    // no minimum - even smallest islands get names
      maxLakes: 500,
      maxIslands: 800,
      namePickers: makeNamer(rng) // or whatever you already use
    });

    console.log('[labels] DEBUG: Built feature labels:', {
      total: featureLabels.length,
      oceans: featureLabels.filter(l=>l.kind==='ocean').length,
      lakes: featureLabels.filter(l=>l.kind==='lake').length,
      islands: featureLabels.filter(l=>l.kind==='island').length,
      sample: featureLabels.slice(0, 3).map(l => ({ kind: l.kind, text: l.text, area: l.area }))
    });

    const placedFeatures = placeLabelsAvoidingCollisions({ svg: svgSel, labels: featureLabels });
    
    console.log('[labels] DEBUG: After collision avoidance:', {
      placed: placedFeatures.length,
      sample: placedFeatures.slice(0, 3).map(l => ({ kind: l.kind, text: l.text, area: l.area }))
    });

    renderLabels({ svg: svgSel, placed: placedFeatures, groupId: 'labels-features', k: 1 });

    // stash for zoom visibility updates
    window.__labelsPlaced = { features: placedFeatures };

    // Apply initial visibility filter
    const k0 = (d3.zoomTransform(svgSel.node()).k || 1);
    updateLabelVisibility({
      svg: svgSel,
      groupId: 'labels-features',
      placed: window.__labelsPlaced.features,
      k: k0,
      filterByZoom
    });

    console.log('[labels] after build:', {
      built: featureLabels.length, placed: placedFeatures.length
    });

    // Quick sanity log
    console.log(`[labels] oceans=${featureLabels.filter(l=>l.kind==='ocean').length}, lakes=${featureLabels.filter(l=>l.kind==='lake').length}, islands=${featureLabels.filter(l=>l.kind==='island').length}, placed=${placedFeatures.length}`);
    
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
    
    // Ensure labels are on top after all map elements are rendered
    const labelsGroup = svgSel.select('#labels');
    if (!labelsGroup.empty()) {
      labelsGroup.raise();
    }
    $('.circles').hide();
  }

  // Wire up post-generation setup
  afterGenerate();
  
  // Expose fitLand helper after rendering completes
  window.fitLand = () => fitToLand({
    svg: svgSel,
    zoom: interact.zoom,
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
  if (AUTO_FIT) window.fitLand();



  // Clamp and normalize height values for self-tests
  const heightArray = polygons.map(p => p.height);
  clamp01(heightArray);
  polygons.forEach((p, i) => { p.height = heightArray[i]; });

  // Add timing and self-tests at the end of generation
  timers.lap('generate', 'Generate() – total');
  
  // Create cache object for self-tests
  const cache = {
    graph: { cells: polygons },
    height: polygons.map(p => p.height),
    rivers: [] // No rivers data yet
  };
  
  const results = runSelfTests(cache, { svg: svg.node() });
  renderSelfTestBadge(results);
  
  // Log timing summary
  console.group('Urban Train - Generation Complete');
  console.table(timers.summary());
  console.groupEnd();

  // redraw all polygons on SeaInput change 
  $("#seaInput").change(function() {
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
  $("#blurInput").change(function() {
    toggleBlur({
      polygons,
      color,
      seaInput,
      blurInput,
      mapCellsLayer: mapCells
    });
  });



  // Draw of remove blur polygons on intup change
  $("#strokesInput").change(function() {
    toggleStrokes();
  });



}



// Compute map labels with proper deduplication and positioning
function computeMapLabels(polygons) {
  const labels = [];
  const seenFeatures = new Map(); // Track seen features by type + name to prevent duplicates

  // Group polygons by feature type and name
  const featureGroups = new Map();
  
  polygons.forEach((poly, index) => {
    if (!poly.featureType || !poly.featureName) return;
    
    const key = `${poly.featureType}:${poly.featureName}`;
    if (!featureGroups.has(key)) {
      featureGroups.set(key, []);
    }
    featureGroups.get(key).push({ poly, index });
  });

  // Process each feature group
  featureGroups.forEach((group, key) => {
    if (group.length === 0) return;
    
    const firstPoly = group[0].poly;
    const featureType = firstPoly.featureType;
    const featureName = firstPoly.featureName;
    
    // Calculate centroid for the feature group
    let totalX = 0, totalY = 0, count = 0;
    
    group.forEach(({ poly }) => {
      if (poly && poly.length > 0) {
        // Use polygon centroid (average of all vertices)
        poly.forEach(vertex => {
          if (vertex && vertex.length >= 2) {
            totalX += vertex[0];
            totalY += vertex[1];
            count++;
          }
        });
      }
    });
    
    if (count > 0) {
      const x = totalX / count;
      const y = totalY / count;
      
      // Create unique ID based on feature type and name
      const id = `${featureType.toLowerCase()}:${featureName.replace(/\s+/g, '-')}`;
      
      labels.push({
        id,
        name: featureName, // The generator already includes the type if appropriate
        x,
        y,
        kind: featureType.toLowerCase(),
        featureType,
        featureName
      });
    }
  });

  return labels;
}

// Draw labels in world coordinates - scaling/positioning handled in zoom handler
function drawLabels(data) {
  const gLabels = d3.select('#labels');
  if (gLabels.empty()) return;
  
  // Clear existing place labels to prevent accumulation (but keep feature labels)
  gLabels.selectAll('text.place-label').remove();
  
  const sel = gLabels.selectAll('text.place-label')
    .data(data, d => d.id);

  const enter = sel.enter().append('text')
    .attr('class', d => `place-label ${d.kind}`)
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .attr('font-size', 12)
    .text(d => d.name);

  enter.merge(sel)
    .attr('x', d => d.x)   // world coords
    .attr('y', d => d.y);  // world coords

  sel.exit().remove();
}

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
  $('.circles').toggle();
}

// Toggle label scaling mode - DISABLED: Now using per-label transforms
function toggleLabelScaling() {
  console.log('Label scaling toggle disabled - now using per-label transform system');
  console.log('Labels automatically maintain constant size with proper anchoring');
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
window.drawLabels = drawLabels; // Expose label drawing function
window.computeMapLabels = computeMapLabels; // Expose label computation function
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
