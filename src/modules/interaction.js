// d3 is global; do not import it.

export function attachInteraction({
  svg,            // d3 selection of the root <svg>
  viewbox,        // d3 selection of the <g> that is transformed by zoomed()
  diagram,        // the current d3-voronoi diagram (for diagram.find)
  polygons,       // polygons array (read-only here)
  hud: { cellEl, heightEl, featureEl } // DOM nodes or selections used in moved()
  // any additional flags you currently read in moved(), keep the signature minimal otherwise
}) {
  // Hover HUD perf helpers
  let hoverRafId = 0;
  let lastNearest = -1;

  // Add D3 drag and zoom behavior with passive event handling
  var zoom = d3.zoom()
    .scaleExtent([1, 50])
    .translateExtent([
      [-100, -100],
      [svg.attr("width") + 100, svg.attr("height") + 100]
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

  // Add general elements with passive event listeners to avoid warnings
  // Note: touchmove and mousemove events are marked as passive for better performance
  svg.on("touchmove mousemove", moved, { passive: true });

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
      cellEl.textContent = nearest;
      heightEl.textContent = poly.height.toFixed(2);
      featureEl.textContent = poly.featureType
        ? (poly.featureName + " " + poly.featureType)
        : "no!";
    });
  }

  function getTransform() { return d3.zoomTransform(svg.node()); }
  function panTo([x, y], { k = getTransform().k, duration = 600 } = {}) {
    const w = svg.attr("width")  ? +svg.attr("width")  : svg.node().clientWidth;
    const h = svg.attr("height") ? +svg.attr("height") : svg.node().clientHeight;
    const tx = (w / 2) - k * x;
    const ty = (h / 2) - k * y;
    svg.transition().duration(duration).call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
  }

  // Return API for potential cleanup
  return {
    zoom,
    getTransform,
    panTo,
    destroy() {
      svg.on("touchmove mousemove", null);
      svg.on("zoom", null);
    },
    resetHoverCache() {
      lastNearest = -1;
    }
  };
}
