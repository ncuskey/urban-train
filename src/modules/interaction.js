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
  
  // Global transform tracking (accessible from main.js)
  window.currentTransform = d3.zoomIdentity;

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
    // Use global Perf object from main.js
    if (window.Perf) {
      window.Perf.time('zoom', () => {
        const t = d3.zoomTransform(svg.node());
        window.currentTransform = t; // Update global transform tracking
        
        // Apply transform to world layers (geometry etc.)
        viewbox.attr("transform", t);
        
        // Handle label scaling based on configuration
        const gLabels = d3.select('#labels');
        if (!gLabels.empty()) {
          if (window.LABELS_NONSCALING) {
            // Keep label text constant-size in pixels: counter-scale each label
            // Assumes each datum has world coords {x, y}
            gLabels.selectAll('text')
              .attr("transform", d => `translate(${t.applyX(d.x)},${t.applyY(d.y)}) scale(${1 / t.k})`);
          }
          // If LABELS_NONSCALING is false, labels scale naturally with the map
          // (they're already under viewbox, so no extra work needed)
        }
      });
    } else {
      // Fallback if profiler not available
      const t = d3.zoomTransform(svg.node());
      window.currentTransform = t; // Update global transform tracking
      
      // Apply transform to world layers (geometry etc.)
      viewbox.attr("transform", t);
      
      // Handle label scaling based on configuration
      const gLabels = d3.select('#labels');
      if (!gLabels.empty()) {
        if (window.LABELS_NONSCALING) {
          // Keep label text constant-size in pixels: counter-scale each label
          // Assumes each datum has world coords {x, y}
          gLabels.selectAll('text')
            .attr("transform", d => `translate(${t.applyX(d.x)},${t.applyY(d.y)}) scale(${1 / t.k})`);
        }
        // If LABELS_NONSCALING is false, labels scale naturally with the map
        // (they're already under viewbox, so no extra work needed)
      }
    }
  }

  // Add general elements with passive event listeners to avoid warnings
  // Note: touchmove and mousemove events are marked as passive for better performance
  svg.on("touchmove mousemove", moved, { passive: true });

  function moved(event) {
    // Early return if hover is disabled
    if (window.hoverDisabled) return;
    
    if (hoverRafId) return; // throttle to animation frame
    
    // Get screen coordinates relative to SVG viewport
    // Use d3.mouse for D3 v5 compatibility (d3.pointer is v6+)
    const point = d3.mouse(svg.node());
    const mx = point[0], my = point[1];
    
    // Convert to world coordinates under current zoom/pan
    const [wx, wy] = window.currentTransform.invert([mx, my]);
    
    hoverRafId = requestAnimationFrame(function () {
      hoverRafId = 0;
      
      // Use global Perf object from main.js
      if (window.Perf) {
        window.Perf.time('hover', () => {
          // Use world coordinates for spatial queries
          const nearest = diagram.find(wx, wy).index;
          if (nearest === lastNearest) return; // only update when cell changes
          lastNearest = nearest;
          const poly = polygons[nearest];
          
          // vanilla DOM updates (faster than jQuery for high-frequency UI)
          cellEl.textContent = nearest;
          heightEl.textContent = poly.height.toFixed(2);
          featureEl.textContent = poly.featureType
            ? (poly.featureName + " " + poly.featureType)
            : "no!";
            
          // Update HUD with screen coordinates for crisp positioning
          updateHUD(poly, { screenX: mx, screenY: my, worldX: wx, worldY: wy, k: window.currentTransform.k });
        });
      } else {
        // Fallback if profiler not available
        // Use world coordinates for spatial queries
        const nearest = diagram.find(wx, wy).index;
        if (nearest === lastNearest) return; // only update when cell changes
        lastNearest = nearest;
        const poly = polygons[nearest];
        
        // vanilla DOM updates (faster than jQuery for high-frequency UI)
        cellEl.textContent = nearest;
        heightEl.textContent = poly.height.toFixed(2);
        featureEl.textContent = poly.featureType
          ? (poly.featureName + " " + poly.featureType)
          : "no!";
          
        // Update HUD with screen coordinates for crisp positioning
        updateHUD(poly, { screenX: mx, screenY: my, worldX: wx, worldY: wy, k: window.currentTransform.k });
      }
    });
  }

  function updateHUD(cell, ctx) {
    if (!cell) { 
      d3.select('#hud').selectAll('*').remove(); 
      return; 
    }

    // Example: a tiny tooltip near the cursor
    const gHUD = d3.select('#hud');
    const tip = gHUD.selectAll('g.tip').data([cell]);
    const enter = tip.enter().append('g').attr('class', 'tip');

    enter.append('rect').attr('rx', 4).attr('ry', 4);
    enter.append('text').attr('class', 'hud-line');

    const merged = enter.merge(tip)
      .attr('transform', `translate(${ctx.screenX + 12},${ctx.screenY + 12})`);

    merged.select('text.hud-line')
      .text(() => `Cell ${cell.index || '—'} • h=${cell.height?.toFixed?.(2) ?? '—'}`);

    const bbox = merged.select('text.hud-line').node().getBBox();
    merged.select('rect')
      .attr('x', bbox.x - 6).attr('y', bbox.y - 4)
      .attr('width', bbox.width + 12).attr('height', bbox.height + 8)
      .attr('fill', 'rgba(0,0,0,0.6)').attr('stroke', '#fff').attr('stroke-width', 0.5);

    tip.exit().remove();
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
