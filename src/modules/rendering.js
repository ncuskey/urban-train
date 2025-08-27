// js/modules/rendering.js
// NOTE: d3 is global; do not import it here.

export function drawPolygons({
  polygons,
  color,            // the existing d3 scale used for height coloring
  seaInput,         // checkbox/toggle that influences the sea cutoff limit
  blurInput,        // checkbox/toggle for blur filter class
  mapCellsLayer,    // d3 selection for the land cell paths group ('.mapCells')
  oceanLayer,       // d3 selection where the full-canvas ocean rect is appended
  shallowLayer,     // d3 selection for shallow-water cell paths (if currently drawn here)
  circlesLayer,     // d3 selection for the seed circles group (hide after render if that's what you do now)
  svg               // d3 selection for the main svg element
}) {
  // Use global Perf object if available
  if (window.Perf) {
    window.Perf.time('paint', () => {
      // delete all polygons
      d3.selectAll(".mapCell").remove();
      // redraw the polygons based on new heights
      var grads = [],
        limit = 0.2;
      if (seaInput.checked == true) {
        limit = 0;
      }
      polygons.map(function(i) {
        if (i.height >= limit) {
          mapCellsLayer.append("path")
            .attr("d", "M" + i.join("L") + "Z")
            .attr("class", "mapCell")
            .attr("fill", color(1 - i.height));
          mapCellsLayer.append("path")
            .attr("d", "M" + i.join("L") + "Z")
            .attr("class", "mapStroke")
            .attr("stroke", color(1 - i.height));
        }
        if (i.type === "shallow") {
          shallowLayer.append("path")
            .attr("d", "M" + i.join("L") + "Z");
        }
      });
      if (blurInput.valueAsNumber > 0) {
        toggleBlur({
          polygons,
          color,
          seaInput,
          blurInput,
          mapCellsLayer
        });
      }
    });
  } else {
    // Fallback if profiler not available
    // delete all polygons
    d3.selectAll(".mapCell").remove();
    // redraw the polygons based on new heights
    var grads = [],
      limit = 0.2;
    if (seaInput.checked == true) {
      limit = 0;
    }
    polygons.map(function(i) {
      if (i.height >= limit) {
        mapCellsLayer.append("path")
          .attr("d", "M" + i.join("L") + "Z")
          .attr("class", "mapCell")
          .attr("fill", color(1 - i.height));
        mapCellsLayer.append("path")
          .attr("d", "M" + i.join("L") + "Z")
          .attr("class", "mapStroke")
          .attr("stroke", color(1 - i.height));
      }
      if (i.type === "shallow") {
        shallowLayer.append("path")
          .attr("d", "M" + i.join("L") + "Z");
      }
    });
    if (blurInput.valueAsNumber > 0) {
      toggleBlur({
        polygons,
        color,
        seaInput,
        blurInput,
        mapCellsLayer
      });
    }
  }
}

// Change blur, in case of 0 will not be drawn 
function toggleBlur({
  polygons,
  color,
  seaInput,
  blurInput,
  mapCellsLayer
}) {
  d3.selectAll(".blur").remove();
  if (blurInput.valueAsNumber > 0) {
    var limit = 0.2;
    if (seaInput.checked == true) {
      limit = 0;
    }
    polygons.map(function(i) {
      if (i.height >= limit) {
        mapCellsLayer.append("path")
          .attr("d", "M" + i.join("L") + "Z")
          .attr("class", "blur")
          .attr("stroke-width", blurInput.valueAsNumber)
          .attr("stroke", color(1 - i.height));
      }
    });
  }
}

// Export toggleBlur for use in event handlers
export { toggleBlur };
