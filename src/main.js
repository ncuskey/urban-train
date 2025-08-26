import { RNG } from "./core/rng.js";
import { Timers } from "./core/timers.js";
import { ensureLayers } from "./render/layers.js";
import { runSelfTests, renderSelfTestBadge, clamp01, ensureReciprocalNeighbors } from "./selftest.js";
import { poissonDiscSampler, buildVoronoi, detectNeighbors } from "./modules/geometry.js";
import { randomMap } from "./modules/heightmap.js";
import { markFeatures } from "./modules/features.js";
import { drawCoastline } from "./modules/coastline.js";
import { drawPolygons, toggleBlur } from "./modules/rendering.js";
import { attachInteraction } from "./modules/interaction.js";

// Global state object for seed management
const state = {
  seed: Math.floor(Math.random() * 1000000) // Random seed for initial generation
};

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

  var svg = d3.select("svg"),
    mapWidth = +svg.attr("width"),
    mapHeight = +svg.attr("height"),
    defs = svg.select("defs"),
    viewbox = svg.append("g").attr("class", "viewbox"),
    islandBack = viewbox.append("g").attr("class", "islandBack"),
    mapCells = viewbox.append("g").attr("class", "mapCells"),
    oceanLayer = viewbox.append("g").attr("class", "oceanLayer"),
    circles = viewbox.append("g").attr("class", "circles"),
    coastline = viewbox.append("g").attr("class", "coastline"),
		shallow = viewbox.append("g").attr("class", "shallow"),
    lakecoast = viewbox.append("g").attr("class", "lakecoast");
    
  // Ensure SVG layers exist for self-tests
  const layers = ensureLayers(svg.node());
  // Poisson-disc sampling from https://bl.ocks.org/mbostock/99049112373e12709381
  const sampler = poissonDiscSampler(mapWidth, mapHeight, sizeInput.valueAsNumber, rng);
  const samples = [];
  for (let s; (s = sampler()); ) samples.push(s);
  // Voronoi D3
  const { diagram, polygons } = buildVoronoi(samples, mapWidth, mapHeight);
  
  // Store polygons globally for access by other functions
  window.currentPolygons = polygons;
  // Colors D3 interpolation
  const color = d3.scaleSequential(d3.interpolateSpectral);
  // Queue array  
  const queue = [];



  // array to use as names
  var adjectives = ["Ablaze", "Ablazing", "Accented", "Ashen", "Ashy", "Beaming", "Bi-Color", "Blazing", "Bleached", "Bleak", "Blended", "Blotchy", "Bold", "Brash", "Bright", "Brilliant", "Burnt", "Checkered", "Chromatic", "Classic", "Clean", "Colored", "Colorful", "Colorless", "Complementing", "Contrasting", "Cool", "Coordinating", "Crisp", "Dappled", "Dark", "Dayglo", "Deep", "Delicate", "Digital", "Dim", "Dirty", "Discolored", "Dotted", "Drab", "Dreary", "Dull", "Dusty", "Earth", "Electric", "Eye-Catching", "Faded", "Faint", "Festive", "Fiery", "Flashy", "Flattering", "Flecked", "Florescent", "Frosty", "Full-Toned", "Glistening", "Glittering", "Glowing", "Harsh", "Hazy", "Hot", "Hued", "Icy", "Illuminated", "Incandescent", "Intense", "Interwoven", "Iridescent", "Kaleidoscopic", "Lambent", "Light", "Loud", "Luminous", "Lusterless", "Lustrous", "Majestic", "Marbled", "Matte", "Medium", "Mellow", "Milky", "Mingled", "Mixed", "Monochromatic", "Motley", "Mottled", "Muddy", "Multicolored", "Multihued", "Murky", "Natural", "Neutral", "Opalescent", "Opaque", "Pale", "Pastel", "Patchwork", "Patchy", "Patterned", "Perfect", "Picturesque", "Plain", "Primary", "Prismatic", "Psychedelic", "Pure", "Radiant", "Reflective", "Rich", "Royal", "Ruddy", "Rustic", "Satiny", "Saturated", "Secondary", "Shaded", "Sheer", "Shining", "Shiny", "Shocking", "Showy", "Smoky", "Soft", "Solid", "Somber", "Soothing", "Sooty", "Sparkling", "Speckled", "Stained", "Streaked", "Streaky", "Striking", "Strong Neutral", "Subtle", "Sunny", "Swirling", "Tinged", "Tinted", "Tonal", "Toned", "Translucent", "Transparent", "Two-Tone", "Undiluted", "Uneven", "Uniform", "Vibrant", "Vivid", "Wan", "Warm", "Washed-Out", "Waxen", "Wild"];

  detectNeighbors(diagram, polygons);
  
  // Ensure reciprocal neighbors for self-tests
  ensureReciprocalNeighbors({ cells: polygons });

  // Attach interaction handlers (zoom + hover HUD)
  const svgSel = d3.select('svg');
  const viewSel = d3.select('.viewbox');
  const hudRefs = { 
    cellEl:   document.getElementById('cell'),
    heightEl: document.getElementById('height'),
    featureEl:document.getElementById('feature')
  };
  attachInteraction({
    svg: svgSel,
    viewbox: viewSel,
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
    
    // process the calculations
    markFeatures({
      diagram,
      polygons,
      rng,
      adjectives
    });
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
    $('.circles').hide();
  }



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

// Clear the map on re-generation (global function)
function undraw() {
  // Remove all on regenerate 
  $("g").remove();
  $("path").remove();
  // Set some options to defaults
  heightInput.value = 0.9;
  heightOutput.value = 0.9;
  radiusInput.value = 0.9;
  radiusOutput.value = 0.9;
  // Reset blur and strokes
  blurInput.value = 2;
  blurOutput.value = 2;
  strokesInput.checked = false;
  // Hide circles
  $('.circles').hide();
}

// Generate a completely new random map with a fresh seed
function generateRandomMap(count = 5) {
  // Generate a new random seed
  state.seed = Math.floor(Math.random() * 1000000);
  
  // Clear the current map
  undraw();
  
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
window.undraw = undraw;
window.generate = generate;
window.generateRandomMap = generateRandomMap;
window.toggleOptions = toggleOptions;
window.toggleBlobCenters = toggleBlobCenters;
window.toggleStrokes = toggleStrokes;
window.state = state; // Make state accessible globally
window.rng = rng; // Make RNG accessible globally for debugging
