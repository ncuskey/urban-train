// d3 is global; do not import it.

export function attachInteraction({
  svg,            // d3 selection of the root <svg>
  viewbox,        // d3 selection of the <g> that is transformed by zoomed()
  diagram,        // the current d3-voronoi diagram (for diagram.find)
  polygons,       // polygons array (read-only here)
  hud: { cellEl, heightEl, featureEl } // DOM nodes or selections used in moved()
  // any additional flags you currently read in moved(), keep the signature minimal otherwise
}) {
  // Lightweight zoom & hover system
  let currentTransform = d3.zoomIdentity;
  window.currentTransform = currentTransform; // Global transform tracking

  // Add D3 drag and zoom behavior with passive event handling
  var zoom = d3.zoom()
    .scaleExtent([1, 50])
    .translateExtent([
      [-100, -100],
      [svg.attr("width") + 100, svg.attr("height") + 100]
    ])
    .on("zoom", onZoom);

  // Apply zoom behavior
  svg.call(zoom);
  
  // Suppress passive event warnings for D3 zoom (these are expected)
  // The zoom behavior needs to prevent default on wheel events for proper zooming
  // This is a known limitation of D3 v5 and the warnings can be safely ignored

  function onZoom(e) {
    // Safety check for undefined event parameter (expected during transitions)
    if (!e || !e.transform) {
      return; // Silently ignore malformed zoom events during transitions
    }
    
    // Use global Perf object from main.js
    if (window.Perf) {
      window.Perf.time('zoom', () => {
        currentTransform = e.transform;
        window.currentTransform = currentTransform;
        
        // Apply transform to world layers (geometry etc.)
        viewbox.attr("transform", currentTransform);
        
        // Update LOD based on zoom level (just flips display/classes)
        if (window.updateCellsLOD) {
          window.updateCellsLOD(currentTransform.k);
        }
        
        // Handle label scaling based on configuration
        const gLabels = d3.select('#labels');
        if (!gLabels.empty()) {
          if (window.LABELS_NONSCALING) {
            // Keep label text constant-size in pixels: counter-scale each label
            // Assumes each datum has world coords {x, y}
            gLabels.selectAll('text')
              .attr("transform", d => `translate(${currentTransform.applyX(d.x)},${currentTransform.applyY(d.y)}) scale(${1 / currentTransform.k})`);
          }
          // If LABELS_NONSCALING is false, labels scale naturally with the map
          // (they're already under viewbox, so no extra work needed)
        }
      });
    } else {
      // Fallback if profiler not available
      currentTransform = e.transform;
      window.currentTransform = currentTransform;
      
      // Apply transform to world layers (geometry etc.)
      viewbox.attr("transform", currentTransform);
      
      // Update LOD based on zoom level (just flips display/classes)
      if (window.updateCellsLOD) {
        window.updateCellsLOD(currentTransform.k);
      }
      
      // Handle label scaling based on configuration
      const gLabels = d3.select('#labels');
      if (!gLabels.empty()) {
        if (window.LABELS_NONSCALING) {
          // Keep label text constant-size in pixels: counter-scale each label
          // Assumes each datum has world coords {x, y}
          gLabels.selectAll('text')
            .attr("transform", d => `translate(${currentTransform.applyX(d.x)},${currentTransform.applyY(d.y)}) scale(${1 / currentTransform.k})`);
        }
        // If LABELS_NONSCALING is false, labels scale naturally with the map
        // (they're already under viewbox, so no extra work needed)
      }
    }
  }

  // Lightweight hover system
  let rafHover = false, lastCellId = -1, lastXY;
  
  svg.on('mousemove', (ev) => {
    // Early return if hover is disabled
    if (window.hoverDisabled) return;
    
    // Safety check for valid event
    if (!ev || !ev.target) return;
    
    try {
      lastXY = d3.mouse(ev);
      if (!lastXY || lastXY.length !== 2) return;
    } catch (error) {
      // Silently ignore malformed mouse events
      return;
    }
    
    if (rafHover) return;
    rafHover = true;
    
    requestAnimationFrame(() => {
      rafHover = false;
      
      // Use global Perf object from main.js
      if (window.Perf) {
        window.Perf.time('hover', () => {
          const [wx, wy] = currentTransform.invert(lastXY);
          const cell = window.pickCellAt ? window.pickCellAt(wx, wy) : diagram.find(wx, wy);
          
          if (!cell || cell.index === lastCellId) return;
          lastCellId = cell.index;
          
          // vanilla DOM updates (faster than jQuery for high-frequency UI)
          cellEl.textContent = cell.index;
          heightEl.textContent = cell.height.toFixed(2);
          featureEl.textContent = cell.featureType
            ? (cell.featureName + " " + cell.featureType)
            : "no!";
            
          // Update HUD with screen coordinates for crisp positioning
          updateHUD(cell, { screenX: lastXY[0], screenY: lastXY[1], worldX: wx, worldY: wy, k: currentTransform.k });
        });
      } else {
        // Fallback if profiler not available
        const [wx, wy] = currentTransform.invert(lastXY);
        const cell = window.pickCellAt ? window.pickCellAt(wx, wy) : diagram.find(wx, wy);
        
        if (!cell || cell.index === lastCellId) return;
        lastCellId = cell.index;
        
        // vanilla DOM updates (faster than jQuery for high-frequency UI)
        cellEl.textContent = cell.index;
        heightEl.textContent = cell.height.toFixed(2);
        featureEl.textContent = cell.featureType
          ? (cell.featureName + " " + cell.featureType)
          : "no!";
          
        // Update HUD with screen coordinates for crisp positioning
        updateHUD(cell, { screenX: lastXY[0], screenY: lastXY[1], worldX: wx, worldY: wy, k: currentTransform.k });
      }
    });
  });

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
