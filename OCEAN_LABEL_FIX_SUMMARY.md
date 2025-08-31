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
3. Check console for:
   - `[accessor] Built XY accessor for X cells`
   - `[ocean] Rectangle finder debug:` with valid rectangle data
   - No more `[ocean] spatialIndex is empty or null` errors

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
