// src/ui/layers-panel.js
// Tiny layer visibility switcher. Safe to call multiple times; it reuses the panel.
//
// Expects your SVG structure from ensureLayers (ids like #ocean, #land, #coast, #rivers, #labels),
// plus optional debug layers we create (#layer-temp, #layer-precip).
//
// Usage from main.js:
//   import { initLayersPanel } from "./ui/layers-panel.js";
//   initLayersPanel({ svg: d3.select("svg"), polygons });

import { renderTempDebug, renderPrecipDebug } from "../debug/climate-layers.js";
import { renderScalarOverlay } from "../debug/scalar-overlay.js";
import { renderScalarLegend } from "../debug/scalar-legend.js";

const TARGET_SELECTOR = {
  ocean:   '[data-layer="ocean"], #ocean, .oceanLayer',
  land:    '[data-layer="land"], #land, .mapCells, .islandBack',
  coast:   '[data-layer="coast"], #coast, .coastline, .lakecoast, .shallow',
  rivers:  '[data-layer="rivers"], #rivers',
  labels:  '[data-layer="labels"], #labels',
  temp:    '#layer-temp',
  precip:  '#layer-precip',
  scalar:  '#layer-scalar',
  biomes:  '[data-layer="biomes"], #biomes'
};

function setVisible(selector, on) {
  if (!selector) return;
  d3.selectAll(selector).style("display", on ? null : "none");
}

export function initLayersPanel({ svg, polygons, seaLevel }) {
  const panel = document.getElementById("layerPanel");
  if (!panel) return;

  // Ensure debug groups exist (empty until first render)
  const world = d3.select("#world");
  if (world.empty()) return; // world group created by ensureLayers

  let gTemp = world.select("#layer-temp");
  if (gTemp.empty()) gTemp = world.append("g").attr("id", "layer-temp").attr("data-layer", "temp").style("display", "none");

  let gPrec = world.select("#layer-precip");
  if (gPrec.empty()) gPrec = world.append("g").attr("id", "layer-precip").attr("data-layer", "precip").style("display", "none");

  let gScalar = world.select("#layer-scalar");
  if (gScalar.empty()) gScalar = world.append("g").attr("id", "layer-scalar").attr("data-layer", "scalar").style("display", "none");

  // Get legend container
  const legendContainer = document.getElementById("scalarLegend");

  // Wire checkboxes
  panel.querySelectorAll('input[type="checkbox"][data-target]').forEach(cb => {
    const name = cb.getAttribute("data-target");
    const selector = TARGET_SELECTOR[name];

    // Initial state
    setVisible(selector, cb.checked);

    cb.addEventListener("change", () => {
      if (name === "temp") {
        if (cb.checked) renderTempDebug(polygons, gTemp);
        setVisible(selector, cb.checked);
      } else if (name === "precip") {
        if (cb.checked) renderPrecipDebug(polygons, gPrec);
        setVisible(selector, cb.checked);
      } else if (name === "scalar") {
        if (cb.checked) {
          const field = (panel.querySelector("#scalarField")?.value) || "height";
          renderScalarOverlay(polygons, gScalar, { field, seaLevel });
          renderScalarLegend(polygons, seaLevel, field, legendContainer);
        } else {
          if (legendContainer) legendContainer.style.display = "none";
        }
        setVisible(selector, cb.checked);
      } else {
        setVisible(selector, cb.checked);
      }
    });
  });

  // Bulk buttons
  const hideAll = document.getElementById("layersHideAll");
  const showAll = document.getElementById("layersShowAll");
  function setAll(state) {
    panel.querySelectorAll('input[type="checkbox"][data-target]').forEach(cb => {
      cb.checked = state;
      const name = cb.getAttribute("data-target");
      const selector = TARGET_SELECTOR[name];
      if ((name === "temp" || name === "precip") && state) {
        // lazily render on first time visible
        if (name === "temp") renderTempDebug(polygons, gTemp);
        if (name === "precip") renderPrecipDebug(polygons, gPrec);
      }
      if (name === "scalar" && state) {
        const field = (panel.querySelector("#scalarField")?.value) || "height";
        renderScalarOverlay(polygons, gScalar, { field, seaLevel });
        renderScalarLegend(polygons, seaLevel, field, legendContainer);
      }
      setVisible(selector, state);
    });
  }
  hideAll?.addEventListener("click", () => setAll(false));
  showAll?.addEventListener("click", () => setAll(true));

  // Re-render scalar overlay when field changes (if visible)
  const fieldSel = panel.querySelector("#scalarField");
  if (fieldSel) {
    fieldSel.addEventListener("change", () => {
      const visible = window.getComputedStyle(gScalar.node()).display !== "none";
      if (visible) {
        renderScalarOverlay(polygons, gScalar, { field: fieldSel.value, seaLevel });
        renderScalarLegend(polygons, seaLevel, fieldSel.value, legendContainer);
      }
    });
  }

  // Small debug hook
  window.LayerPanelDebug = { setVisible, TARGET_SELECTOR };
}
