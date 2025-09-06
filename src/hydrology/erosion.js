// src/hydrology/erosion.js
// Seeding domes for hydrology system

import { blobFalloffExp, islandStrength, hillStrength } from './constants.js';
import { Timers } from '../core/timers.js';

// Simple Euclidean distance helper
function distance(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.sqrt(dx * dx + dy * dy);
}

// Get the current state from global variables
export function getState() {
  // Access global state and current data
  const state = {
    heights: window.currentPolygons?.map(p => p.height ?? 0) ?? [],
    cells: window.currentPolygons ?? [],
    samples: window.currentSamples ?? []
  };
  return state;
}

export function add(start, type = "island") {
  const state = getState();
  
  function getSiteOf(cellId) {
    const c = state.cells?.[cellId];
    return (c && c.site && Number.isFinite(c.site.x) && Number.isFinite(c.site.y)) ? c.site : null;
  }
  
  // Validate inputs
  if (!state.cells || state.cells.length === 0) {
    console.error('[erosion] No cells available in state');
    return;
  }
  
  if (start < 0 || start >= state.cells.length) {
    console.error(`[erosion] Invalid start index: ${start} (max: ${state.cells.length - 1})`);
    return;
  }
  
  const startSite = getSiteOf(start);
  if (!startSite) {
    console.warn("[erosion] start cell has no site; aborting add()", start);
    return;
  }
  
  const R = (type === "island" ? 60 : 30);
  const strength = (type === "island" ? islandStrength : hillStrength);
  const exp = blobFalloffExp;
  const sharpness = 1.0;

  const visited = new Set([start]);
  const q = [start];

  // Initialize heights array if needed
  if (!state.heights || state.heights.length !== state.cells.length) {
    state.heights = state.cells.map(cell => cell.height ?? 0);
  }
  
  const h = state.heights;
  h[start] = Math.min(1, h[start] + strength);

  while (q.length) {
    const cell = q.shift();
    const neigh = state.cells[cell]?.neighbors || [];
    for (const n of neigh) {
      if (visited.has(n)) continue;
      visited.add(n);

      const s = getSiteOf(n);
      if (!s) continue; // skip neighbors w/out coords

      const dx = s.x - startSite.x, dy = s.y - startSite.y;
      const d = Math.hypot(dx, dy);
      if (d > R) continue;

      const delta = strength * Math.pow(1 - d / R, exp) * sharpness;
      h[n] = Math.min(1, h[n] + delta);
      q.push(n);
    }
  }
  
  // Update polygon heights to match state heights
  for (let i = 0; i < h.length; i++) {
    if (state.cells[i]) {
      state.cells[i].height = h[i];
    }
  }
  
  console.debug("[erosion] Added %s dome at cell %o, affected ~%o cells", type, start, visited.size);
}

export function normalizeHeights(state) {
  console.time?.("normalizeHeights");
  
  // If no state provided, get current state
  if (!state) {
    state = getState();
  }
  
  // If state doesn't have heights, create it from current polygons
  if (!state.heights) {
    state.heights = window.currentPolygons?.map(p => p.height ?? 0) ?? [];
  }
  
  const h = state.heights;
  
  // Validate heights array
  if (!h || !Array.isArray(h) || h.length === 0) {
    console.error('[erosion] normalizeHeights: No valid heights array found');
    return;
  }
  
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < h.length; i++) {
    const v = h[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = Math.max(1e-9, (max - min));
  for (let i = 0; i < h.length; i++) {
    h[i] = (h[i] - min) / range;
    if (h[i] < 0) h[i] = 0;
    if (h[i] > 1) h[i] = 1;
  }
  
  // Update the actual polygon heights
  if (window.currentPolygons && window.currentPolygons.length === h.length) {
    for (let i = 0; i < h.length; i++) {
      window.currentPolygons[i].height = h[i];
    }
  }
  
  console.timeEnd?.("normalizeHeights");
  console.debug?.("[erosion] normalizeHeights min=%o max=%o range=%o", min, max, range);
}
