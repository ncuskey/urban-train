// Centralized SVG layer management. Creates missing groups in order and returns a map.
// Usage:
//   import { ensureLayers, clearLayer } from "./render/layers.js";
//   const layers = ensureLayers(svg);
//   clearLayer(layers.rivers);

const DEFAULT_ORDER = [
  "ocean",
  "land",
  "coast",
  "rivers",
  "roads",
  "searoutes",
  "towns",
  "labels",
  "hud",
];

function create(el, name) {
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("id", name);
  el.appendChild(g);
  return g;
}

export function ensureLayers(svg) {
  // Handle both d3 selections and raw DOM elements
  const svgElement = svg.node ? svg.node() : svg;
  if (!svgElement || svgElement.namespaceURI !== "http://www.w3.org/2000/svg") {
    throw new Error("ensureLayers(svg): svg element required");
  }

  // Convert to d3 selection if needed
  const svgSel = svg.select ? svg : d3.select(svgElement);
  
  let viewport = svgSel.select('#viewport');
  if (viewport.empty()) viewport = svgSel.append('g').attr('id', 'viewport');

  let world = viewport.select('#world');
  if (world.empty()) world = viewport.append('g').attr('id', 'world');

  // Helper: ensure a child <g> exists, set id, and tag with data-layer
  function ensureGroup(id, layerName = id) {
    let g = world.select(`#${id}`);
    if (g.empty()) g = world.append('g').attr('id', id);
    // Always (re)tag with a canonical data-layer name
    g.attr('data-layer', layerName);
    return g;
  }

  // Base layers (tag with data-layer)
  const ocean  = ensureGroup('ocean',  'ocean');
  const lakes  = ensureGroup('lakes',  'lakes');
  const land   = ensureGroup('land',   'land');
  const coast  = ensureGroup('coast',  'coast');
  const rivers = ensureGroup('rivers', 'rivers');
  const labels = ensureGroup('labels', 'labels');
  // If you have a biomes group already, tag it too (no-op otherwise)
  const biomes = ensureGroup('biomes', 'biomes');

  // Ensure map & labels exist and are children of #world
  let map = world.select('#map');
  if (map.empty()) map = world.append('g').attr('id', 'map');

  // If labels accidentally lives outside #world, move it under #world
  const labelsNode = labels.node();
  if (labelsNode.parentNode.id !== 'world') world.node().appendChild(labelsNode);

  // Always keep labels above map
  labels.raise();

  // Ensure debug layer exists
  let debug = world.select('#debug');
  if (debug.empty()) debug = world.append('g').attr('id', 'debug');

  // Ensure HUD layer exists
  let hud = svgSel.select('#hud');
  if (hud.empty()) hud = svgSel.append('g').attr('id','hud');

  return { viewport, world, map, labels, debug, ocean, lakes, land, coast, rivers, biomes };
}

export function ensureLabelSubgroups(svg) {
  const labels = svg.select('#labels');
  
  // Create labels-features subgroup (currently the only one used)
  if (labels.select('#labels-features').empty()) {
    labels.append('g').attr('id', 'labels-features');
  }
  
  // Work with the existing structure created by ensureLabelLayers
  // ensureLabelLayers creates: #labels-root > #labels-world
  let labelsRoot = svg.select('#labels-root');
  if (labelsRoot.empty()) {
    // If labels-root doesn't exist, create it under svg
    labelsRoot = svg.append('g').attr('id', 'labels-root');
  }
  
  let world = labelsRoot.select('#labels-world');
  if (world.empty()) world = labelsRoot.append('g').attr('id', 'labels-world');
  
  // Create dedicated containers for ocean and area labels under #labels-world
  let worldOcean = world.select('#labels-world-ocean');
  if (worldOcean.empty()) worldOcean = world.append('g').attr('id', 'labels-world-ocean');
  
  let worldAreas = world.select('#labels-world-areas');
  if (worldAreas.empty()) worldAreas = world.append('g').attr('id', 'labels-world-areas');
  
  // TODO: Future label subgroups for different label types
  // - labels-towns: For settlement/city labels when town generation is implemented
  // - labels-geo: For geographic feature labels (mountains, rivers, etc.) when terrain features are added
  // When implementing, uncomment and add:
  // if (labels.select('#labels-towns').empty()) labels.append('g').attr('id', 'labels-towns');
  // if (labels.select('#labels-geo').empty()) labels.append('g').attr('id', 'labels-geo');
  
  // Keep labels-features on top
  labels.select('#labels-features').raise();
}

export function clearLayer(layer) {
  while (layer && layer.firstChild) layer.removeChild(layer.firstChild);
}

export const LAYER_ORDER = DEFAULT_ORDER.slice();
