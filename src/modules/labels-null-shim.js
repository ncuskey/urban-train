// src/modules/labels-null-shim.js
// Minimal no-op surface so the app runs with zero labels during Step 0.

function sel(svg) {
  // Supports d3 selections or raw SVG nodes
  const s = (svg && svg.select) ? svg : d3.select(svg);
  return s;
}

export function ensureLabelContainers(svg) {
  const root = sel(svg);
  let labels = root.select('#labels');
  if (labels.empty()) labels = root.append('g').attr('id', 'labels');

  // groups some legacy code expects to exist:
  if (labels.select('#labels-world').empty()) labels.append('g').attr('id', 'labels-world');
  if (labels.select('#labels-overlay').empty()) labels.append('g').attr('id', 'labels-overlay');
  if (labels.select('#labels-world-areas').empty()) labels.append('g').attr('id', 'labels-world-areas');
}

export function buildFeatureLabels(/* { ... } */) {
  // Step 0: no labels at all
  return [];
}

export function placeLabelsAvoidingCollisions(labels /*, opts */) {
  // Nothing to place in Step 0
  return [];
}

export function renderWorldLabels(/* svg, labels */) { /* no-op */ }
export function renderOverlayLabels(/* svg, labels */) { /* no-op */ }
export function updateLabelVisibilityLOD(/* svg, k */) { /* no-op */ }
export function updateLabelTransforms(/* svg, k */) { /* no-op */ }
export function clearLabels(/* svg */) { /* no-op */ }
export function ensureMetrics(/* labels, svg */) { /* no-op */ }

export function measureTextWidth(/* svg, text, style */) {
  // Return 0 so any arithmetic doesn't explode
  return 0;
}

export function renderOceanInWorld(/* svg, text */) { /* no-op */ }
export function findOceanLabelSpot(/* world, rect */) { return null; }
export function placeOceanLabelAtSpot(/* oceanLabel, spot, svg */) { /* no-op for Step 0 */ }

// Additional functions still being called in the code
export function getVisibleWorldBoundsFromLabels(/* svg */) { return null; }
export function updateLabelVisibility(/* ... */) { /* no-op */ }
export function updateLabelVisibilityWithOptions(/* ... */) { /* no-op */ }
export function filterByZoom(/* ... */) { return []; }
export function clampToKeepRect(/* ... */) { /* no-op */ }
export function drawDebugOceanRect(/* ... */) { /* no-op */ }
export function findOceanLabelRectAfterAutofit(/* ... */) { return null; }
export function makeIsWater(/* ... */) { return () => false; }
export function applyFontCaps(/* ... */) { /* no-op */ }
export const LABEL_DEBUG = false;
export function smokeLabel(/* ... */) { /* no-op */ }
export function debugLabels(/* ... */) { /* no-op */ }
export function placeOceanLabelsAfterAutofit(/* ... */) { /* no-op */ }

// Optional helpers some older code referenced:
export const labelKey = d => (d && (d.label_id || d.id)) || 'noop';
