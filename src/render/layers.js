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

  // Ensure map & labels exist and are children of #world
  let map = world.select('#map');
  if (map.empty()) map = world.append('g').attr('id', 'map');

  let labels = world.select('#labels');
  if (labels.empty()) labels = world.append('g').attr('id', 'labels');

  // If labels accidentally lives outside #world, move it under #world
  const labelsNode = labels.node();
  if (labelsNode.parentNode.id !== 'world') world.node().appendChild(labelsNode);

  // Always keep labels above map
  labels.raise();

  return { viewport, world, map, labels };
}

export function ensureLabelSubgroups(svg) {
  const labels = svg.select('#labels');
  
  ['labels-features', 'labels-towns', 'labels-geo'].forEach(id => {
    if (labels.select(`#${id}`).empty()) {
      labels.append('g').attr('id', id);
    }
  });
  
  // Keep subgroups on top as well
  labels.select('#labels-features').raise();
  labels.select('#labels-towns').raise();
  labels.select('#labels-geo').raise();
}

export function clearLayer(layer) {
  while (layer && layer.firstChild) layer.removeChild(layer.firstChild);
}

export const LAYER_ORDER = DEFAULT_ORDER.slice();
