import { RNG } from "./core/rng.js";
import { Timers } from "./core/timers.js";
import { ensureLayers } from "./render/layers.js";
import { runSelfTests, renderSelfTestBadge, clamp01, ensureReciprocalNeighbors } from "./selftest.js";
import { poissonDiscSampler, buildVoronoi, detectNeighbors } from "./modules/geometry.js";
import { randomMap } from "./modules/heightmap.js";
import { markFeatures } from "./modules/features.js";
import { drawCoastline } from "./modules/coastline.js";

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

  // Add general elements with passive event listeners to avoid warnings
  // Note: touchmove and mousemove events are marked as passive for better performance
  var svg = d3.select("svg")
    .on("touchmove mousemove", moved, { passive: true }),
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
  // Colors D3 interpolation
  const color = d3.scaleSequential(d3.interpolateSpectral);
  // Queue array  
  const queue = [];

  // Hover HUD perf helpers
  let hoverRafId = 0;
  let lastNearest = -1;
  const hudCell = document.getElementById('cell');
  const hudHeight = document.getElementById('height');
  const hudFeature = document.getElementById('feature');

  // Add D3 drag and zoom behavior with passive event handling
  var zoom = d3.zoom()
    .scaleExtent([1, 50])
    .translateExtent([
      [-100, -100],
      [mapWidth + 100, mapHeight + 100]
    ])
    .on("zoom", zoomed);

  // Apply zoom behavior
  svg.call(zoom);
  
  // Suppress passive event warnings for D3 zoom (these are expected)
  // The zoom behavior needs to prevent default on wheel events for proper zooming
  // This is a known limitation of D3 v5 and the warnings can be safely ignored

  function zoomed() {
    viewbox.attr("transform", d3.zoomTransform(svg.node()));
  }

  // array to use as names
  var adjectives = ["Ablaze", "Ablazing", "Accented", "Ashen", "Ashy", "Beaming", "Bi-Color", "Blazing", "Bleached", "Bleak", "Blended", "Blotchy", "Bold", "Brash", "Bright", "Brilliant", "Burnt", "Checkered", "Chromatic", "Classic", "Clean", "Colored", "Colorful", "Colorless", "Complementing", "Contrasting", "Cool", "Coordinating", "Crisp", "Dappled", "Dark", "Dayglo", "Deep", "Delicate", "Digital", "Dim", "Dirty", "Discolored", "Dotted", "Drab", "Dreary", "Dull", "Dusty", "Earth", "Electric", "Eye-Catching", "Faded", "Faint", "Festive", "Fiery", "Flashy", "Flattering", "Flecked", "Florescent", "Frosty", "Full-Toned", "Glistening", "Glittering", "Glowing", "Harsh", "Hazy", "Hot", "Hued", "Icy", "Illuminated", "Incandescent", "Intense", "Interwoven", "Iridescent", "Kaleidoscopic", "Lambent", "Light", "Loud", "Luminous", "Lusterless", "Lustrous", "Majestic", "Marbled", "Matte", "Medium", "Mellow", "Milky", "Mingled", "Mixed", "Monochromatic", "Motley", "Mottled", "Muddy", "Multicolored", "Multihued", "Murky", "Natural", "Neutral", "Opalescent", "Opaque", "Pale", "Pastel", "Patchwork", "Patchy", "Patterned", "Perfect", "Picturesque", "Plain", "Primary", "Prismatic", "Psychedelic", "Pure", "Radiant", "Reflective", "Rich", "Royal", "Ruddy", "Rustic", "Satiny", "Saturated", "Secondary", "Shaded", "Sheer", "Shining", "Shiny", "Shocking", "Showy", "Smoky", "Soft", "Solid", "Somber", "Soothing", "Sooty", "Sparkling", "Speckled", "Stained", "Streaked", "Streaky", "Striking", "Strong Neutral", "Subtle", "Sunny", "Swirling", "Tinged", "Tinted", "Tonal", "Toned", "Translucent", "Transparent", "Two-Tone", "Undiluted", "Uneven", "Uniform", "Vibrant", "Vivid", "Wan", "Warm", "Washed-Out", "Waxen", "Wild"];

  detectNeighbors(diagram, polygons);
  
  // Ensure reciprocal neighbors for self-tests
  ensureReciprocalNeighbors({ cells: polygons });





  function drawPolygons() {
    // delete all polygons
    svg.select(".mapCell").remove();
    // redraw the polygons based on new heights
    var grads = [],
      limit = 0.2;
    if (seaInput.checked == true) {
      limit = 0;
    }
    polygons.map(function(i) {
      if (i.height >= limit) {
        mapCells.append("path")
          .attr("d", "M" + i.join("L") + "Z")
          .attr("class", "mapCell")
          .attr("fill", color(1 - i.height));
        mapCells.append("path")
          .attr("d", "M" + i.join("L") + "Z")
          .attr("class", "mapStroke")
          .attr("stroke", color(1 - i.height));
      }
			if (i.type === "shallow") {
				shallow.append("path")
					.attr("d", "M" + i.join("L") + "Z");
			}
    });
    if (blurInput.valueAsNumber > 0) {
      toggleBlur();
    }
  }





  // Click handler removed - no longer adding terrain on click

  function moved() {
    if (hoverRafId) return; // throttle to animation frame
    const point = d3.mouse(this);
    hoverRafId = requestAnimationFrame(function () {
      hoverRafId = 0;
      const nearest = diagram.find(point[0], point[1]).index;
      if (nearest === lastNearest) return; // only update when cell changes
      lastNearest = nearest;
      const poly = polygons[nearest];
      // vanilla DOM updates (faster than jQuery for high-frequency UI)
      hudCell.textContent = nearest;
      hudHeight.textContent = poly.height.toFixed(2);
      hudFeature.textContent = poly.featureType
        ? (poly.featureName + " " + poly.featureType)
        : "no!";
    });
  }

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
    drawPolygons();
    $('.circles').hide();
    
    // reset hover cache after (re)generation
    lastNearest = -1;
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
    drawPolygons();
  });

  // Draw of remove blur polygons on intup change
  $("#blurInput").change(function() {
    toggleBlur();
  });

  // Change blur, in case of 0 will not be drawn 
  function toggleBlur() {
    d3.selectAll(".blur").remove();
    if (blurInput.valueAsNumber > 0) {
      var limit = 0.2;
      if (seaInput.checked == true) {
        limit = 0;
      }
      polygons.map(function(i) {
        if (i.height >= limit) {
          mapCells.append("path")
            .attr("d", "M" + i.join("L") + "Z")
            .attr("class", "blur")
            .attr("stroke-width", blurInput.valueAsNumber)
            .attr("stroke", color(1 - i.height));
        }
      });
    }
  }

  // Draw of remove blur polygons on intup change
  $("#strokesInput").change(function() {
    toggleStrokes();
  });

  // Change polygons stroke-width,
  // in case of low width svg background will be shined through 
  function toggleStrokes() {
    if (strokesInput.checked == true) {
      var limit = 0.2;
      if (seaInput.checked == true) {
        limit = 0;
      }
      polygons.map(function(i) {
        if (i.height >= limit) {
          mapCells.append("path")
            .attr("d", "M" + i.join("L") + "Z")
            .attr("class", "mapStroke")
            .attr("stroke", "grey");
        }
      });
    } else {
      d3.selectAll(".mapStroke").remove();
    }
  }



  // Clear the map on re-generation
  function undraw() {
    // Remove all on regenerate 
    $("g").remove();
    $("path").remove();
    // Set some options to defaults
    heightInput.value = 0.9;
    heightOutput.value = 0.9;
    radiusInput.value = 0.9;
    radiusOutput.value = 0.9;
  }
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

// Make functions available globally for HTML onclick handlers
window.undraw = undraw;
window.generate = generate;
window.toggleOptions = toggleOptions;
window.toggleBlobCenters = toggleBlobCenters;
window.state = state; // Make state accessible globally
window.rng = rng; // Make RNG accessible globally for debugging
