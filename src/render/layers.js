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

export function ensureLayers(svg, order = DEFAULT_ORDER) {
  if (!svg || svg.namespaceURI !== "http://www.w3.org/2000/svg") {
    throw new Error("ensureLayers(svg): svg element required");
  }
  // Ensure groups exist in order
  const existing = new Map();
  for (const g of svg.querySelectorAll(":scope > g[id]")) existing.set(g.id, g);

  // Append missing in the canonical order
  const groups = {};
  for (const id of order) {
    groups[id] = existing.get(id) || create(svg, id);
  }

  // Reorder to match requested stacking order
  order.forEach(id => svg.appendChild(groups[id]));

  return groups;
}

export function clearLayer(layer) {
  while (layer && layer.firstChild) layer.removeChild(layer.firstChild);
}

export const LAYER_ORDER = DEFAULT_ORDER.slice();
