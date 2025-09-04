// Global debug toggle - flip to true when tuning
window.DEBUG = false;

// Label system temporarily disabled - flags removed until new modules arrive
window.labelFlags = {};

// ── Water-only selection knobs
const OCEAN_SAFE_INSET_PX = 8;      // already used for safe viewport
const OCEAN_MIN_WATER_FRAC = 0.92;  // slightly relaxed to reduce "no fit"
const OCEAN_AR_PENALTY = 0.6;       // 0..1; higher penalizes skinny boxes more
const MIN_GRID = 3;                 // ≥ ~24px if cell=8

// ── Transform helpers for screen/world coordinate conversion
function currentZoomTransform() {
  const svg = d3.select("svg").node();
  return d3.zoomTransform(svg);
}

// Convert world → screen using current zoom
function toScreenXY([x, y]) {
  const t = currentZoomTransform();
  const p = t.apply([x, y]);
  return [p[0], p[1]];
}

// Convert screen → world (for final label placement under world group)
function toWorldXY([sx, sy]) {
  const t = currentZoomTransform();
  const p = t.invert([sx, sy]);
  return [p[0], p[1]];
}

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
import "./core/zoom-utils.js";
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
import { buildWaterAnchors } from "./labels/anchors-water.js";
import { renderQAWaterAnchors, syncQAWaterRadius, renderQACandidates, clearQACandidates, renderQACollision } from "./labels/debug-markers.js";
import { computeLOD, visibleAtK } from "./labels/lod.js";
import { makeCandidates } from "./labels/placement/candidates.js";
import { greedyPlace } from "./labels/placement/collide.js";
import { deferIdle, cancelIdle } from "./core/idle.js";
import { computeBestLayout } from "./labels/ocean/layout.js";
import { getLastWaterAnchors } from "./labels/anchors-water.js";
import { intersectRect, clampPointToRect, waterFractionInRect } from "./core/rect.js";

// ──────────────────────────────────────────────────────────────────────────────
// Step 0 — placement epoch & cleanup helpers
// ──────────────────────────────────────────────────────────────────────────────
// Epoch ensures late callbacks from a previous run can't mutate current state.
var __placementEpoch = 0;
export function getPlacementEpoch() { return __placementEpoch; }
export function bumpPlacementEpoch() { __placementEpoch += 1; return __placementEpoch; }

// ── Safe viewport inset (keep labels off the wall)
export function computeMapInsetPx(svgW, svgH) {
  const m = Math.round(Math.min(svgW, svgH) * 0.02); // 2% of min dimension
  return Math.max(8, Math.min(24, m));               // clamp [8..24] px
}

export function shrinkRect(rect, inset) {
  const x = rect.x + inset, y = rect.y + inset;
  const w = Math.max(0, rect.w - 2*inset), h = Math.max(0, rect.h - 2*inset);
  return { x, y, w, h };
}

// ── Debug overlay for chosen ocean rect (screen-space)
let __debugBoxesOn = true; // dev default; toggle via LabelsDebug
function ensureOceanDebugLayer() {
  const root = d3.select("svg"); // top-level, unaffected by world zoom
  let layer = root.select("#labels-debug-ocean");
  if (layer.empty()) layer = root.append("g").attr("id", "labels-debug-ocean");
  return layer;
}
function drawOceanDebugRect(rect, kind = "sat") {
  const layer = ensureOceanDebugLayer();
  layer.selectAll("rect.ocean-layout-debug").remove();
  layer.selectAll("line.ocean-layout-center").remove();
  if (!__debugBoxesOn) return;
  layer.append("rect")
    .attr("class", "ocean-layout-debug")
    .attr("x", rect.x).attr("y", rect.y)
    .attr("width", rect.w).attr("height", rect.h)
    .style("fill", "none")
    .style("stroke", "#22d3ee")                 // cyan for contrast
    .style("stroke-width", 2)
    .style("vector-effect", "non-scaling-stroke")
    .style("opacity", 0.8);
  // small center tick
  const cx = rect.x + rect.w/2, cy = rect.y + rect.h/2;
  layer.append("line")
    .attr("class", "ocean-layout-center")
    .attr("x1", cx-6).attr("y1", cy).attr("x2", cx+6).attr("y2", cy)
    .style("stroke", "#22d3ee").style("stroke-width", 2)
    .style("vector-effect", "non-scaling-stroke").style("opacity", .8);
  console.log("[debug:ocean] drew rect", { kind, rect });
}
function clearOceanDebug() {
  ensureOceanDebugLayer().selectAll("*").remove();
}

// draw safe viewport and land bbox (debug)
function drawDebugBounds(safeVP, landRect) {
  const layer = ensureOceanDebugLayer();
  layer.selectAll("rect.debug-safe-vp").remove();
  layer.selectAll("rect.debug-land-bbox").remove();
  layer.append("rect").attr("class", "debug-safe-vp")
    .attr("x", safeVP.x).attr("y", safeVP.y).attr("width", safeVP.w).attr("height", safeVP.h)
    .style("fill","none").style("stroke","#60a5fa").style("stroke-width",1.5).style("vector-effect","non-scaling-stroke").style("opacity",0.6);
  if (landRect) layer.append("rect").attr("class","debug-land-bbox")
    .attr("x", landRect.x).attr("y", landRect.y).attr("width", landRect.w).attr("height", landRect.h)
    .style("fill","none").style("stroke","#f59e0b").style("stroke-dasharray","4 3")
    .style("stroke-width",1.5).style("vector-effect","non-scaling-stroke").style("opacity",0.7);
}

export function rectFromViewport(svgW, svgH) {
  return { x: 0, y: 0, w: svgW, h: svgH };
}

// ── Zoom settle gate: resolves once k/x/y are stable for N frames or timeout
async function waitForZoomSettle({ epsilon = 1e-4, stableFrames = 2, maxWait = 1500 } = {}) {
  const svg = d3.select("svg").node();
  if (!svg || !d3.zoomTransform) return;
  let last = d3.zoomTransform(svg);
  let stable = 0;
  const start = performance.now();

  return new Promise((resolve) => {
    function tick() {
      const now = performance.now();
      const t = d3.zoomTransform(svg);
      const dk = Math.abs((t.k ?? 0) - (last.k ?? 0));
      const dx = Math.abs((t.x ?? 0) - (last.x ?? 0));
      const dy = Math.abs((t.y ?? 0) - (last.y ?? 0));
      if (dk < epsilon && dx < 0.5 && dy < 0.5) {
        stable += 1;
      } else {
        stable = 0;
      }
      last = t;
      if (stable >= stableFrames || (now - start) > maxWait) {
        console.log("[autofit:gate] settled", { k: t.k, x: t.x, y: t.y, ms: Math.round(now - start) });
        resolve();
      } else {
        requestAnimationFrame(tick);
      }
    }
    requestAnimationFrame(tick);
  });
}

// ── ephemeral placements by epoch (not persisted)
const __placements = new Map(); // epoch -> { ocean?: {...}, seas?:[], ... }
function placementsForCurrentEpoch() {
  const e = getPlacementEpoch?.() ?? 0;
  if (!__placements.has(e)) __placements.set(e, {});
  return __placements.get(e);
}

// ── Step 2: draw the chosen ocean label (uses Step 1 output)
function eraseOceanLabel() {
  const { world } = ensureLabelLayers();
  world.selectAll("g.ocean-label.final").remove();
}

function step2RenderOceanLabel() {
  const bucket = placementsForCurrentEpoch();
  const entry  = bucket?.ocean;
  if (!entry || !entry.best?.ok) {
    console.warn("[step2:ocean] No computed layout found. Run Step 1 first.");
    return;
  }
  const { rect, best, k } = entry;
  const { lines, fontPx } = best;
  const pad = 4;
  const sx = Math.max(rect.x + pad, Math.min(rect.x + rect.w - pad, best.anchor.cx));
  const sy = Math.max(rect.y + pad, Math.min(rect.y + rect.h - pad, best.anchor.cy));

  // convert to *world* coordinates so the parent zoom transform puts it at (sx, sy)
  const [wx, wy] = toWorldXY([sx, sy]);
  const lineH = Math.ceil(fontPx * 1.2); // keep in sync with Step 1 default

  eraseOceanLabel(); // idempotent
  const g = ensureOceanLabelGroup();
  const node = g.append("g")
    .attr("class", "ocean-label final")
    .attr("transform", `translate(${wx},${wy}) scale(${1 / (k || 1)})`)
    .style("pointer-events", "none")
    .style("opacity", 0.95);

  // Vertical centering for N lines: first line baseline at y0
  const N = lines.length;
  const y0 = -((N - 1) * lineH) / 2;

  // Halo first (stroke), then fill. Keep classes so theme can override.
  lines.forEach((t, i) => {
    const y = y0 + i * lineH;
    node.append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("class", "label water ocean halo")
      .style("font-style", "italic")
      .style("letter-spacing", "0.6px")      // match Step 1 measure (px)
      .style("font-size", `${fontPx}px`)
      .style("paint-order", "stroke fill")
      .style("stroke", "white")
      .style("stroke-width", Math.max(1, Math.round(fontPx / 7)))
      .style("stroke-linejoin", "round")
      .text(t)
      .attr("x", 0).attr("y", y);

    node.append("text")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .attr("class", "label water ocean fill")
      .style("font-style", "italic")
      .style("letter-spacing", "0.6px")
      .style("font-size", `${fontPx}px`)
      .text(t)
      .attr("x", 0).attr("y", y);
  });

  console.log("[step2:ocean] rendered", { lines, fontPx, anchor: { cx: sx, cy: sy }, k });
}

function clearOldPlacements() {
  // keep only current epoch to avoid leaks
  const curr = getPlacementEpoch?.() ?? 0;
  for (const key of __placements.keys()) if (key !== curr) __placements.delete(key);
}

// Ensure the world label layers exist; don't change IDs/classes.
function ensureLabelLayers() {
  const root = d3.select("#labels");
  let world = root.select("#labels-world");
  if (world.empty()) world = root.append("g").attr("id", "labels-world");
  let ocean = world.select("#labels-world-ocean");
  if (ocean.empty()) ocean = world.append("g").attr("id", "labels-world-ocean").attr("class", "labels ocean");
  return { root, world, ocean };
}

// Remove *rendered* labels/visual debug shapes, preserving containers.
function clearLabelDOM() {
  const { world, ocean } = ensureLabelLayers();
  // Remove any previous label nodes
  world.selectAll("g.ocean-label, text.label").remove();
  // Remove debug marks
  world.selectAll("circle.debug-ocean-dot, rect.debug-ocean-rect").remove();
  console.log("[step0] Cleared world label DOM (kept containers)");
}

// Cancel any pending placement work (idle handles, timeouts).
function cancelPendingPlacement() {
  try { if (typeof _oceanIdleHandle !== "undefined" && _oceanIdleHandle) { cancelIdle(_oceanIdleHandle); } } catch {}
  // Add other handles here if you introduce more schedulers later.
  console.log("[step0] Canceled pending placement handles");
}

// Reset store to an empty, normalized shape without clobbering helpers.
function resetLabelStoreClean() {
  if (typeof setFeatureLabelsStore === "function") {
    setFeatureLabelsStore({ oceans: [], nonOcean: [] });
  } else {
    // Fallback if setter hasn't been patched yet:
    if (!window.__labelsStore || typeof window.__labelsStore !== "object")
      window.__labelsStore = { oceans: [], nonOcean: [], total: 0 };
    else {
      window.__labelsStore.oceans = [];
      window.__labelsStore.nonOcean = [];
      window.__labelsStore.total = 0;
    }
  }
  console.log("[step0] Store reset (oceans=0, nonOcean=0, total=0)");
}

// Public Step 0: bump epoch, cancel pending work, clear DOM, reset store.
export function step0ClearAfterAutofit() {
  const epoch = bumpPlacementEpoch();
  cancelPendingPlacement();
  clearLabelDOM();
  resetLabelStoreClean();
  clearOldPlacements();
  console.log("[step0] Ready for fresh placement. epoch=", epoch);
}

// ── Dev-only debug API (exposed to console)
if (typeof window !== "undefined" && !window.LabelsDebug) {
  window.LabelsDebug = {};
}
if (typeof window !== "undefined") {
  Object.assign(window.LabelsDebug, {
    // Step 0
    step0: step0ClearAfterAutofit,
    // Epoch controls
    epoch: () => getPlacementEpoch?.(),
    bumpEpoch: () => bumpPlacementEpoch?.(),
    // Convenience: cancel any pending scheduled placement now
    cancel: () => { try { cancelPendingPlacement(); } catch (e) { console.warn(e); } },
    // Step 1 inspection
    oceanBest: () => { const p = placementsForCurrentEpoch(); return p?.ocean || null; },
    // Step 2 rendering
    oceanRender: () => step2RenderOceanLabel(),
    oceanErase:  () => eraseOceanLabel(),
    // Zoom settle gate
    waitForZoomSettle: (opts) => waitForZoomSettle(opts),
    debugBoxes:  (on) => { __debugBoxesOn = !!on; if (!on) clearOceanDebug(); return __debugBoxesOn; },
  });
  console.log("[debug] window.LabelsDebug ready (step0 | epoch | bumpEpoch | cancel | oceanBest | oceanRender | oceanErase | waitForZoomSettle | debugBoxes)");
}

// --- water config ---
const DEFAULT_SEA_LEVEL = 0.20;

/** Resolve sea level from options/state with clamping. */
function resolveSeaLevel(state, opts) {
  let v = (opts && Number.isFinite(opts.seaLevel) ? opts.seaLevel : undefined);
  if (v == null && state && Number.isFinite(state.seaLevel)) v = state.seaLevel;
  if (!Number.isFinite(v)) v = DEFAULT_SEA_LEVEL;
  if (v < 0) v = 0;
  if (v > 1) v = 1;
  return v;
}

// --- Labels store (hoisted; no TDZ) ---
// Use var so the binding exists early during module evaluation.
var __labelsStore = { oceans: [], nonOcean: [], total: 0 };

export function getFeatureLabelsStore() {
  return __labelsStore;
}

// Hoisted function declaration so call sites anywhere in the file can use it.
export function ensureLabelsStore() {
  if (!__labelsStore || typeof __labelsStore !== "object") {
    __labelsStore = { oceans: [], nonOcean: [], total: 0 };
  }
  if (!Array.isArray(__labelsStore.oceans)) __labelsStore.oceans = [];
  if (!Array.isArray(__labelsStore.nonOcean)) __labelsStore.nonOcean = [];
  const calcTotal = (__labelsStore.oceans?.length || 0) + (__labelsStore.nonOcean?.length || 0);
  if (typeof __labelsStore.total !== "number" || __labelsStore.total !== calcTotal) {
    // Use the setter to update the total for consistency
    setFeatureLabelsStore({ total: calcTotal });
  }
  return __labelsStore;
}

// Merge-safe setter; normalizes shapes and recomputes total.
export function setFeatureLabelsStore(next) {
  // Defensive: in case ensureLabelsStore is not yet defined/available in older patches.
  const prev = (typeof ensureLabelsStore === "function")
    ? ensureLabelsStore()
    : (__labelsStore && typeof __labelsStore === "object" ? __labelsStore : { oceans: [], nonOcean: [], total: 0 });

  const normNext = { ...next };
  // Normalize singular key if some producers send { ocean: [...] }
  if (normNext && "ocean" in normNext && !("oceans" in normNext)) {
    normNext.oceans = normNext.ocean;
    delete normNext.ocean;
  }

  // If caller provided only numeric counts (no arrays), treat as a no-op and warn.
  const onlyNumbersNoArrays =
    !Array.isArray(normNext.oceans) &&
    !Array.isArray(normNext.nonOcean) &&
    Object.keys(normNext).every(k => ["total", "ocean", "oceans", "nonOcean"].includes(k) && typeof normNext[k] !== "object");
  if (onlyNumbersNoArrays) {
    console.warn("[store] ignored numeric-only payload (no arrays provided)", normNext);
    return __labelsStore;
  }

  // Treat numeric zeros without arrays as *no-op* (avoid clobbering arrays mid-run)
  const merged = { ...prev, ...normNext };
  if (!Array.isArray(merged.oceans))  merged.oceans  = Array.isArray(prev.oceans)   ? prev.oceans   : [];
  if (!Array.isArray(merged.nonOcean)) merged.nonOcean = Array.isArray(prev.nonOcean) ? prev.nonOcean : [];
  merged.total = (merged.oceans?.length || 0) + (merged.nonOcean?.length || 0);

  __labelsStore = merged;
  return __labelsStore;
}

// Hoisted to avoid TDZ when deferOceanPlacement runs during early autofit.
// Use var so it's hoisted and initialized to undefined (no TDZ).
var _oceanIdleHandle = null;

// --- helpers: ocean label group + fallback placement ---
function ensureOceanLabelGroup() {
  const root = d3.select("#labels-world");           // parent world labels group (already scaled by k)
  let g = root.select("#labels-world-ocean");        // dedicated ocean layer
  if (g.empty()) g = root.append("g").attr("id", "labels-world-ocean").attr("class", "labels ocean");
  return g;
}

// Normalize any ocean anchor into a consistent shape the placer expects.
// - Reads multiple possible field names for center/label.
// - Computes a screen-center using current zoom/projection if available.
// - Bbox (world/screen) is optional; we log when absent.
function normalizeOceanAnchor(raw, proj) {
  const a = raw || {};

  // 1) Label
  const label =
    a.label ?? a.name ?? a.text ?? a.title ?? "Ocean";

  // 2) Center (world space)
  // Try common field names; then polygon centroid if available; else viewport center as last resort.
  let cxW =
    a.cx ?? a.x ?? a.centerX ?? (Array.isArray(a.centroid) ? a.centroid[0] : undefined);
  let cyW =
    a.cy ?? a.y ?? a.centerY ?? (Array.isArray(a.centroid) ? a.centroid[1] : undefined);

  if ((cxW == null || cyW == null) && a.bbox) {
    // Use bbox center in world space if provided
    const bx = a.bbox.x ?? a.bbox.left ?? a.bbox.minX;
    const by = a.bbox.y ?? a.bbox.top  ?? a.bbox.minY;
    const bw = a.bbox.w ?? a.bbox.width  ?? ((a.bbox.maxX != null && bx != null) ? (a.bbox.maxX - bx) : undefined);
    const bh = a.bbox.h ?? a.bbox.height ?? ((a.bbox.maxY != null && by != null) ? (a.bbox.maxY - by) : undefined);
    if (bx != null && by != null && bw != null && bh != null) {
      cxW = bx + bw / 2;
      cyW = by + bh / 2;
    }
  }

  // 3) Bbox world (if present)
  const bboxWorld = (() => {
    const b = a.bbox || a.bboxWorld;
    if (!b) return null;
    const bx = b.x ?? b.left ?? b.minX;
    const by = b.y ?? b.top  ?? b.minY;
    const bw = b.w ?? b.width  ?? ((b.maxX != null && bx != null) ? (b.maxX - bx) : undefined);
    const bh = b.h ?? b.height ?? ((b.maxY != null && by != null) ? (b.maxY - by) : undefined);
    if ([bx, by, bw, bh].every(v => Number.isFinite(v))) {
      return { x: bx, y: by, w: bw, h: bh, cx: bx + bw/2, cy: by + bh/2 };
    }
    return null;
  })();

  // 4) Screen projection (center + bbox)
  const k = (window.__zoom && window.__zoom.k) || window.zoomK || 1;
  const toScreen = (pt) => {
    // Minimal world->screen mapping; if you have a proper projection, call it here.
    // We assume world units are already in SVG coords; apply zoom translate if your code keeps it.
    return pt;
  };

  const cxS = (cxW != null && cyW != null) ? toScreen([cxW, cyW])[0] : undefined;
  const cyS = (cxW != null && cyW != null) ? toScreen([cxW, cyW])[1] : undefined;

  const bboxScreen = (() => {
    if (!bboxWorld) return null;
    const tl = toScreen([bboxWorld.x, bboxWorld.y]);
    if (!tl) return null;
    // If you need scaling/translation here, insert it; for now assume 1:1 then zoom via counter-scale groups.
    return { x: tl[0], y: tl[1], w: bboxWorld.w, h: bboxWorld.h, cx: tl[0] + bboxWorld.w/2, cy: tl[1] + bboxWorld.h/2, k };
  })();

  return {
    id: a.id ?? a._id ?? "ocean-0",
    label,
    cxW, cyW,
    cxS, cyS,
    bboxWorld,
    bboxScreen,
    k
  };
}

function drawOceanDebugDot(x, y, note = "") {
  const g = ensureOceanLabelGroup();
  g.selectAll("circle.debug-ocean-dot").remove();
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  g.append("circle")
    .attr("class", "debug-ocean-dot")
    .attr("cx", x)
    .attr("cy", y)
    .attr("r", 2.5)
    .style("fill", "currentColor")
    .style("opacity", 0.9);
  if (note) console.log("[ocean][debug:dot]", { x, y, note });
}


function placeOceanFallbackLabel(anchor) {
  if (!anchor) return;
  const k = (window.__zoom && window.__zoom.k) || window.zoomK || 1;
  const g = ensureOceanLabelGroup();
  const id = `ocean-fallback-${anchor.id || "0"}`;
  // Remove any previous fallback for id to avoid duplicates
  g.select(`#${id}`).remove();

  const cx = anchor.cx ?? anchor.x ?? (anchor.bbox?.cx) ?? 0;
  const cy = anchor.cy ?? anchor.y ?? (anchor.bbox?.cy) ?? 0;
  const label = anchor.label || anchor.name || "Ocean";

  // Choose a safe, readable pixel size (bounded); counter-scale the group, not the font.
  const fontPx = Math.max(12, Math.min(24, (label?.length || 10) < 12 ? 22 : 18));

  // Create a child group so we can apply translate + counter-scale without affecting siblings
  const node = g.append("g")
    .attr("id", id)
    .attr("class", "ocean-label fallback")
    .attr("transform", `translate(${cx},${cy}) scale(${1 / k})`)
    .style("pointer-events", "none")
    .style("opacity", 0.92);

  node.append("text")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central")
    .attr("class", "label water ocean")
    .style("font-style", "italic")   // stylistic default; your style system can override if bound later
    .style("letter-spacing", "0.08em")
    .style("font-size", `${fontPx}px`)
    .text(label);

  console.log("[ocean][fallback] placed:", { id, k, cx, cy, fontPx, label });
}

/**
 * Compute land bbox in screen space from the grid (uses height > sea level).
 */
function computeLandBBoxScreen(cells, getHeight, getXY, seaLevel) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, count = 0;
  for (let i = 0; i < cells.length; i++) {
    const h = getHeight(i);
    if (h > seaLevel) {
      const [x, y] = getXY(i); // screen coords
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      count++;
    }
  }
  if (!count || !Number.isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ── Binary utilities
function invertBinary(A) {
  const out = new Uint8Array(A.length);
  for (let i = 0; i < A.length; i++) out[i] = A[i] ? 0 : 1;
  return out;
}

function countOnes(A) {
  let c = 0; for (let i = 0; i < A.length; i++) c += A[i];
  return c;
}

// === water mask helpers ===
function screenToWorld(x, y, zoom) {
  // zoom = {k, x, y} from the settled transform
  return { X: (x - zoom.x) / zoom.k, Y: (y - zoom.y) / zoom.k };
}

function buildWaterMaskFromHeights(safe, cellPx, zoom, getHeightAtWorld, seaLevel) {
  const gw = Math.max(1, Math.floor(safe.w / cellPx));
  const gh = Math.max(1, Math.floor(safe.h / cellPx));
  const a  = new Uint8Array(gw * gh);

  // sample at cell center in *screen* coords, convert to world, then height
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const sx = safe.x + (gx + 0.5) * cellPx;
      const sy = safe.y + (gy + 0.5) * cellPx;
      const { X, Y } = screenToWorld(sx, sy, zoom);
      const h = getHeightAtWorld(X, Y);
      a[gy * gw + gx] = h <= seaLevel ? 1 : 0; // WATER==1
    }
  }
  return { a, gw, gh, cellPx, viewport: safe, kind: "water" };
}

function erodeBinary(a, gw, gh, steps) {
  if (steps <= 0) return a;
  const out = new Uint8Array(a); // copy
  for (let s = 0; s < steps; s++) {
    const next = new Uint8Array(out);
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const i = y * gw + x;
        if (!out[i]) continue;
        // if any 4-neighbors are land (0), shrink this water cell to 0
        const up    = y > 0       ? out[(y - 1) * gw + x] : 0;
        const down  = y + 1 < gh  ? out[(y + 1) * gw + x] : 0;
        const left  = x > 0       ? out[y * gw + (x - 1)] : 0;
        const right = x + 1 < gw  ? out[y * gw + (x + 1)] : 0;
        if (up === 0 || down === 0 || left === 0 || right === 0) next[i] = 0;
      }
    }
    out.set(next);
  }
  return out;
}

// ── SAT (Summed-Area Table) helpers for fast water fraction queries
function buildSAT(a, gw, gh) {
  const sat = new Uint32Array((gw + 1) * (gh + 1));
  for (let y = 1; y <= gh; y++) {
    let rowSum = 0;
    for (let x = 1; x <= gw; x++) {
      rowSum += a[(y - 1) * gw + (x - 1)];
      const above = sat[(y - 1) * (gw + 1) + x];
      sat[y * (gw + 1) + x] = rowSum + above;
    }
  }
  return sat;
}



// === Corrected water fraction calculation ===
function buildPrefixSum(mask) {
  const { gw, gh, a } = mask;
  const ps = new Uint32Array((gw + 1) * (gh + 1));
  for (let y = 1; y <= gh; y++) {
    let row = 0;
    for (let x = 1; x <= gw; x++) {
      row += a[(y - 1) * gw + (x - 1)];
      ps[y * (gw + 1) + x] = ps[(y - 1) * (gw + 1) + x] + row;
    }
  }
  mask.ps = ps;
}

function gridRectFromScreen(mask, rect) {
  const { x:mx, y:my } = mask.viewport;
  return {
    gx0: Math.max(0, Math.floor((rect.x - mx) / mask.cellPx)),
    gy0: Math.max(0, Math.floor((rect.y - my) / mask.cellPx)),
    gx1: Math.min(mask.gw, Math.ceil((rect.x + rect.w - mx) / mask.cellPx)),
    gy1: Math.min(mask.gh, Math.ceil((rect.y + rect.h - my) / mask.cellPx)),
  };
}

function sumPS(mask, gx0, gy0, gx1, gy1) {
  const W = mask.gw + 1, ps = mask.ps;
  return ps[gy1*W + gx1] - ps[gy0*W + gx1] - ps[gy1*W + gx0] + ps[gy0*W + gx0];
}

function waterFrac(mask, rect) {
  if (!mask.ps) buildPrefixSum(mask);
  const { gx0, gy0, gx1, gy1 } = gridRectFromScreen(mask, rect);
  const cells = Math.max(0, (gx1 - gx0) * (gy1 - gy0));
  if (!cells) return 0;
  const ones = sumPS(mask, gx0, gy0, gx1, gy1);
  return ones / cells; // fraction in [0,1]
}

// === Interior-water mask with Manhattan distance transform ===
function buildInteriorMask(mask, padPx) {
  const { gw, gh, a, cellPx } = mask; // a[y*gw+x] is 1 for water, 0 for land
  // Distances in grid cells
  const padCells = Math.max(1, Math.ceil(padPx / cellPx));

  // 1) Init dist: 0 on water? (we want distance-from-land) — mark land as 0, water as large
  const INF = 1e9;
  const dist = new Int32Array(gw * gh);
  for (let i = 0; i < gw*gh; i++) dist[i] = a[i] ? INF : 0;

  // 2) Two-pass city-block distance transform
  // Forward pass
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const i = y*gw + x;
      if (dist[i] === 0) continue;
      if (x > 0)   dist[i] = Math.min(dist[i], dist[i-1] + 1);
      if (y > 0)   dist[i] = Math.min(dist[i], dist[i-gw] + 1);
    }
  }
  // Backward pass
  for (let y = gh-1; y >= 0; y--) {
    for (let x = gw-1; x >= 0; x--) {
      const i = y*gw + x;
      if (x+1 < gw) dist[i] = Math.min(dist[i], dist[i+1] + 1);
      if (y+1 < gh) dist[i] = Math.min(dist[i], dist[i+gw] + 1);
    }
  }

  // 3) Interior mask: water AND dist >= padCells
  const interior = new Uint8Array(gw * gh);
  for (let i = 0; i < gw*gh; i++) interior[i] = (a[i] === 1 && dist[i] >= padCells) ? 1 : 0;

  return { ...mask, interior };
}

// === Largest all-ones rectangle on interior mask ===
function largestAllOnesRect(mask) {
  const { gw, gh, interior } = mask;
  const heights = new Int32Array(gw);
  let best = { area: 0, gx0:0, gy0:0, gx1:0, gy1:0 };

  function scanRow(y) {
    const stack = []; // {x, heightStart}
    let x = 0;
    while (x <= gw) {
      const h = (x < gw) ? heights[x] : 0; // sentinel zero
      let start = x;
      while (stack.length && stack[stack.length-1].h > h) {
        const { h:hh, i:s } = stack.pop();
        const area = hh * (x - s);
        if (area > best.area) {
          best = { area, gx0: s, gx1: x, gy0: y - hh, gy1: y };
        }
        start = s;
      }
      stack.push({ h, i:start });
      x++;
    }
  }

  for (let y = 0; y < gh; y++) {
    // build histogram of consecutive interior 1's
    for (let x = 0; x < gw; x++) {
      const i = y*gw + x;
      heights[x] = interior[i] ? heights[x] + 1 : 0;
    }
    scanRow(y+1); // y+1 because heights reflects 1-based height
  }
  return best.area > 0 ? best : null;
}

// === Convert grid rect to screen pixels and validate ===
function gridRectToScreen(mask, r) {
  const { x:mx, y:my } = mask.viewport; // top-left of safe viewport in screen px
  const { cellPx } = mask;
  return {
    x: mx + r.gx0 * cellPx,
    y: my + r.gy0 * cellPx,
    w: (r.gx1 - r.gx0) * cellPx,
    h: (r.gy1 - r.gy0) * cellPx
  };
}

const MIN_W = 120;       // px — or textWidth + padding*2
const MIN_H = 28;        // px — or fontPx + padding*2
const OCEAN_MIN_FRAC = 0.95;  // fallback guard

function chooseOceanRect(mask, padPx) {
  const m = buildInteriorMask(mask, padPx);
  const rGrid = largestAllOnesRect(m);
  if (!rGrid) return null;

  const rect = gridRectToScreen(mask, rGrid);

  // Defensive: reject tiny or partially-wet rectangles
  if (rect.w < MIN_W || rect.h < MIN_H) return null;
  if (waterFrac(mask, rect) < OCEAN_MIN_FRAC) return null; // your prefix-sum version

  return rect;
}



function aspectPenalty(r, strength = 0.6) {
  const ar = r.w / Math.max(1, r.h);
  const dev = Math.abs(Math.log2(ar));
  return 1 / (1 + strength * dev);
}

function cornerRects(safe, pxW, pxH) {
  const { x, y, w, h } = safe;
  const W = Math.min(pxW, w), H = Math.min(pxH, h);
  return [
    { x: x,       y: y,       w: W, h: H },                 // TL
    { x: x+w-W,   y: y,       w: W, h: H },                 // TR
    { x: x,       y: y+h-H,   w: W, h: H },                 // BL
    { x: x+w-W,   y: y+h-H,   w: W, h: H }                  // BR
  ];
}

// === Debug overlay helpers (screen space) ===
function ensureDebugOverlay() {
  const svg = d3.select("svg");
  let o = svg.select("#debug-overlay");
  if (o.empty()) o = svg.append("g")
    .attr("id", "debug-overlay")
    .style("pointer-events", "none");
  return o;
}

function drawDebugRect(kind, r, style={}) {
  const g = ensureDebugOverlay();
  const sel = g.selectAll(`rect.debug-${kind}`).data([r]);
  sel.enter().append("rect").attr("class", `debug-box debug-${kind}`)
    .merge(sel)
    .attr("x", r.x).attr("y", r.y)
    .attr("width", r.w).attr("height", r.h)
    .attr("fill", "none")
    .attr("stroke", style.stroke || "#ff6")
    .attr("stroke-width", style.width || 2)
    .attr("stroke-dasharray", style.dash || "6,4")
    .attr("vector-effect", "non-scaling-stroke");
  sel.exit().remove();
}

/**
 * Build 4 frame rectangles by subtracting land bbox from viewport, choose the best by water content.
 */
function chooseBestFrameRect(viewportRect, landRect, mask, margin = 8) {
  const vX = viewportRect.x, vY = viewportRect.y, vW = viewportRect.w, vH = viewportRect.h;
  const L = landRect ? Math.max(vX, landRect.x - margin) : vX;
  const T = landRect ? Math.max(vY, landRect.y - margin) : vY;
  const R = landRect ? Math.min(vX + vW, landRect.x + landRect.w + margin) : vX + vW;
  const B = landRect ? Math.min(vY + vH, landRect.y + landRect.h + margin) : vY + vH;

  const frames = [
    { x: vX, y: vY, w: vW,         h: Math.max(0, T - vY),          side: "top"    },
    { x: vX, y: B,  w: vW,         h: Math.max(0, vY + vH - B),     side: "bottom" },
    { x: vX, y: T,  w: Math.max(0, L - vX),   h: Math.max(0, B - T), side: "left"   },
    { x: R,  y: T,  w: Math.max(0, vX + vW - R), h: Math.max(0, B - T), side: "right"  },
  ].filter(r => r.w > 24 && r.h > 24);

  if (!frames.length) return null;

  const arPenalty = (r) => {
    const ar = r.w / Math.max(1, r.h);
    const dev = Math.abs(Math.log2(ar));
    return 1 / (1 + OCEAN_AR_PENALTY * dev);
  };

  let best = null;
  for (const r of frames) {
    const wf = waterFrac(mask, r);              // ← uses corrected water fraction
    if (wf < OCEAN_MIN_WATER_FRAC) continue;    // hard reject
    const score = Math.pow(wf, 2) * r.w * r.h * arPenalty(r);
    r.__wf = wf; r.__score = score;
    if (!best || score > best.__score) best = r;
  }
  console.log("[ocean][frame:score]", frames.map(f => ({ side: f.side, wf: +(f.__wf||0).toFixed(2), score: Math.round(f.__score||0) })));
  return best ? best : null;
}

// If a frame is too skinny, generate sub-rect candidates and choose the best by layout score.
function refineRectForLabel(rect, label, k, scorerOpts = {}, _safeVP = null, _satMask = null) {
  const AR_MIN = 0.6, AR_MAX = 2.0; // allow up to ~2:1 or 1:2; beyond this we try to refine
  const ar = rect.w / Math.max(1e-6, rect.h);
  const candidates = [rect];

  const push = (r) => { if (r && r.w > 20 && r.h > 20) candidates.push(r); };

  // Target more compact sub-rect centered inside the frame (limit major axis)
  if (ar > AR_MAX) {
    // too wide: limit width to AR_MAX * h
    const maxW = Math.min(rect.w, AR_MAX * rect.h);
    const x = rect.x + (rect.w - maxW) / 2;
    push({ x, y: rect.y, w: maxW, h: rect.h });
  } else if (ar < AR_MIN) {
    // too tall: limit height to w / AR_MIN
    const maxH = Math.min(rect.h, rect.w / AR_MIN);
    const y = rect.y + (rect.h - maxH) / 2;
    push({ x: rect.x, y, w: rect.w, h: maxH });
  }

  // 2×2 quadrants inside the frame
  const qW = rect.w / 2, qH = rect.h / 2;
  push({ x: rect.x,        y: rect.y,        w: qW, h: qH });
  push({ x: rect.x + qW,   y: rect.y,        w: qW, h: qH });
  push({ x: rect.x,        y: rect.y + qH,   w: qW, h: qH });
  push({ x: rect.x + qW,   y: rect.y + qH,   w: qW, h: qH });

  // Sliding windows along major axis (3 positions)
  if (rect.w >= rect.h) {
    const sw = Math.min(rect.w, Math.max(rect.h * 1.5, rect.w * 0.4));
    const step = (rect.w - sw) / 2; // left, center, right
    push({ x: rect.x,          y: rect.y, w: sw, h: rect.h });
    push({ x: rect.x + step,   y: rect.y, w: sw, h: rect.h });
    push({ x: rect.x + 2*step, y: rect.y, w: sw, h: rect.h });
  } else {
    const sh = Math.min(rect.h, Math.max(rect.w * 1.5, rect.h * 0.4));
    const step = (rect.h - sh) / 2; // top, middle, bottom
    push({ x: rect.x, y: rect.y,            w: rect.w, h: sh });
    push({ x: rect.x, y: rect.y + step,     w: rect.w, h: sh });
    push({ x: rect.x, y: rect.y + 2*step,   w: rect.w, h: sh });
  }

  // Score all candidates via Step-1 scorer; pick the best
  let bestEntry = null;
  for (const c of candidates) {
    const ci = intersectRect(c, _safeVP); // keep inside safe viewport
    if (ci.w < 20 || ci.h < 20) continue;
    const fit = computeBestLayout(ci, label, k, scorerOpts);
    const wf = waterFrac(_satMask, ci);
    if (wf < OCEAN_MIN_WATER_FRAC) continue; // hard reject any land touch
    if (fit?.ok) {
      // Prefer waterier rects if mask is available
      const score = fit.score * Math.pow(Math.max(0.001, wf), 0.35); // wf^0.35 ~ strong nudge
      const entry = { rect: ci, best: { ...fit, score }, wf };
      if (!bestEntry || score > bestEntry.best.score) bestEntry = entry;
    }
  }
  return bestEntry || { rect, best: computeBestLayout(rect, label, k, scorerOpts) };
}

/**
 * Place ocean label in a frame rectangle.
 */
function placeOceanLabelInRect(rect, label, k) {
  const g = ensureOceanLabelGroup();
  g.selectAll("g.ocean-label.frame-candidate").remove();

  const cx = rect.x + rect.w/2;
  const cy = rect.y + rect.h/2;
  const fontPx = Math.max(12, Math.min(28, Math.min(rect.w/10, rect.h/2)));

  const node = g.append("g")
    .attr("class", "ocean-label frame-candidate")
    .attr("transform", `translate(${cx},${cy}) scale(${1 / k})`)
    .style("pointer-events", "none")
    .style("opacity", 0.92);

  node.append("text")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central")
    .attr("class", "label water ocean")
    .style("font-style", "italic")
    .style("letter-spacing", "0.08em")
    .style("font-size", `${fontPx}px`)
    .text(label);

  console.log("[ocean][frame] placed in", rect);
}

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

      // Rebuild water anchors after reclassification
      const waterAnchors = buildWaterAnchors({
        components: water.components,
        polygons: window.currentPolygons,
        mapW: mapW,
        mapH: mapH
      });
      window.__waterAnchors = waterAnchors;

      const count = k => refined.filter(a => a.kind === k).length;
      console.log("[water:tune]", {
        params: { seaLevel, seaAreaPx, seaFrac, quant },
        components: {
          total: water.components.length,
          oceans: water.components.filter(c => c.kind === "ocean").length,
          seas:   water.components.filter(c => c.kind === "sea").length,
          lakes:  water.components.filter(c => c.kind === "lake").length
        },
        anchors: { ocean: count("ocean"), sea: count("sea"), lake: count("lake") },
        waterAnchors: {
          oceans: waterAnchors.anchors.filter(a => a.kind === "ocean").length,
          seas: waterAnchors.anchors.filter(a => a.kind === "sea").length,
          lakes: waterAnchors.anchors.filter(a => a.kind === "lake").length,
          total: waterAnchors.anchors.length
        }
      });

      // Keep QA in sync after reclassification
      if (window.syncQACandidates) window.syncQACandidates(window.getZoomScale?.() ?? 1);
      if (window.syncQACollision) window.syncQACollision(window.getZoomScale?.() ?? 1);

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
  seaLevel: DEFAULT_SEA_LEVEL
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
  // ── Dedupe (super rare, but protects against degenerate duplicates)
  {
    const seen = new Set();
    samples = samples.filter(p => {
      const key = (p[0].toFixed(3) + "," + p[1].toFixed(3));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  // ── Guard: ensure a usable number of samples; retry once with a slightly smaller radius
  if (samples.length < 20) {
    console.warn(`[guard] too few samples (${samples.length}); retrying with smaller radius`);
    const retryRadius = Math.max(1, sizeInput.valueAsNumber * 0.8);
    const retrySampler = poissonDiscSampler(mapWidth, mapHeight, retryRadius, rng);
    samples = [];
    for (let s; (s = retrySampler()); ) samples.push(s);
  }
  if (samples.length < 3) {
    console.error(`[guard] still too few samples (${samples.length}); aborting generation`);
    return;
  }
  // Voronoi D3
  let diagram, polygons;
  ({ diagram, polygons } = buildVoronoi(samples, mapWidth, mapHeight));
  // ── Sanity: polygon count should match sample count
  if (!Array.isArray(polygons) || polygons.length !== samples.length) {
    console.warn(`[guard] polygons mismatch: samples=${samples.length}, polygons=${polygons && polygons.length}`);
  }
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
    
    // NOTE: Do not reference `seaLevel` as a free variable inside generate() or nested callbacks.
    // Always use the captured `sl` defined below.
    
    // Resolve once per run and capture for nested callbacks/promises.
    const seaLevel = resolveSeaLevel(window.__mapState, options);
    const sl = seaLevel; // stable capture

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
      
      // More aggressive spacing for noticeable refinement:
      const targetSpacing = Math.max(4, sizeInput.valueAsNumber * 0.4);
      const minSpacingFactor = 0.6;

      const refined = refineCoastlineAndRebuild({
        samples,
        diagram,
        polygons,
        mapWidth,
        mapHeight,
        seaLevel: DEFAULT_SEA_LEVEL,
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
      seaLevel: DEFAULT_SEA_LEVEL
    });

    const water = computeWaterComponentsTopo({
      polygons: window.currentPolygons,
      width: mapW,
      height: mapH,
      seaLevel: DEFAULT_SEA_LEVEL,
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

    // Build one anchor per water component (ocean, sea, lake)
    const waterAnchors = buildWaterAnchors({
      components: water.components,
      polygons: window.currentPolygons,
      mapW: mapWidth,
      mapH: mapHeight
    });

    const waterAnchorsStyled = attachStyles(waterAnchors);

    window.__waterAnchors = waterAnchors;
    window.__waterAnchorsStyled = waterAnchorsStyled;

    // QA overlay: render water component centroids if flag is present
    if (hasFlag('qaCentroids')) {
      const svgNode = (typeof svg !== 'undefined' && svg.node) ? svg : d3.select('svg');
      renderQAWaterAnchors(svgNode, window.__waterAnchorsStyled || window.__waterAnchors || []);
      console.log("[qa] water centroid markers rendered:", (window.__waterAnchors || []).length);
    }

    console.log("[water:anchors] built", {
      oceans: waterAnchors.filter(a => a.kind === 'ocean').length,
      seas: waterAnchors.filter(a => a.kind === 'sea').length,
      lakes: waterAnchors.filter(a => a.kind === 'lake').length,
      total: waterAnchors.length
    }, { sample: waterAnchorsStyled.slice(0, 5).map(a => ({ id:a.id, kind:a.kind })) });

    // Live reclassification helper moved to global scope

    const styledAnchors = attachStyles(refined);

    window.__anchorsEnriched = enriched;
    window.__anchorsRefined  = refined;
    window.__anchorsStyled   = styledAnchors;

    // Step 4: LOD bands (data-only)
    // Combine general proto anchors + inland water anchors (both already styled)
    const combinedStyled = [
      ...(window.__anchorsStyled || []),
      ...(window.__waterAnchorsStyled || []),
    ];

    const anchorsLOD = computeLOD({
      anchors: combinedStyled,
      // QA-friendly visibility: ocean earliest, lakes last
      minKByKind: {
        ocean: 1.0,
        sea:   1.1,
        lake:  1.2,
      },
    });
    window.__anchorsLOD = anchorsLOD;
    
    // Expose visibleAtK for console debugging
    window.visibleAtK = (arr, k) => visibleAtK(arr, k);

    console.log("[lod] sample",
      anchorsLOD.slice(0, 5).map(a => ({ id:a.id, kind:a.kind, tier:a.tier, minK:a.lod.minK }))
    );
    console.log("[lod] counts", {
      total: anchorsLOD.length,
      at_k1: visibleAtK(anchorsLOD, 1.0).length,
      at_k8: visibleAtK(anchorsLOD, 8.0).length,
    });

    // ---- QA dots (respect LOD) ----
    // Expose an updater used by the zoom handler
    window.syncQADotsLOD = (k = 1.0) => {
      if (!hasFlag('qaCentroids')) return;
      const svgNode = (typeof svg !== 'undefined' && svg.node) ? svg : d3.select('svg');

      // show only water dots that are visible at k: ocean, sea, lake
      const waterOnly = anchorsLOD.filter(a => a.kind === 'ocean' || a.kind === 'sea' || a.kind === 'lake');
      const visible = visibleAtK(waterOnly, k);

      renderQAWaterAnchors(svgNode, visible);
      syncQAWaterRadius(svgNode, k, 3); // keep ~constant screen size
    };

    // initial render (before the first zoom event fires)
    if (hasFlag('qaCentroids')) {
      window.syncQADotsLOD(1.0);
      console.log("[qa] water centroid markers rendered (LOD @k=1.0):",
        (visibleAtK(anchorsLOD.filter(a=>a.kind==='ocean'||a.kind==='sea'||a.kind==='lake'), 1.0)).length
      );
    }

    // Step 5: candidates + QA rectangles (optional)
    // Expose a sync used by zoom handler
    window.syncQACandidates = (k = 1.0) => {
      if (!hasFlag('qaCandidates')) return;
      const cands = makeCandidates({ anchorsLOD: window.__anchorsLOD, k });
      window.__candidates = cands; // for console poking
      const svgNode = (typeof svg !== 'undefined' && svg.node) ? svg : d3.select('svg');
      renderQACandidates(svgNode, cands);
    };

    // initial draw (pre-zoom) – matches your QA dots flow
    if (hasFlag('qaCandidates')) {
      window.syncQACandidates(1.0);
      console.log("[qa] candidate rects @k=1.0:", (window.__candidates || []).length);
    }

    // Expose clear function globally for QA testing
    window.clearQACandidates = clearQACandidates;

    // Step 6: Greedy collision pruning + QA visualization
    // Expose a sync used by zoom handler
    window.syncQACollision = (k = 1.0) => {
      if (!hasFlag('qaCollide')) return;
      
      // Keep the candidates strictly component-based, and handle empty gracefully
      const allWater = window.__waterAnchors || [];
      if (!allWater.length) {
        console.warn('[qa:collide] no __waterAnchors; skip');
        window.__candidates = [];
        window.__placed = [];
        window.__rejected = [];
        const svgNode = (typeof svg !== 'undefined' && svg.node) ? svg : d3.select('svg');
        renderQACollision?.(svgNode, [], []);
        return;
      }
      
      const waterLOD = window.visibleAtK ? visibleAtK(allWater, k)
                                         : allWater.filter(a => !a.lod || (a.lod.minK <= k && k <= a.lod.maxK));
      const cands = makeCandidates({ anchorsLOD: waterLOD, k });
      
      // Cache for debugging
      window.__waterAnchorsLOD = waterLOD;
      
      const { placed, rejected } = greedyPlace(cands, { cell: 64 });
      window.__candidates = cands;
      window.__placed = placed;
      window.__rejected = rejected;

      const svgNode = (typeof svg !== 'undefined' && svg.node) ? svg : d3.select('svg');
      renderQACollision?.(svgNode, placed, rejected);

      console.log("[qa:collide] k=%s placed=%d rejected=%d", k.toFixed(2), placed.length, rejected.length);
    };

    // initial draw (optional)
    if (hasFlag('qaCollide')) {
      window.syncQACollision(1.0);
    }

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
    seaLevel: DEFAULT_SEA_LEVEL,
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
      
      // after autofit success:
      if (window.syncQADotsLOD)    window.syncQADotsLOD(getZoomScale());
      if (window.syncQACandidates) window.syncQACandidates(getZoomScale());
      if (window.syncQACollision)  window.syncQACollision(getZoomScale());
      
      // Set flag to prevent re-fitting after autofit
      state.didAutofitToLand = true;
      
      // Mark zoom as locked to enable LOD filtering
      d3.select("svg").attr("data-zoom-locked", "1");
      
      // Lock zoom to prevent zooming out beyond autofit level
      lockZoomToAutofitLevel();
      
      // Now place ocean labels with the correct post-autofit bounds
      // Wait for zoom settle, then place (still cancellable by epoch)
      (function scheduleOceanAfterAutofit() {
        const epochAtSchedule = getPlacementEpoch?.() ?? 0;
        console.log("[ocean] Waiting for zoom settle before placement…");
        waitForZoomSettle({ epsilon: 1e-4, stableFrames: 2, maxWait: 1500 })
          .then(() => {
            const nowEpoch = getPlacementEpoch?.() ?? 0;
            if (nowEpoch !== epochAtSchedule) {
              console.log("[ocean] Skip placement (stale epoch after settle)", { epochAtSchedule, nowEpoch });
              return;
            }
            deferOceanPlacement(() => {
              const stillEpoch = getPlacementEpoch?.() ?? 0;
              if (stillEpoch !== epochAtSchedule) {
                console.log("[ocean] Skip idle callback (stale after settle defer)", { epochAtSchedule, stillEpoch });
                return;
              }
              placeOceanLabelsAfterAutofit();
            }, { timeout: 0, fallbackDelay: 0 }); // run next idle tick after settle
          });
      })();
      
    } catch (error) {
      console.warn('[autofit] Method 1 failed, falling back to Method 2:', error);
      
      // Method 2: Transition event handling
      try {
        console.log('[autofit] 🔄 Method 2: Using transition event handling...');
        
        // Create a transition and set up event handlers
        const tr = svgSel.transition().duration(600);
        
        // Set up transition event handlers
        tr.on('end.placeOcean.autofit', () => {
          (function scheduleOceanAfterAutofit() {
            const epochAtSchedule = getPlacementEpoch?.() ?? 0;
            console.log("[ocean] Waiting for zoom settle before placement…");
            waitForZoomSettle({ epsilon: 1e-4, stableFrames: 2, maxWait: 1500 })
              .then(() => {
                const nowEpoch = getPlacementEpoch?.() ?? 0;
                if (nowEpoch !== epochAtSchedule) {
                  console.log("[ocean] Skip placement (stale epoch after settle)", { epochAtSchedule, nowEpoch });
                  return;
                }
                deferOceanPlacement(() => {
                  const stillEpoch = getPlacementEpoch?.() ?? 0;
                  if (stillEpoch !== epochAtSchedule) {
                    console.log("[ocean] Skip idle callback (stale after settle defer)", { epochAtSchedule, stillEpoch });
                    return;
                  }
                  placeOceanLabelsAfterAutofit();
                }, { timeout: 0, fallbackDelay: 0 }); // run next idle tick after settle
              });
          })();
        });
        tr.on('interrupt.placeOcean.autofit', () => {
          (function scheduleOceanAfterAutofit() {
            const epochAtSchedule = getPlacementEpoch?.() ?? 0;
            console.log("[ocean] Waiting for zoom settle before placement…");
            waitForZoomSettle({ epsilon: 1e-4, stableFrames: 2, maxWait: 1500 })
              .then(() => {
                const nowEpoch = getPlacementEpoch?.() ?? 0;
                if (nowEpoch !== epochAtSchedule) {
                  console.log("[ocean] Skip placement (stale epoch after settle)", { epochAtSchedule, nowEpoch });
                  return;
                }
                deferOceanPlacement(() => {
                  const stillEpoch = getPlacementEpoch?.() ?? 0;
                  if (stillEpoch !== epochAtSchedule) {
                    console.log("[ocean] Skip idle callback (stale after settle defer)", { epochAtSchedule, stillEpoch });
                    return;
                  }
                  placeOceanLabelsAfterAutofit();
                }, { timeout: 0, fallbackDelay: 0 }); // run next idle tick after settle
              });
          })();
        }); // safety
        
        // Start the autofit
        await window.fitLand();
        
        // after autofit success:
        if (window.syncQADotsLOD)    window.syncQADotsLOD(getZoomScale());
        if (window.syncQACandidates) window.syncQACandidates(getZoomScale());
        if (window.syncQACollision)  window.syncQACollision(getZoomScale());
        
        // Mark zoom as locked to enable LOD filtering
        d3.select("svg").attr("data-zoom-locked", "1");
        
        // Lock zoom to prevent zooming out beyond autofit level
        lockZoomToAutofitLevel();
        
      } catch (error2) {
        console.warn('[autofit] Method 2 failed, falling back to Method 3:', error2);
        
        // Method 3: Direct call with afterLayout fallback
        console.log('[autofit] 🔄 Method 3: Using afterLayout fallback...');
        await window.fitLand();
        
        // after autofit success:
        if (window.syncQADotsLOD)    window.syncQADotsLOD(getZoomScale());
        if (window.syncQACandidates) window.syncQACandidates(getZoomScale());
        if (window.syncQACollision)  window.syncQACollision(getZoomScale());
        
        // Mark zoom as locked to enable LOD filtering
        d3.select("svg").attr("data-zoom-locked", "1");
        
        // Lock zoom to prevent zooming out beyond autofit level
        lockZoomToAutofitLevel();
        
        afterLayout(() => {
          (function scheduleOceanAfterAutofit() {
            const epochAtSchedule = getPlacementEpoch?.() ?? 0;
            console.log("[ocean] Waiting for zoom settle before placement…");
            waitForZoomSettle({ epsilon: 1e-4, stableFrames: 2, maxWait: 1500 })
              .then(() => {
                const nowEpoch = getPlacementEpoch?.() ?? 0;
                if (nowEpoch !== epochAtSchedule) {
                  console.log("[ocean] Skip placement (stale epoch after settle)", { epochAtSchedule, nowEpoch });
                  return;
                }
                deferOceanPlacement(() => {
                  const stillEpoch = getPlacementEpoch?.() ?? 0;
                  if (stillEpoch !== epochAtSchedule) {
                    console.log("[ocean] Skip idle callback (stale after settle defer)", { epochAtSchedule, stillEpoch });
                    return;
                  }
                  placeOceanLabelsAfterAutofit();
                }, { timeout: 0, fallbackDelay: 0 }); // run next idle tick after settle
              });
          })();
        });
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
      
      // ── Step 0: Clean placement state (epoch bump, cancel, DOM clear, store reset)
      step0ClearAfterAutofit();
    }
  }

  // Check if ocean placement should be immediate (e.g., user is actively interacting)
  function shouldPlaceImmediately() {
    // Check if user is actively interacting
    const isUserInteracting = document.hasFocus() && (
      // Mouse movement in last 100ms
      (window.lastMouseMove && Date.now() - window.lastMouseMove < 100) ||
      // Touch events in last 100ms  
      (window.lastTouchEvent && Date.now() - window.lastTouchEvent < 100) ||
      // Scroll events in last 100ms
      (window.lastScrollEvent && Date.now() - window.lastScrollEvent < 100)
    );
    
    // Check if we're in a critical rendering phase
    const isCriticalPhase = window.state?.isRendering || window.state?.isGenerating;
    
    return isUserInteracting || isCriticalPhase;
  }

  // Centralized ocean placement scheduling via core/idle.js
  // - Cancels any pending schedule before scheduling a new one
  // - Uses requestIdleCallback when available, with strict IdleRequestOptions
  // - Falls back to setTimeout otherwise
  function deferOceanPlacement(callback, options = {}) {
    const { immediate = false, timeout = 1000, fallbackDelay = 16 } = options;

    // Capture current epoch at schedule time
    const epochAtSchedule = getPlacementEpoch?.() ?? __placementEpoch ?? 0;

    // Cancel any previous scheduling to avoid duplicate runs
    if (_oceanIdleHandle) {
      cancelIdle(_oceanIdleHandle);
      _oceanIdleHandle = null;
    }

    const needsImmediate = immediate || shouldPlaceImmediately();
    if (needsImmediate) {
      console.log('[ocean] Immediate placement (blocking) - user interaction or critical phase');
      // Ignore if epoch changed since scheduling request
      const nowEpoch = getPlacementEpoch?.() ?? __placementEpoch ?? 0;
      if (nowEpoch === epochAtSchedule) callback();
      return;
    }

    _oceanIdleHandle = deferIdle(() => {
      _oceanIdleHandle = null; // clear after run
      // Ignore late callback from previous epoch
      const nowEpoch = getPlacementEpoch?.() ?? __placementEpoch ?? 0;
      if (nowEpoch !== epochAtSchedule) {
        console.log("[step0] Skip idle callback from stale epoch", { epochAtSchedule, nowEpoch });
        return;
      }
      callback();
    }, { timeout, fallbackDelay });

    if (_oceanIdleHandle?.type === 'ric') {
      console.log(`[ocean] Deferred placement to idle time (timeout: ${timeout}ms)`);
    } else {
      console.log(`[ocean] Deferred placement with setTimeout (${fallbackDelay}ms)`);
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
  
  // Old labeling system removed - ocean placement now happens inside placeOceanLabelsAfterAutofit()
    
    // --- Shared labels store (debug-friendly) ---
    // Helper (global; keep in sync with labels.js logic)
    function isOceanFeature(d) {
      return d && (d.type === 'ocean' || d.kind === 'ocean' || d.isOcean === true);
    }
    
    (function updateLabelsStore(){
      if (!window.__labelsStoreMeta) window.__labelsStoreMeta = {};

      // Store the array used for rendering labels (ALL features)
      // Merge-safe: preserve existing structure when updating
      const next = Array.isArray(featureLabels) ? featureLabels : [];
      const oceanCount = next.filter(isOceanFeature).length;
      
      // Update the hoisted module-scoped store using the merge-safe helper
      const storePayload = {
        oceans: Array.isArray(next) ? next.filter(isOceanFeature) : [],
        nonOcean: Array.isArray(next) ? next.filter(f => !isOceanFeature(f)) : [],
        raw: next
      };
      
      setFeatureLabelsStore(storePayload);
      
      // Also update window.__labelsStore for backward compatibility
      window.__labelsStore = __labelsStore;
      
      window.__labelsStoreMeta.lastSet = {
        total: __labelsStore.total,
        ocean: oceanCount,
        nonOcean: __labelsStore.nonOcean.length,
      };
      console.log('[store] set __labelsStore', window.__labelsStoreMeta.lastSet);
    })();
    
    // --- Stabilize feature keys for joins ---
    (function stabilizeLabelIds(){
      const store = __labelsStore?.raw || __labelsStore || [];
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
    
    // Ocean placement logic moved to placeOceanLabelsAfterAutofit() - now happens after zoom settle
    if (false) { // Disabled - moved to placeOceanLabelsAfterAutofit()
      console.log('[ocean] 🎯 Placing ocean labels after autofit with correct bounds');
      
      // Get the viewport bounds in screen coordinates (for SAT-based placement)
      const viewportBounds = getViewportBounds(0);
      
      console.log('[ocean] DEBUG: Viewport bounds (screen coordinates):', {
        bounds: viewportBounds,
        svgWidth: mapWidth,
        svgHeight: mapHeight
      });
      const _viewport = rectFromViewport(mapWidth, mapHeight);
      const _insetPx  = computeMapInsetPx(mapWidth, mapHeight);
      const _safeVP   = shrinkRect(_viewport, _insetPx);
      console.log('[ocean] DEBUG: Safe viewport (inset)', { inset: _insetPx, safe: _safeVP });
      
      // Guard call order - don't run rectangle search until accessor exists
      if (typeof state.getCellAtXY !== 'function') {
        console.warn('[ocean] getCellAtXY not ready; using fallback circle-based placement.');
        
        // Fallback to circle-based placement
        for (const oceanLabel of oceans) {
          const t = d3.zoomTransform(svgSel.node());
          const [x0, y0, x1, y1] = getVisibleWorldBoundsFromLabels(svgSel, mapWidth, mapHeight);
          const visibleWorld = [x0, y0, x1, y1];
          const paddedBounds = padBounds(visibleWorld, 32, t.k);
          
          // Create water test function for this ocean label
          const isWaterAt = makeIsWater((x, y) => diagram.find(x, y), DEFAULT_SEA_LEVEL);
          
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
        
        // --- PRECONDITION DEBUG (SAT inputs) ---
        const primary = oceans?.[0];
        const NA = normalizeOceanAnchor(primary);
        const _k = NA.k;
        const _minPx = 12;       // whatever your current min font px is (log it; do not change logic)
        const _maxPx = 24;       // whatever your current max font px is (log it; do not change logic)
        const _minRectW = 80;    // example: SAT min rect width in px (if you have a constant, log that instead)
        const _minRectH = 18;    // example: SAT min rect height in px (ditto)
        console.log("[ocean][sat:pre]", {
          k: _k,
          anchor: {
            id: NA.id, label: NA.label,
            cxW: NA.cxW, cyW: NA.cyW,
            cxS: NA.cxS, cyS: NA.cyS,
            bboxWorld: NA.bboxWorld, bboxScreen: NA.bboxScreen
          },
          thresholds: { _minPx, _maxPx, _minRectW, _minRectH }
        });
        drawOceanDebugDot(NA.cxS ?? NA.cxW, NA.cyS ?? NA.cyW, "anchor-center");
        
        // Calculate dynamic step size based on viewport dimensions
        const vw = viewportBounds[2] - viewportBounds[0];
        const vh = viewportBounds[3] - viewportBounds[1];
        const maxDim = Math.max(vw, vh);
        const step = Math.max(8, Math.min(14, Math.round(maxDim / 120)));
        
        // Use the new SAT-based rectangle finder with viewport bounds
        const pxRect = findOceanLabelRectAfterAutofit(viewportBounds, state.getCellAtXY, DEFAULT_SEA_LEVEL, step, 1, 2.0, 0.6);
        
        // --- RESULT DEBUG ---
        if (!pxRect) {
          console.warn("[ocean][sat:miss] No rectangle returned. Likely causes: too-small ocean area, overly strict min size, or fully blocked mask.");
        } else {
          console.log("[ocean][sat:hit]", { x: pxRect.x, y: pxRect.y, w: pxRect.w, h: pxRect.h });
        }
        
        if (!pxRect) {
          console.warn("[ocean] ❌ No suitable SAT rectangle found; trying frame-based rect.");
          const k = (window.__zoom && window.__zoom.k) || window.zoomK || 1;

          // Access grid data for frame rectangle computation
          const cells = window.currentPolygons || [];
          const getHeight = (i) => cells[i]?.height ?? 0;
          const getXY = (i) => {
            const cell = cells[i];
            if (!cell || !Array.isArray(cell) || cell.length === 0) return [0, 0];
            // Calculate centroid from polygon vertices
            let cx = 0, cy = 0, count = 0;
            cell.forEach(vertex => {
              if (vertex && vertex.length >= 2) {
                cx += vertex[0];
                cy += vertex[1];
                count++;
              }
            });
            return count > 0 ? [cx / count, cy / count] : [0, 0];
          };
          const sl = (typeof resolveSeaLevel === "function")
            ? resolveSeaLevel(window.__mapState, window.__options)
            : (window.DEFAULT_SEA_LEVEL || 0.20);

          const landRect = computeLandBBoxScreen(cells, getHeight, getXY, sl);
          const frame = chooseBestFrameRect(_safeVP, landRect, _satMask, 10);
          if (frame) {
            const refined = refineRectForLabel(frame, NA.label, k, {
              maxPx: 36, minPx: 12, stepPx: 1, padding: 10, letterSpacing: 0.6, family: "serif", lineHeight: 1.2, maxLines: 3
            }, _safeVP, _satMask);
            if (refined?.best?.ok) {
              // Step-1 stash + (if you enabled) Step-2 render uses refined.rect
              const bucket = placementsForCurrentEpoch();
              bucket.ocean = { rect: refined.rect, best: refined.best, k };
              console.log("[step1.5:ocean] refined frame→rect", { original: frame, refined: refined.rect, score: refined.best.score });
              // Optional immediate render if you hooked it up:
              if (typeof step2RenderOceanLabel === "function") step2RenderOceanLabel();

              // Debug draw: outline chosen rect + a center tick; do NOT render final text yet.
              (function debugDraw() {
                const g = ensureOceanLabelGroup();
                g.selectAll("rect.ocean-layout-debug").remove();
                g.selectAll("line.ocean-layout-center").remove();
                g.append("rect")
                  .attr("class", "ocean-layout-debug")
                  .attr("x", refined.rect.x).attr("y", refined.rect.y)
                  .attr("width", refined.rect.w).attr("height", refined.rect.h)
                  .style("fill", "none").style("stroke", "currentColor").style("stroke-width", 1).style("opacity", 0.4);
                g.append("line")
                  .attr("class", "ocean-layout-center")
                  .attr("x1", refined.best.anchor.cx - 6).attr("y1", refined.best.anchor.cy)
                  .attr("x2", refined.best.anchor.cx + 6).attr("y2", refined.best.anchor.cy)
                  .style("stroke", "currentColor").style("opacity", 0.6);
              })();
            }
            return; // Step 1 stops here; Step 2 will render.
          }
          console.warn("[ocean][frame] No frame big enough; falling back to anchor-centered text.");
          // Step 1: compute best layout for fallback (do not render final label yet)
          const fallbackRect = {
            x: (NA.cxS ?? NA.cxW) - 40, y: (NA.cyS ?? NA.cyW) - 20,
            w: 80, h: 40
          };
          const label = NA?.label || "Ocean";
          const best = computeBestLayout(fallbackRect, label, k, {
            maxPx: 36, minPx: 12, stepPx: 1,
            padding: 10, letterSpacing: 0.6, family: "serif", lineHeight: 1.2, maxLines: 3
          });
          if (!best?.ok) {
            console.warn("[step1:ocean] No layout fits fallback rect; keeping center-fallback as a last resort.", { rect: fallbackRect, reason: best?.reason });
          } else {
            const bucket = placementsForCurrentEpoch();
            bucket.ocean = { rect: fallbackRect, best, k };
            console.log("[step1:ocean:best]", { rect: fallbackRect, best });
            step2RenderOceanLabel(); // Optional: auto-render after Step 1

            // Debug draw: outline chosen rect + a center tick; do NOT render final text yet.
            (function debugDraw() {
              const g = ensureOceanLabelGroup();
              g.selectAll("rect.ocean-layout-debug").remove();
              g.selectAll("line.ocean-layout-center").remove();
              g.append("rect")
                .attr("class", "ocean-layout-debug")
                .attr("x", fallbackRect.x).attr("y", fallbackRect.y)
                .attr("width", fallbackRect.w).attr("height", fallbackRect.h)
                .style("fill", "none").style("stroke", "currentColor").style("stroke-width", 1).style("opacity", 0.4);
              g.append("line")
                .attr("class", "ocean-layout-center")
                .attr("x1", best.anchor.cx - 6).attr("y1", best.anchor.cy)
                .attr("x2", best.anchor.cx + 6).attr("y2", best.anchor.cy)
                .style("stroke", "currentColor").style("opacity", 0.6);
            })();
          }
          return; // Step 1 stops here; Step 2 will render.
        }
        
        if (pxRect) {
          console.log(`[ocean] ✅ Using SAT-based placement for ${oceanCount} ocean label(s)`);
          
          // Step 1: compute best layout for SAT rect (do not render final label yet)
          const k = (window.__zoom && window.__zoom.k) || window.zoomK || 1;
          const label = NA?.label || "Ocean";
          const best = computeBestLayout(pxRect, label, k, {
            maxPx: 36, minPx: 12, stepPx: 1,
            padding: 10, letterSpacing: 0.6, family: "serif", lineHeight: 1.2, maxLines: 3
          });
          if (!best?.ok) {
            console.warn("[step1:ocean] No layout fits SAT rect; keeping center-fallback as a last resort.", { rect: pxRect, reason: best?.reason });
          } else {
            const bucket = placementsForCurrentEpoch();
            bucket.ocean = { rect: pxRect, best, k };
            console.log("[step1:ocean:best]", { rect: pxRect, best });
            step2RenderOceanLabel(); // Optional: auto-render after Step 1

            // Debug draw: outline chosen rect + a center tick; do NOT render final text yet.
            (function debugDraw() {
              const g = ensureOceanLabelGroup();
              g.selectAll("rect.ocean-layout-debug").remove();
              g.selectAll("line.ocean-layout-center").remove();
              g.append("rect")
                .attr("class", "ocean-layout-debug")
                .attr("x", pxRect.x).attr("y", pxRect.y)
                .attr("width", pxRect.w).attr("height", pxRect.h)
                .style("fill", "none").style("stroke", "currentColor").style("stroke-width", 1).style("opacity", 0.4);
              g.append("line")
                .attr("class", "ocean-layout-center")
                .attr("x1", best.anchor.cx - 6).attr("y1", best.anchor.cy)
                .attr("x2", best.anchor.cx + 6).attr("y2", best.anchor.cy)
                .style("stroke", "currentColor").style("opacity", 0.6);
            })();
          }
          
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
          
          // Step 1 stops here; Step 2 will render.
          return;

          // Re-apply LOD now that zoom is locked and oceans are placed
          // COMMENTED OUT FOR STEP 1: {
          //   const svg = d3.select('svg');
          //   const k = d3.zoomTransform(svg.node()).k;
          //   const visible = filterByZoom(featureLabels, k);
          //   updateLabelVisibilityWithOptions({ placed: featureLabels, visible });
          // }

          // Draw debug rectangle
          // COMMENTED OUT FOR STEP 1: if (LABEL_DEBUG) drawDebugOceanRect(pxRect);
          // COMMENTED OUT FOR STEP 1: drawOceanDebugRect(pxRect);
          
          // Set up areas layer for non-ocean labels
          // COMMENTED OUT FOR STEP 1: const gAll = svgSel.select('#labels-world-areas');    // islands + lakes (areas layer)
          
          // COMMENTED OUT FOR STEP 1: // Place ocean label in world space using the SAT rectangle
          // COMMENTED OUT FOR STEP 1: if (ocean && pxRect) {
          //   renderOceanInWorld(svgSel, ocean.text);
          //   
          //   // Apply per-label transforms with zoom
          //   const satZoom = d3.zoomTransform(svgSel.node()).k || 1;
          //   updateLabelTransforms(svgSel, satZoom); // After ocean placement, no zoom
          // 
          // COMMENTED OUT FOR STEP 1: // Apply font caps after ocean label is placed (now we can read its size)
          // COMMENTED OUT FOR STEP 1: applyFontCaps();
          // COMMENTED OUT FOR STEP 1: }
          
          // COMMENTED OUT FOR STEP 1: // Guard: if ocean label was placed successfully (has keepWithinRect)
          // COMMENTED OUT FOR STEP 1: // skip re-running global culls to avoid nuking island/lake labels.
          // COMMENTED OUT FOR STEP 1: const okOcean = ocean && ocean.keepWithinRect;
          // COMMENTED OUT FOR STEP 1: if (!okOcean) {
          // COMMENTED OUT FOR STEP 1:   // Now run the normal label system to place all labels including oceans
          // COMMENTED OUT FOR STEP 1:   console.log('[ocean] 🎯 Running normal label system with ocean constraints...');
          // COMMENTED OUT FOR STEP 1:   
          // COMMENTED OUT FOR STEP 1:   // Ensure metrics are computed for the updated ocean labels
          // COMMENTED OUT FOR STEP 1:   ensureMetrics(featureLabels, svgSel);
          // COMMENTED OUT FOR STEP 1:   
          // COMMENTED OUT FOR STEP 1:   // Run collision avoidance (now includes oceans with keepWithinRect)
          // COMMENTED OUT FOR STEP 1:   const placedFeatures = timeit('SA collision avoidance', () => placeLabelsAvoidingCollisions({ svg: svgSel, labels: featureLabels }));
          // COMMENTED OUT FOR STEP 1:   
          // COMMENTED OUT FOR STEP 1:   // Apply LOD filtering after autofit + ocean placement (single pass)
          // COMMENTED OUT FOR STEP 1:   const t = d3.zoomTransform(svgSel.node());
          // COMMENTED OUT FOR STEP 1:   const selected = filterByZoom(placedFeatures, t.k);
          // COMMENTED OUT FOR STEP 1:   
          // COMMENTED OUT FOR STEP 1:   // Render world layer (oceans + lakes + islands) and overlay layer (HUD/debug only)
          // COMMENTED OUT FOR STEP 1:   console.debug('[LOD] non-ocean selected:', selected.length, 'of', placedFeatures.length);
          // COMMENTED OUT FOR STEP 1:   renderWorldLabels(svgSel, selected);
          // COMMENTED OUT FOR STEP 1:   renderOverlayLabels(svgSel, selected);
          // COMMENTED OUT FOR STEP 1:   
          // COMMENTED OUT FOR STEP 1:   
          // COMMENTED OUT FOR STEP 1:   
          // COMMENTED OUT FOR STEP 1:   // Apply per-label transforms with zoom
          // COMMENTED OUT FOR STEP 1:   const saZoom = d3.zoomTransform(svgSel.node()).k || 1;
          // COMMENTED OUT FOR STEP 1:   updateLabelTransforms(svgSel, saZoom); // After SA placement, no zoom
          // COMMENTED OUT FOR STEP 1:   
          // COMMENTED OUT FOR STEP 1:   // Debug logging after SA placement render
          // COMMENTED OUT FOR STEP 1:   if (LABEL_DEBUG) {
          // COMMENTED OUT FOR STEP 1:     const g = gAll.selectAll('g.label');
          // COMMENTED OUT FOR STEP 1:     logProbe('post-SA-render', g);
          // COMMENTED OUT FOR STEP 1:     }
          // COMMENTED OUT FOR STEP 1:   
          // COMMENTED OUT FOR STEP 1:   // Store updated labels (with LOD filtering applied)
          // COMMENTED OUT FOR STEP 1:   window.__labelsPlaced = { features: selected };
          // COMMENTED OUT FOR STEP 1: } else {
          // COMMENTED OUT FOR STEP 1:   console.log('[labels] ok==true; skipping global re-cull BUT re-rendering non-ocean labels');
            






          // COMMENTED OUT FOR STEP 1:   // ---- Instrumented re-render for NON-ocean labels
          // COMMENTED OUT FOR STEP 1:   (function instrumentedNonOceanRerender() {
          // COMMENTED OUT FOR STEP 1: 
          // COMMENTED OUT FOR STEP 1:     // DOM snapshot BEFORE join
          // COMMENTED OUT FOR STEP 1:   const domBefore = {
          // COMMENTED OUT FOR STEP 1:     worldGroups: d3.select('#labels-world').selectAll('g').size(),
          // COMMENTED OUT FOR STEP 1:     oceanGroups: d3.select('#labels-world').selectAll('g.label--ocean').size(),
          // COMMENTED OUT FOR STEP 1:     areaGuess: d3.select('#labels-world-areas').selectAll('g.label').size()
          // COMMENTED OUT FOR STEP 1:   };
          // COMMENTED OUT FOR STEP 1: 
          // COMMENTED OUT FOR STEP 1:   // Source sanity: compare old vs new
          // COMMENTED OUT FOR STEP 1:   console.log('[non-ocean] source sanity', {
          // COMMENTED OUT FOR STEP 1:     fromWindowFeature: (window.featureLabels || []).length,
          // COMMENTED OUT FOR STEP 1:     fromStore: (__labelsStore?.raw || __labelsStore || []).length
          // COMMENTED OUT FOR STEP 1:   });
          // COMMENTED OUT FOR STEP 1: 
          // COMMENTED OUT FOR STEP 1:   // Use the unified store
          // COMMENTED OUT FOR STEP 1:   const nonOceans = (__labelsStore?.raw || __labelsStore || []).filter(f => !isOceanFeature(f));
          // COMMENTED OUT FOR STEP 1: 
          // COMMENTED OUT FOR STEP 1:   // If it's empty, bail early to avoid turning everything into exits
          // COMMENTED OUT FOR STEP 1:   if (!nonOceans.length) {
          // COMMENTED OUT FOR STEP 1:     console.warn('[non-ocean] EMPTY DATA — skipping join to prevent accidental deletions');
          // COMMENTED OUT FOR STEP 1:     return;
          // COMMENTED OUT FOR STEP 1:   }
          // COMMENTED OUT FOR STEP 1: 
          // COMMENTED OUT FOR STEP 1:   console.log('[non-ocean] data before join', {
          // COMMENTED OUT FOR STEP 1:     totalFeatures: (__labelsStore?.raw || __labelsStore || []).length,
          // COMMENTED OUT FOR STEP 1:     nonOceans: nonOceans.length,
          // COMMENTED OUT FOR STEP 1:     domBefore
          // COMMENTED OUT FOR STEP 1:   });
          // COMMENTED OUT FOR STEP 1: 
          // COMMENTED OUT FOR STEP 1:   // Work only inside the non-ocean container
          // COMMENTED OUT FOR STEP 1:   let labelsWorld = d3.select('#labels-world-areas');
          // COMMENTED OUT FOR STEP 1:   if (labelsWorld.empty()) {
          // COMMENTED OUT FOR STEP 1:     console.warn('[non-ocean] #labels-world-areas not found; falling back to #labels-world');
          // COMMENTED OUT FOR STEP 1:     labelsWorld = d3.select('#labels-world'); // last resort
          // COMMENTED OUT FOR STEP 1:   }
          // COMMENTED OUT FOR STEP 1: 
          // COMMENTED OUT FOR STEP 1:   const keyFn = d => d.labelId;
          // COMMENTED OUT FOR STEP 1: 
          // COMMENTED OUT FOR STEP 1:   // JOIN (scoped to the correct parent)
          // COMMENTED OUT FOR STEP 1:   const sel = labelsWorld
          // COMMENTED OUT FOR STEP 1:     .selectAll('.label--area, .label--river, .label--lake, .label--island')
          // COMMENTED OUT FOR STEP 1:     .data(nonOceans, keyFn);
          // COMMENTED OUT FOR STEP 1: 
          // COMMENTED OUT FOR STEP 1:   // EXIT
          // COMMENTED OUT FOR STEP 1:   const sel.exit();
          // COMMENTED OUT FOR STEP 1:   console.log('[non-ocean] exiting count', exitSel.size());
          // COMMENTED OUT FOR STEP 1:   exitSel.each(d => console.log('[non-ocean] removing node', d && d.labelId, d && d.type))
          // COMMENTED OUT FOR STEP 1:          .remove();
          // COMMENTED OUT FOR STEP 1: 
          // COMMENTED OUT FOR STEP 1:   // ENTER
          // COMMENTED OUT FOR STEP 1:   const enterSel = sel.enter();
          // COMMENTED OUT FOR STEP 1:   console.log('[non-ocean] enter count', enterSel.size());
          // COMMENTED OUT FOR STEP 1: 
          // COMMENTED OUT FOR STEP 1:   // Simple append to the non-ocean container (z-order handled by container hierarchy)
          // COMMENTED OUT FOR STEP 1:   const enterG = enterSel.append('g')
          // COMMENTED OUT FOR STEP 1:     .attr('class', d => {
          // COMMENTED OUT FOR STEP 1:       // keep your existing class logic here
          // COMMENTED OUT FOR STEP 1:       // e.g., return `label ${d.kindClass} ${d.tierClass} label--${d.type}`;
          // COMMENTED OUT FOR STEP 1:       return d.class || 'label non-ocean';
          // COMMENTED OUT FOR STEP 1:     });
          // COMMENTED OUT FOR STEP 1: 
          // COMMENTED OUT FOR STEP 1:   // Basic text creation for entered labels
          // COMMENTED OUT FOR STEP 1:   enterG.append('text')
          // COMMENTED OUT FOR STEP 1:     .attr('text-anchor', 'middle')
          // COMMENTED OUT FOR STEP 1:     .attr('dominant-baseline', 'middle')
          // COMMENTED OUT FOR STEP 1:     .style('font-size', '14px')
          // COMMENTED OUT FOR STEP 1:     .style('font-family', 'serif')
          // COMMENTED OUT FOR STEP 1:     .text(d => d.text || d.name || 'Label');
          // COMMENTED OUT FOR STEP 1: 
          // COMMENTED OUT FOR STEP 1:   // UPDATE + MERGE
          // COMMENTED OUT FOR STEP 1:   const merged = enterG.merge(sel);
          // COMMENTED OUT FOR STEP 1: 
          // COMMENTED OUT FOR STEP 1:   // (Optional) if you rely on z-order after update, you can re-assert it safely:
          // COMMENTED OUT FOR STEP 1:   // merged.each(function() { this.parentNode && this.parentNode.appendChild(this); }); // bring to front
          // COMMENTED OUT FOR STEP 1:   // or merged.lower(); // send behind (D3 adds .lower in v5)
          // COMMENTED OUT FOR STEP 1: 
          // COMMENTED OUT FOR STEP 1:   // Post-join integrity logs
          // COMMENTED OUT FOR STEP 1:   const domAfter = {
          // COMMENTED OUT FOR STEP 1:     worldGroups: d3.select('#world').selectAll(':scope > g').size(),
          // COMMENTED OUT FOR STEP 1:     oceanGroups: d3.selectAll('#labels-world-ocean .ocean-label').size(),
          // COMMENTED OUT FOR STEP 1:     nonOceanGroups: d3.selectAll('#labels-world-areas .label').size(),
          // COMMENTED OUT FOR STEP 1:   };
          // COMMENTED OUT FOR STEP 1:   console.log('[non-ocean] after merge size', merged.size());
          // COMMENTED OUT FOR STEP 1:   console.log('[non-ocean] DOM after cleanup', domAfter);

          // COMMENTED OUT FOR STEP 1:     // Also log the join delta with keys for clarity
          // COMMENTED OUT FOR STEP 1:     console.log('[non-ocean] join delta (keys)', {
          // COMMENTED OUT FOR STEP 1:       entered: enterSel.size(),
          // COMMENTED OUT FOR STEP 1:       updated: merged.size() - enterSel.size(),
          // COMMENTED OUT FOR STEP 1:       exiting: 0 // we removed them above
          // COMMENTED OUT FOR STEP 1:     });
          // COMMENTED OUT FOR STEP 1: 
          // COMMENTED OUT FOR STEP 1:     // Explicit z-order (optional, but removes any doubt)
          // COMMENTED OUT FOR STEP 1:     // After your non-ocean join, adjust stacking once, not per label:
          // COMMENTED OUT FOR STEP 1:     svg.select('#labels-world-areas').raise(); // put areas above
          // COMMENTED OUT FOR STEP 1:     svg.select('#labels-world-ocean').lower(); // keep ocean below
          // COMMENTED OUT FOR STEP 1:     // (Flip these if you want oceans on top.)
          // COMMENTED OUT FOR STEP 1: 
          // COMMENTED OUT FOR STEP 1: 
          // COMMENTED OUT FOR STEP 1:   })();
          // COMMENTED OUT FOR STEP 1:   
          // COMMENTED OUT FOR STEP 1:   // Ocean labels are already placed, but we still need to render lakes/islands
          // COMMENTED OUT FOR STEP 1:   // No need to re-run LOD filtering or collision avoidance, but we must render world labels
          // COMMENTED OUT FOR STEP 1:   }

          // COMMENTED OUT FOR STEP 1: // NEW: unconditionally render/update lakes + islands on the world layer.
          // COMMENTED OUT FOR STEP 1: // Apply LOD filtering for the re-render case
          // COMMENTED OUT FOR STEP 1: const t = d3.zoomTransform(svgSel.node());
          // COMMENTED OUT FOR STEP 1: const selected = filterByZoom(featureLabels, t.k);
          // COMMENTED OUT FOR STEP 1: console.debug('[LOD] re-render selected:', selected.length, 'of', featureLabels.length);
          // COMMENTED OUT FOR STEP 1: renderWorldLabels(svgSel, selected);
          // COMMENTED OUT FOR STEP 1: 
          // COMMENTED OUT FOR STEP 1: // Apply per-label transforms with zoom
          // COMMENTED OUT FOR STEP 1: const reRenderZoom = d3.zoomTransform(svgSel.node()).k || 1;
          // COMMENTED OUT FOR STEP 1: updateLabelTransforms(svgSel, reRenderZoom); // After re-render, no zoom
          // COMMENTED OUT FOR STEP 1: 
          // COMMENTED OUT FOR STEP 1: } else {
          // COMMENTED OUT FOR STEP 1:   console.warn('[ocean] ❌ No suitable SAT rectangle found; ocean labels will use default placement.');
          // COMMENTED OUT FOR STEP 1:   
          // COMMENTED OUT FOR STEP 1:   // Set up areas layer for non-ocean labels
          // COMMENTED OUT FOR STEP 1:   const gAll = svgSel.select('#labels-world-areas');    // islands + lakes (areas layer)
          // COMMENTED OUT FOR STEP 1:   
          // COMMENTED OUT FOR STEP 1: // Run normal label system without ocean constraints
          // COMMENTED OUT FOR STEP 1:   console.log('[ocean] 🔄 Running normal label system without ocean constraints...');
          // COMMENTED OUT FOR STEP 1:   
          // COMMENTED OUT FOR STEP 1:   // Ensure metrics are computed
          // COMMENTED OUT FOR STEP 1:   ensureMetrics(featureLabels, svgSel);
          // COMMENTED OUT FOR STEP 1:   
          // COMMENTED OUT FOR STEP 1:   // Run collision avoidance
          // COMMENTED OUT FOR STEP 1:   const placedFeatures = timeit('SA collision avoidance', () => placeLabelsAvoidingCollisions({ svg: svgSel, labels: featureLabels }));
          // COMMENTED OUT FOR STEP 1:   
          // COMMENTED OUT FOR STEP 1:   // Apply LOD filtering after autofit + ocean placement (single pass)
          // COMMENTED OUT FOR STEP 1:   const t = d3.zoomTransform(svgSel.node());
          // COMMENTED OUT FOR STEP 1: const selected = filterByZoom(placedFeatures, t.k);
          // COMMENTED OUT FOR STEP 1:   
          // COMMENTED OUT FOR STEP 1:   // Render world layer (oceans + lakes + islands) and overlay layer (HUD/debug only)
          // COMMENTED OUT FOR STEP 1:   console.debug('[LOD] non-ocean selected:', selected.length, 'of', placedFeatures.length);
          // COMMENTED OUT FOR STEP 1:   renderWorldLabels(svgSel, selected);
          // COMMENTED OUT FOR STEP 1:   renderOverlayLabels(svgSel, selected);
          // COMMENTED OUT FOR STEP 1:   
          // COMMENTED OUT FOR STEP 1:   
          // COMMENTED OUT FOR STEP 1:   
          // COMMENTED OUT FOR STEP 1:   // Apply per-label transforms with zoom
          // COMMENTED OUT FOR STEP 1:   const saPlacementZoom = d3.zoomTransform(svgSel.node()).k || 1;
          // COMMENTED OUT FOR STEP 1:   updateLabelTransforms(svgSel, saPlacementZoom); // After SA placement, no zoom
          // COMMENTED OUT FOR STEP 1:   
          // COMMENTED OUT FOR STEP 1:   // Debug logging after SA placement render
          // COMMENTED OUT FOR STEP 1:   if (LABEL_DEBUG) {
          // COMMENTED OUT FOR STEP 1:     const g = gAll.selectAll('g.label');
          // COMMENTED OUT FOR STEP 1:     logProbe('post-SA-render', g);
          // COMMENTED OUT FOR STEP 1:     }
          // COMMENTED OUT FOR STEP 1:   
          // COMMENTED OUT FOR STEP 1:   // Store updated labels (with LOD filtering applied)
          // COMMENTED OUT FOR STEP 1:   window.__labelsPlaced = { features: selected };
          // COMMENTED OUT FOR STEP 1:         }
      }
    }
  }
  
  // Function definition for placeOceanLabelsAfterAutofit
  function placeOceanLabelsAfterAutofit() {
    // Clear any pre-existing debug marks before computing fresh ones
    clearOceanDebug();
    
    // Fallback: if the legacy store is empty, use the most recently built anchors
    let oceans = oceanLabels;
    let oceanCount = oceanLabels.length;
    
    if (oceanCount === 0) {
      const cached = getLastWaterAnchors?.();
      if (cached?.oceans?.length) {
        console.log("[ocean] Fallback to cached water anchors:", { oceans: cached.oceans.length });
        oceans = cached.oceans;
        oceanCount = oceans.length;
      } else {
        console.warn("[ocean] No oceans available in store or cache — skipping ocean placement this frame.");
        return; // Bail early; nothing to place
      }
    }
    
    console.log('[ocean] DEBUG: After autofit, featureLabels available:', {
      stored: !!window.__featureLabels,
      count: featureLabels.length,
      oceanCount: oceanCount,
      sample: featureLabels.slice(0, 3).map(l => ({ kind: l.kind, text: l.text, x: l.x, y: l.y }))
    });
    
    if (oceanCount > 0) {
      console.log('[ocean] 🎯 Placing ocean labels after autofit with correct bounds');
      
      // Get the viewport bounds in screen coordinates (for SAT-based placement)
      const viewportBounds = getViewportBounds(0);
      
      console.log('[ocean] DEBUG: Viewport bounds (screen coordinates):', {
        bounds: viewportBounds,
        svgWidth: mapWidth,
        svgHeight: mapHeight
      });
      const _viewport = rectFromViewport(mapWidth, mapHeight);
      const _insetPx  = computeMapInsetPx(mapWidth, mapHeight);
      const _safeVP   = shrinkRect(_viewport, _insetPx);
      console.log('[ocean] DEBUG: Safe viewport (inset)', { inset: _insetPx, safe: _safeVP });
      
      // Build screen-space water mask → erode by coast buffer → largest rect
      const cells = window.__mesh?.cells || [];
      const getHeight = (i) => window.__heights?.[i];
      const getXY = (i) => {
        const base = window.__xy?.(i);
        return base ? toScreenXY(base) : null;
      };
      const sl = (typeof resolveSeaLevel === "function")
        ? resolveSeaLevel(window.__mapState, window.__options)
        : (window.DEFAULT_SEA_LEVEL || 0.20);

      // Create height accessor for world coordinates
      const getHeightAtWorld = (X, Y) => {
        // Find closest cell to world coordinate
        let closestDist = Infinity;
        let closestHeight = sl; // default to sea level
        for (let i = 0; i < cells.length; i++) {
          const base = window.__xy?.(i);
          if (!base) continue;
          const [wx, wy] = base; // world coordinates
          const dist = Math.sqrt((wx - X) ** 2 + (wy - Y) ** 2);
          if (dist < closestDist) {
            closestDist = dist;
            closestHeight = getHeight(i);
          }
        }
        return closestHeight;
      };

      const cellPx = 8; // keep your current grid density
      const seaLevel = sl;
      // You already have the settled zoom transform — reuse it:
      const zoom = currentZoomTransform();
      // getHeightAtWorld(X,Y): wire your existing height accessor here
      const mask0 = buildWaterMaskFromHeights(_safeVP, cellPx, zoom, getHeightAtWorld, seaLevel);

      // erode away coast to avoid "kissing" land
      const expectedFontPx = 36; // or compute from longest ocean name + style
      const erodePx = Math.max(6, Math.round(expectedFontPx * 0.45));
      const erodeSteps = Math.max(1, Math.round(erodePx / cellPx));
      const mask = { ...mask0, a: erodeBinary(mask0.a, mask0.gw, mask0.gh, erodeSteps) };

      console.log("[ocean][sat:mask]", { gw: mask.gw, gh: mask.gh, cellPx: mask.cellPx });
      const waterCells = countOnes(mask.a);
      const pct = (100 * waterCells / (mask.gw * mask.gh)).toFixed(1);
      console.log("[ocean][mask:water] cells=", waterCells, `(${pct}%)`);

      // --- NEW: build a summed-area table for fast water fraction queries
      mask.sat = buildSAT(mask.a, mask.gw, mask.gh);
      // Build prefix sum for corrected water fraction calculation
      buildPrefixSum(mask);
      const _satMask = mask; // expose to refiners in this scope
      
      // mask already in screen space; eroded; and mask.sat built
      // Try interior-water rectangle first (guaranteed to stay off coast & land)
      let chosenRect = null;
      let satPick = null;
      {
        const padPx = 10; // label padding + half stroke
        const rect = chooseOceanRect(mask, padPx);
        if (rect) {
          const wf = waterFrac(mask, rect);
          const score = rect.w * rect.h * aspectPenalty(rect, OCEAN_AR_PENALTY);
          satPick = { rect, score, wf };
          console.log("[ocean][interior:largest]", { wf: +wf.toFixed(3), score: Math.round(score), rect });
        } else {
          console.log("[ocean][interior:largest] none");
        }
      }

      if (satPick) chosenRect = satPick.rect;

      if (!chosenRect) {
        const landRect = computeLandBBoxScreen(cells, getHeight, getXY, sl);
        drawDebugBounds(_safeVP, landRect);
        const frame = chooseBestFrameRect(_safeVP, landRect, _satMask, 10);
        if (frame) {
          drawDebugRect("frame", frame, { stroke: "#0ff", dash: "4,2" });
          const k = (window.__zoom && window.__zoom.k) || window.zoomK || 1;
          const label = (window.__oceanName || "Ocean");
          const refined = refineRectForLabel(frame, label, k, {
            maxPx: 36, minPx: 12, stepPx: 1, padding: 10, letterSpacing: 0.6, family: "serif", lineHeight: 1.2, maxLines: 3
          }, _safeVP, _satMask);
          if (refined?.rect) {
            const r = intersectRect(refined.rect, _safeVP);
            if (waterFrac(mask, r) >= OCEAN_MIN_WATER_FRAC) {
              chosenRect = r;
              console.log("[step1.5:ocean] refined frame→rect", { score: refined.best?.score, r });
            } else {
              console.log("[step1.5:ocean] frame rect failed water gate", r);
            }
          }
        }
      }

      if (!chosenRect) {
        // Minimum viable box sized from label shaping / defaults:
        const targetPxH = Math.max(24, Math.round(expectedFontPx * 1.0));
        const targetPxW = Math.max(140, Math.round(targetPxH * 6)); // generous; we'll shrink when rendering
        const cands = cornerRects(_safeVP, targetPxW, targetPxH);
        let best = null;
        for (const r of cands) {
          const wf = waterFrac(mask, r);
          const score = wf * r.w * r.h; // simple: pure water wins, larger wins
          console.log("[ocean][corner]", { wf:+wf.toFixed(3), r });
          if (wf >= OCEAN_MIN_WATER_FRAC && (!best || score > best.score)) best = { r, score };
        }
        if (best) {
          chosenRect = best.r;
          drawDebugRect("corner", chosenRect, { stroke: "#f0f", dash: "2,2" });
        }
      }

      if (!chosenRect) {
        console.warn("[ocean] ❌ No SAT or frame candidate produced a fit; skipping render.");
        return;
      }

      const k = (window.__zoom && window.__zoom.k) || window.zoomK || 1;
      const label = (window.__oceanName || "Ocean");
      const best = computeBestLayout(chosenRect, label, k, {
        maxPx: 36, minPx: 12, stepPx: 1, padding: 10, letterSpacing: 0.6, family: "serif", lineHeight: 1.2, maxLines: 3
      });
      if (!best?.ok) {
        console.warn("[ocean] No layout fits chosen rect; skipping render.", { rect: chosenRect, reason: best?.reason });
        return;
      }
      const bucket = placementsForCurrentEpoch();
      bucket.ocean = { rect: chosenRect, best, k };
      drawDebugRect(satPick ? "interior-largest" : "chosen", chosenRect, { stroke: satPick ? "#ffeb70" : "#6f6", dash: "8,6", width: 2 });
      if (typeof step2RenderOceanLabel === "function") step2RenderOceanLabel();
      return;
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

