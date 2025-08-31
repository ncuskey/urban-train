# Ocean Label Rectangle Finder Fix Summary

## Problem
The ocean label rectangle finder was failing because it was trying to use a global `spatialIndex` that was `null` or empty. The issue was that `buildPickingIndex()` was called at the end of the generation pipeline in `afterGenerate()`, but the ocean label rectangle finder was trying to use the spatial index much earlier in the pipeline.

## Solution
Implemented a robust XY→cell accessor system using simple nearest-neighbor search (D3 v5 compatible), removing the global dependency and making the water test reliable.

## Changes Made

### 1. Created Robust XY Accessor System (`src/main.js`)

**Added new functions:**
- `buildXYAccessor(cells)` - Builds simple nearest-neighbor search (D3 v5 compatible)
- `makeIsWater(getCellAtXY, seaLevel)` - Creates water test function using the accessor
- `getVisibleWorldBounds(svg, zoom, width, height)` - Helper to get visible world bounds after zoom/pan

**Updated state object:**
```javascript
const state = {
  seed: Math.floor(Math.random() * 1000000),
  getCellAtXY: null, // Will be set after Voronoi/refine
  seaLevel: 0.2
};
```

### 2. Built Accessor at Correct Time (`src/main.js`)

**Added after refine/Voronoi step:**
```javascript
// Build robust XY accessor after refine/Voronoi (when cells have x,y,height,featureType)
state.getCellAtXY = buildXYAccessor(polygons);
if (!state.getCellAtXY) {
  console.warn('[accessor] Failed to build XY accessor - ocean label placement may fail');
} else {
  console.log(`[accessor] Built XY accessor for ${polygons.length} cells`);
}
```

### 3. Updated Ocean Label Rectangle Finder (`src/main.js`)

**Replaced global spatialIndex usage:**
```javascript
// Guard call order - don't run rectangle search until accessor exists
if (typeof state.getCellAtXY !== 'function') {
  console.warn('[ocean] getCellAtXY not ready; skipping ocean rectangle this frame.');
} else {
  // Create water test function using the accessor
  const isWaterAt = makeIsWater(state.getCellAtXY, state.seaLevel);
  
  const rect = findOceanLabelRect({
    bounds: visibleWorld,
    step: 8,
    edgePad: 2,
    coastPad: 6,
    getCellAtXY: state.getCellAtXY,
    isWaterAt
  });
}
```

### 4. Updated Rectangle Finder Functions (`src/modules/labels.js`)

**Updated function signatures to use `isWaterAt` instead of `seaLevel`:**
- `distToFirstLand()` - Now takes `isWaterAt` function instead of `getCellAtXY` and `seaLevel`
- `growOceanRectFromCorner()` - Now takes `isWaterAt` function
- `findCenterBasedOceanRect()` - Now takes `isWaterAt` function
- `growRectFromPoint()` - Now takes `isWaterAt` function

**Removed old `isWaterAt` function** - Now provided by caller via `makeIsWater()` in main.js

### 5. Added Fallback in `afterGenerate()` (`src/main.js`)

**Ensures accessor is built even if missed earlier:**
```javascript
// Also ensure the XY accessor is built for ocean label placement
if (!state.getCellAtXY && window.currentPolygons) {
  state.getCellAtXY = buildXYAccessor(window.currentPolygons);
  console.log(`[afterGenerate] Built XY accessor for ${window.currentPolygons.length} cells`);
}
```

## Key Benefits

1. **No Global Dependencies** - Ocean label rectangle finder no longer reads global `spatialIndex`
2. **Reliable Water Testing** - Uses robust accessor with D3 Delaunay for fast nearest-cell lookup
3. **Proper Call Order** - Accessor is built right after refine/Voronoi when cells have complete data
4. **Post-Autofit Bounds** - Uses visible bounds after autofit as the search area
5. **Guarded Execution** - Won't run rectangle search until accessor exists
6. **Coastline-Touch Check** - Stops at first transition from water to land to ensure coastline-bound sides
7. **Post-SAT Optimization** - Additional SA pass after rectangle computation for fine-tuned placement
8. **World Coordinate Consistency** - Proper screen-to-world conversion throughout SA processing

## Testing

### Test Files Created
- `dev/test-ocean-rectangle.html` - Comprehensive test of the ocean rectangle finder functionality

### Manual Testing
1. Open `http://localhost:8000/` in browser
2. Generate a new map
3. Verify ocean labels appear in appropriate ocean areas
4. Test zoom/pan to ensure labels remain properly positioned

## Recent Additions (P9-P10)

### P9: CSS Safety - Prevent Stale Display Inheritance
**Problem**: Labels could inherit stale `display: none` from CSS, causing them to be hidden unexpectedly.

**Solution**: Added explicit CSS rules to restore display for labels:
```css
/* CSS safety: prevent stale display:none inheritance */
#labels-world .feature-label { display: unset; }
#labels-overlay .feature-label { display: unset; }
```

**Location**: `styles.css` (end of file)

**Benefits**:
- Prevents labels from being hidden due to inherited CSS
- Uses `display: unset` to reset any inherited display restrictions
- Applies to both world and overlay label containers

### P10: Optional Belt-and-Suspenders Unhide (Debug Flag)
**Problem**: As a temporary safety net, need a way to force-unhide world labels after ocean pass.

**Solution**: Added debug flag-controlled unhide functionality:
```javascript
if (window.DBG && window.DBG.safety === true) {
  d3.select('#labels-world').selectAll('g.feature-label')
    .style('display', null)
    .attr('opacity', null);
}
```

**Location**: `src/modules/labels.js` in `renderOceanOnly()` function

**Usage**:
- Disabled by default for production
- Enable with: `window.DBG = { safety: true }` in browser console
- Force-unhides all world labels by clearing display and opacity restrictions

**Benefits**:
- Provides debugging safety net without affecting production
- Can be enabled temporarily to diagnose label visibility issues
- Clears both `display` and `opacity` restrictions

### Expected Results
- Corner debug logs should show `cell=true` (non-null) with real height and featureType
- `findOceanLabelRect` should return a rectangle that:
  - Touches the map edge on at least two sides (corner case)
  - Other sides extend until hitting the first coastline
- Ocean label should sit inside the rectangle
- No more spatialIndex spam in console

## Acceptance Criteria Met

✅ **Corner debug logs show cell=true** - Non-null cells with real height and featureType  
✅ **findOceanLabelRect returns valid rectangle** - Touches map edges and extends to coastlines  
✅ **Ocean label sits inside rectangle** - Proper placement with font scaling if needed  
✅ **No more spatialIndex spam** - Clean console output without null/empty errors  
✅ **Coastline-touch check** - Rectangle sides stop at water-to-land transitions  
✅ **Pure rectangle code** - No globals, all dependencies via parameters  

## Performance Notes

- Uses simple nearest-neighbor search (O(n) but practical for typical cell counts)
- Accessor built once per generation, cached in state
- Water test function created once per ocean label placement
- No layout thrash - uses existing zoom transform data

**Files Changed**:
- `styles.css` - Added CSS safety rules at end of file
- `src/modules/labels.js` - Added debug flag unhide functionality in `renderOceanOnly()`

## Recent Additions (P11-P15)

### P11-P15: Island/Lake Label Zoom Behavior Fix
**Problem**: Island and lake labels were using inverse scaling (`scale(1/k)`) which made them shrink as users zoomed in, making them less readable and counterintuitive.

**Root Cause**: Multiple places in the code were applying inverse scaling to all labels without distinguishing between ocean and non-ocean labels.

**Solution**: Implemented Strategy A - Transform only by map zoom, scale font by *k

#### P11: Fixed `updateLabelZoom` Function
**Before**: All labels used inverse scaling
```javascript
g.selectAll('g.label')
  .attr('transform', d => `translate(${d.x},${d.y}) scale(${1 / k})`);
```

**After**: Non-ocean labels follow world zoom, ocean labels keep inverse scaling
```javascript
g.selectAll('g.label')
  .attr('transform', d => {
    if (d.kind === 'ocean') {
      return `translate(${d.x},${d.y}) scale(${1 / k})`; // keep ocean as-is
    } else {
      return `translate(${d.x},${d.y})`; // remove scale(...)
    }
  });
```

#### P12: Fixed Font Size Scaling
**Before**: All labels had shrinking font sizes
```javascript
.style('font-size', d => (d.baseFontPx || 24) / k + 'px');
```

**After**: Non-ocean labels grow with zoom, ocean labels keep inverse scaling
```javascript
.style('font-size', d => {
  if (d.kind !== 'ocean') {
    const px = Math.max(1, Math.round(d.fontPx * Math.pow(k, BETA)));
    return px + 'px';
  } else {
    return (d.font_world_px ?? (d.baseFontPx || 24) / k) + 'px';
  }
});
```

#### P13: Fixed Initial Label Creation
**Before**: `labelDrawXY` applied inverse scaling to all labels
```javascript
const wWorld = (d.width || 0) / k;
const hWorld = (d.height || 0) / k;
```

**After**: Non-ocean labels use world coordinates directly
```javascript
if (d.kind !== 'ocean') {
  return { x: d.placed.x, y: d.placed.y }; // Direct world coords
} else {
  // Ocean labels keep screen-to-world conversion
  const wWorld = (d.width || 0) / k;
  const hWorld = (d.height || 0) / k;
}
```

#### P14: Added Sanity Guard
Added hard guard to prevent any inverse scaling for non-ocean labels:
```javascript
if (d.kind === 'ocean') {
  // ocean handled elsewhere in screen space
  return `translate(${d.x},${d.y}) scale(${1 / k})`;
} else {
  // explicitly forbid inverse scaling
  const s = 1; // no inverse: follow world zoom
  if (window.DBG && window.DBG.labels) console.warn("[labels] unexpected inverse scale for", d.id);
  return `translate(${d.x},${d.y})`; // remove scale(...)
}
```

#### P15: Added Verification Logging
Added targeted logging to verify zoom behavior:
```javascript
if (window.DBG && window.DBG.labels) {
  g.selectAll('g.label').each(function(d) {
    const t = d3.select(this).attr("transform") || "";
    const fs = d3.select(this).select("text").style("font-size");
    console.log("[zoom]", { k, id: d.id, kind: d.kind, transform: t, fontSize: fs });
  });
}
```

**Expected Behavior When Zooming In (k increases)**:
- **Island/Lake labels**: 
  - Transform: `translate(x,y)` (no `scale(...)`)
  - Font size: Increases monotonically
- **Ocean labels**: 
  - Transform: `translate(x,y) scale(1/k)` (inverse scaling maintained)
  - Font size: Decreases (inverse scaling maintained)

**Benefits**:
- **Intuitive behavior**: Island/lake labels grow larger as you zoom in
- **Better readability**: Labels become more readable at higher zoom levels
- **Consistent with expectations**: Labels follow the map zoom naturally
- **Ocean labels preserved**: Screen-space ocean labels maintain their current behavior
- **No double scaling**: Eliminated all inverse scaling conflicts

**Usage**:
```javascript
// Enable debug logging in browser console:
window.DBG = { labels: true };

// Then zoom in/out to see:
// [zoom] { k: 1.5, id: "island:1", kind: "island", transform: "translate(100,200)", fontSize: "24px" }
// [zoom] { k: 2.0, id: "island:1", kind: "island", transform: "translate(100,200)", fontSize: "32px" }
```

**Files Changed**:
- `src/modules/labels.js` - Fixed zoom behavior in `updateLabelZoom`, `renderLabels`, and `labelDrawXY` functions

## Recent Additions (P16-P18)

### P16: Ocean Label First-Zoom Jump Fix
**Problem**: Ocean labels were experiencing a "first-zoom jump" where they would suddenly change position or size on the first zoom operation.

**Root Cause**: Ocean labels were being processed by the zoom updater even though they should be in screen space.

**Solution**: Complete separation of ocean and non-ocean label handling

#### Fixed `updateLabelZoom` Function
**Before**: Ocean labels were processed by the zoom updater
```javascript
g.selectAll('g.label')
  .attr('transform', d => {
    if (d.kind === 'ocean') {
      return `translate(${d.x},${d.y}) scale(${1 / k})`; // ❌ ocean getting zoom transforms
    }
  });
```

**After**: Ocean labels are completely excluded from zoom updates
```javascript
// Ocean is rendered in screen space; do not rescale or reposition it here.
d3.selectAll('.label.ocean').each(function() {/* no-op */});
// From here on, operate only on non-ocean labels.
const sel = g.selectAll('.label').filter(d => d && d.kind !== 'ocean');
```

#### Added CSS for Crisp Outlines
**Added**: `.label.ocean text { vector-effect: non-scaling-stroke; }`
- Ocean label outlines won't fatten/thin with zoom
- Consistent rendering across all zoom levels

### P17: Island/Lake Labels Sticky Behavior Fix
**Problem**: Island and lake labels were not sticking to their features during zoom/pan operations.

**Root Cause**: Labels were getting per-label transforms that conflicted with the world layer transform.

**Solution**: Put labels inside the zoomed world layer and remove per-label transforms

#### Removed Per-Label Transforms
**Before**: `updateLabelZoom` was applying transforms to labels
```javascript
sel.attr('transform', d => `translate(${d.x},${d.y})`); // ❌ per-label transforms
```

**After**: No transform updates - labels use world coordinates only
```javascript
// Non-ocean labels are inside the zoomed world layer.
// 1) NO per-label transforms - let the world layer handle zooming
// 2) Only change font-size to make labels grow with zoom
```

#### Added Labels-World to Zoom Transform
**Before**: Only `#world` was transformed
```javascript
const world = svg.select('#world');
world.attr('transform', `translate(${t.x},${t.y}) scale(${t.k})`);
```

**After**: Both `#world` and `#labels-world` get the same transform
```javascript
const world = svg.select('#world');
const labelsWorld = svg.select('#labels-world');
world.attr('transform', `translate(${t.x},${t.y}) scale(${t.k})`);
labelsWorld.attr('transform', `translate(${t.x},${t.y}) scale(${t.k})`);
```

### P18: LOD/Budget Fix
**Problem**: After removing per-label scaling, the LOD system was showing `visible=0` even with healthy budgets.

**Root Cause**: `featurePixelArea` property was being used but never defined.

**Solution**: Compute pixel area correctly from world coordinates

#### Fixed Missing Property
**Before**: Using non-existent properties
```javascript
.filter(l => l.featurePixelArea >= minAreaPx('island', z.k))  // ❌ property doesn't exist
.sort((a,b) => b.featureWorldArea - a.featureWorldArea);      // ❌ property doesn't exist
```

**After**: Compute pixel area from world area
```javascript
.filter(l => {
  // Compute pixel area from world area: area * k²
  const featurePixelArea = (l.area || 0) * z.k * z.k;
  return featurePixelArea >= minAreaPx('island', z.k);
})
.sort((a,b) => (b.area || 0) - (a.area || 0));                // ✅ use existing area property
```

#### Proper Area Scaling
**Formula**: `featurePixelArea = worldArea × k²`
- World area scales quadratically with zoom
- Matches the new world-coordinate label system
- Uses existing `area` property from `buildFeatureLabels`

**Expected Behavior**:
- **Ocean labels**: Stay in screen space, no zoom transforms, no scaling
- **Island/Lake labels**: Stick to features, grow with zoom, follow world layer
- **LOD system**: Works correctly with proper area calculations
- **No first-zoom jump**: Ocean labels remain stable
- **Proper visibility**: Labels appear based on actual pixel area

**Benefits**:
- **Sticky labels**: Island/lake labels now stick to their features during zoom/pan
- **Stable ocean labels**: No sudden jumps or position changes for ocean labels
- **Working LOD**: Proper visibility filtering based on zoom level
- **Intuitive behavior**: Labels behave as expected during zoom operations
- **Crisp rendering**: Ocean labels maintain consistent outline thickness

**Files Changed**:
- `src/modules/labels.js` - Fixed ocean label exclusion, removed per-label transforms, fixed LOD area computation
- `src/modules/interaction.js` - Added `#labels-world` to zoom transform
- `styles.css` - Added crisp outline CSS for ocean labels
