// d3 is global; do not import it.
import { updateLabelZoom, updateLabelVisibility, updateOverlayOceanLabel } from './labels.js';
import { filterByZoom } from './labels.js';

// Add a tiny accessor so other modules can safely read current zoom.
export function getZoomState() {
  // Use d3.zoomTransform to get current transform state
  try {
    const g = d3.select('#world'); // or the group you pan/zoom
    const t = d3.zoomTransform(g.node());
    return {k: t.k || 1, x: t.x || 0, y: t.y || 0};
  } catch (_e) {
    return {k: 1, x: 0, y: 0};
  }
}

export function getVisibleWorldBounds(svg) {
  const t = d3.zoomTransform(svg.node());
  const w = +svg.attr('width'), h = +svg.attr('height');
  const minX = (0 - t.x) / t.k, minY = (0 - t.y) / t.k;
  const maxX = (w - t.x) / t.k, maxY = (h - t.y) / t.k;
  return [minX, minY, maxX, maxY];
}

export function padBounds([minX, minY, maxX, maxY], padPx, k) {
  const p = padPx / (k || 1);
  return [minX + p, minY + p, maxX - p, maxY - p];
}

let svg, gTarget, zoom, currentTransform = d3.zoomIdentity;

export function attachInteraction({
  svg: svgParam,            // d3 selection of the root <svg>
  viewbox,        // d3 selection of the <g> that is transformed by zoomed()
  diagram,        // the current d3-voronoi diagram (for diagram.find)
  polygons,       // polygons array (read-only here)
  hud: { cellEl, heightEl, featureEl } // DOM nodes or selections used in moved()
  // any additional flags you currently read in moved(), keep the signature minimal otherwise
}) {
  svg = svgParam;

  // Transform target (the group that contains the whole map)
  gTarget = d3.select('#world');
  if (gTarget.empty()) { 
    console.error('[zoom] no #world found, trying fallbacks...');
    gTarget = findZoomTarget();
    if (gTarget.empty()) {
      console.error('[zoom] no transform target found. Falling back to first <g> in <svg>.');
      gTarget = svg.select('g');
    }
  }

  // Keep overlays from stealing input
  svg.select('#cellsRaster').style('pointer-events','none');
  svg.select('#hud').style('pointer-events','none');

  // Optional: keep a full-size rect for sizing, but DO NOT capture events
  let surface = svg.select('#event-surface');
  if (surface.empty()) {
    surface = svg.append('rect').attr('id','event-surface')
      .attr('x',0).attr('y',0).attr('fill','transparent');
  }
  const r = svg.node().getBoundingClientRect();
  surface.attr('width', r.width).attr('height', r.height)
         .style('pointer-events', 'none');   // <- IMPORTANT

  // Clear any old zoom listeners and bind to SVG (v5-safe)
  svg.on('.zoom', null);
  zoom = d3.zoom()
    .scaleExtent([0.5, 32])
    .translateExtent([
      [-100, -100],
      [r.width + 100, r.height + 100]
    ])
    .on('zoom', function() {                 // v5: use d3.event
      const t = (d3.event && d3.event.transform) ? d3.event.transform
                                                 : d3.zoomTransform(svg.node());
      currentTransform = t;
      window.currentTransform = currentTransform; // Global transform tracking
      
      // LOD flip: make sure this exists and is cheap
      if (typeof updateCellsLOD === 'function') {
        updateCellsLOD(t.k);
      }
      
      // Transform the world container and labels-world group
      const world = svg.select('#world');
      const labelsWorld = svg.select('#labels-world');
      world.attr('transform', `translate(${t.x},${t.y}) scale(${t.k})`);
      labelsWorld.attr('transform', `translate(${t.x},${t.y}) scale(${t.k})`);

      // Update visibility + inverse scale for feature labels
      if (window.__labelsPlaced && window.__labelsPlaced.features) {
        updateLabelVisibility({
          svg,
          groupId: 'labels-world',
          placed: window.__labelsPlaced.features,
          k: t.k,
          filterByZoom
        });
        updateLabelZoom({ svg, groupId: 'labels-world' });
      }
      
      // Update ocean labels (overlay-only, no world label interference)
      updateOverlayOceanLabel(t.k);
    });

  svg.call(zoom).style('cursor','grab');     // bind zoom to svg
  svg.node().__ZOOM__ = zoom;                // expose for auto-fit/tests
  svg.node().__ZOOM_TARGET__ = gTarget.node();

  // Keep the surface sized with the SVG
  window.addEventListener('resize', () => {
    const rr = svg.node().getBoundingClientRect();
    svg.select('#event-surface').attr('width', rr.width).attr('height', rr.height);
  });

  svg.style('touch-action','none');          // prevent browser gestures

  // ===== HUD hover binding (bind to svg) =====
  let rafHover = false, lastCellId = -1;

  function onHoverMove() {
    // Early return if hover is disabled
    if (window.hoverDisabled) return;
    
    const [mx, my] = d3.mouse(svg.node());   // d3 v5
    if (rafHover) return;
    rafHover = true;
    requestAnimationFrame(() => {
      rafHover = false;
      
      // Use global Perf object from main.js
      if (window.Perf) {
        window.Perf.time('hover', () => {
          const t = getCurrentTransform();
          const wx = (mx - t.x) / t.k;
          const wy = (my - t.y) / t.k;
          const cell = window.pickCellAt ? window.pickCellAt(wx, wy) : diagram.find(wx, wy);
          
          if (!cell || cell.index === lastCellId) return;
          lastCellId = cell.index;
          
          // vanilla DOM updates (faster than jQuery for high-frequency UI)
          cellEl.textContent = cell.index;
          heightEl.textContent = cell.height.toFixed(2);
                  featureEl.textContent = cell.featureType
          ? cell.featureName
          : "no!";
            
          // Update HUD with screen coordinates for crisp positioning
          updateHUD(cell, { screenX: mx, screenY: my, worldX: wx, worldY: wy, k: t.k });
        });
      } else {
        // Fallback if profiler not available
        const t = getCurrentTransform();
        const wx = (mx - t.x) / t.k;
        const wy = (my - t.y) / t.k;
        const cell = window.pickCellAt ? window.pickCellAt(wx, wy) : diagram.find(wx, wy);
        
        if (!cell || cell.index === lastCellId) return;
        lastCellId = cell.index;
        
        // vanilla DOM updates (faster than jQuery for high-frequency UI)
        cellEl.textContent = cell.index;
        heightEl.textContent = cell.height.toFixed(2);
        featureEl.textContent = cell.featureType
          ? cell.featureName
          : "no!";
          
        // Update HUD with screen coordinates for crisp positioning
        updateHUD(cell, { screenX: mx, screenY: my, worldX: wx, worldY: wy, k: t.k });
      }
    });
  }

  // bind to the svg
  svg.on('mousemove.hover', onHoverMove);

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
      svg.on("mousemove.hover", null);
      svg.on("zoom", null);
    },
    resetHoverCache() {
      lastCellId = -1;
    }
  };
}

// choose the first existing candidate as the zoom target group
function findZoomTarget() {
  const candidates = ['#content', '#viewport', '#map', 'g[data-zoom-root="true"]', '.viewbox'];
  for (const sel of candidates) {
    const s = d3.select(sel);
    if (!s.empty()) return s;
  }
  // fallback: a top-level <g>
  const s = d3.select('svg > g');
  return s.empty() ? d3.select(null) : s;
}

// expose for other modules that need the current transform
export function getCurrentTransform() { return currentTransform; }

// programmatic zoom checks
window.forceZoomSanity = function() {
  const node = d3.select('svg').node();
  const z = node.__ZOOM__;
  const sel = d3.select(node);
  if (!z) return console.error('No zoom behavior bound to svg');

  console.log('scaleTo 2×...');
  sel.transition().duration(400).call(z.scaleTo, 2.0);
  setTimeout(() => {
    console.log('translateTo center 400,300...');
    sel.transition().duration(400).call(z.translateTo, 400, 300);
  }, 450);
};

// Quick checklist verification
window.runZoomChecklist = function() {
  console.group('🔍 ZOOM CHECKLIST VERIFICATION');
  
  // 1. Check if attachInteraction() runs after layers are created
  console.log('1️⃣ attachInteraction() timing:');
  const viewbox = d3.select('.viewbox');
  const mapCells = d3.select('.mapCells');
  const labels = d3.select('#labels');
  console.log('   ✅ Layers exist:', {
    viewbox: !viewbox.empty(),
    mapCells: !mapCells.empty(),
    labels: !labels.empty()
  });

  // 2. Check if svg has zoom behavior
  console.log('\n2️⃣ Zoom behavior binding:');
  const svg = d3.select('svg');
  const zoomBehavior = svg.node()?.__ZOOM__;
  console.log('   ✅ Zoom behavior bound to svg:', !!zoomBehavior);

  // 3. Check if svg.node().__ZOOM_TARGET__ points to your map group
  console.log('\n3️⃣ Zoom target group:');
  const zoomTarget = svg.node().__ZOOM_TARGET__;
  console.log('   ✅ __ZOOM_TARGET__ exists:', !!zoomTarget);
  if (zoomTarget) {
    console.log('   🎯 Target element:', zoomTarget.tagName, zoomTarget.className);
    console.log('   🎯 Target matches viewbox:', zoomTarget === viewbox.node());
  }

  // 4. Test forceZoomSanity() moves the map
  console.log('\n4️⃣ Programmatic zoom test:');
  if (typeof window.forceZoomSanity === 'function') {
    console.log('   ✅ forceZoomSanity() function exists');
  } else {
    console.log('   ❌ forceZoomSanity() function not found');
  }

  // 5. Test updateCellsLOD(k) flips raster/vector as you zoom
  console.log('\n5️⃣ LOD system test:');
  if (typeof window.updateCellsLOD === 'function') {
    console.log('   ✅ updateCellsLOD() function exists');
    
    // Test at different zoom levels
    const testLevels = [0.5, 1.0, 2.0, 3.0];
    testLevels.forEach(k => {
      window.updateCellsLOD(k);
      const cellsDisplay = d3.select('.mapCells').style('display');
      const rasterDisplay = d3.select('#cellsRaster').style('display');
      console.log(`   📊 Zoom ${k}: cells=${cellsDisplay}, raster=${rasterDisplay}`);
    });
  } else {
    console.log('   ❌ updateCellsLOD() function not found');
  }

  console.groupEnd();
  
  return {
    layersExist: !viewbox.empty() && !mapCells.empty() && !labels.empty(),
    zoomBehaviorExists: !!zoomBehavior,
    zoomTargetExists: !!zoomTarget,
    forceZoomSanityExists: typeof window.forceZoomSanity === 'function',
    updateCellsLODExists: typeof window.updateCellsLOD === 'function'
  };
};

// Debug picker function
window.debugPick = (sx, sy) => {
  const [wx, wy] = getCurrentTransform().invert([sx, sy]);
  const c = window.pickCellAt ? window.pickCellAt(wx, wy) : null;
  console.log('pick', {sx, sy, wx, wy, id: c?.index, name: c?.featureName});
  return c;
};

// HUD sanity check function
window.hudSanity = function() {
  // Should log valid cell id/name under the cursor
  (function(){
    const t = getCurrentTransform();
    const [mx,my] = d3.mouse(d3.select('svg').node());
    const wx = (mx - t.x)/t.k, wy = (my - t.y)/t.k;
    const c = window.pickCellAt ? window.pickCellAt(wx,wy) : null;
    console.log('pick', {id:c && c.index, name:c && c.featureName});
  })();
};
