# Label Fixes Implementation

This document describes the fixes implemented to resolve duplicate water labels, missing land labels, and incorrect placement issues.

## Problems Fixed

### 1. **Duplicate Labels**
- **Issue**: Multiple "Warm Ocean" labels were appearing stacked on top of each other
- **Cause**: Labels were being created for each polygon individually without deduplication
- **Solution**: Group polygons by feature type and name, then create one label per unique feature

### 2. **Missing Land Labels**
- **Issue**: Landmasses (Islands) weren't getting labels
- **Cause**: Previous implementation was limited to 5 labels and used simple filtering
- **Solution**: Process all features with proper feature type detection

### 3. **Incorrect Placement**
- **Issue**: Labels were positioned at the first vertex of polygons, often at edges
- **Cause**: Using `poly[0]` (first vertex) instead of calculating proper centroids
- **Solution**: Calculate centroids by averaging all vertices of feature groups

## Implementation Details

### 1. **Feature Grouping and Deduplication**

```javascript
function computeMapLabels(polygons) {
  const labels = [];
  const featureGroups = new Map();
  
  // Group polygons by feature type and name
  polygons.forEach((poly, index) => {
    if (!poly.featureType || !poly.featureName) return;
    
    const key = `${poly.featureType}:${poly.featureName}`;
    if (!featureGroups.has(key)) {
      featureGroups.set(key, []);
    }
    featureGroups.get(key).push({ poly, index });
  });
  
  // Process each feature group to create one label per unique feature
  // ...
}
```

### 2. **Proper Centroid Calculation**

```javascript
// Calculate centroid for the feature group
let totalX = 0, totalY = 0, count = 0;

group.forEach(({ poly }) => {
  if (poly && poly.length > 0) {
    // Use polygon centroid (average of all vertices)
    poly.forEach(vertex => {
      if (vertex && vertex.length >= 2) {
        totalX += vertex[0];
        totalY += vertex[1];
        count++;
      }
    });
  }
});

if (count > 0) {
  const x = totalX / count;
  const y = totalY / count;
  // Create label at calculated centroid
}
```

### 3. **Unique ID Generation**

```javascript
// Create unique ID based on feature type and name
const id = `${featureType.toLowerCase()}:${featureName.replace(/\s+/g, '-')}`;
```

### 4. **Label Rendering with Keyed Joins**

```javascript
function drawLabels(data) {
  const gLabels = d3.select('#labels');
  if (gLabels.empty()) return;
  
  // Clear existing labels to prevent accumulation
  gLabels.selectAll('*').remove();
  
  const sel = gLabels.selectAll('text.place-label')
    .data(data, d => d.id); // Use unique ID for keyed join

  const enter = sel.enter().append('text')
    .attr('class', d => `place-label ${d.kind}`)
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .attr('font-size', 12)
    .text(d => d.name);

  enter.merge(sel)
    .attr('x', d => d.x)   // world coords
    .attr('y', d => d.y);  // world coords

  sel.exit().remove();
}
```

## Feature Types Supported

The system now properly handles all feature types from the `markFeatures` function:

- **Ocean**: Large connected water regions
- **Island**: Landmasses above sea level
- **Lake**: Inland water bodies

## Label Styling

Different feature types get distinct styling:

```css
.place-label.island {
  fill: #2d5016;
  stroke: #1a2f0d;
  font-weight: 900;
}

.place-label.ocean {
  fill: #1e3a8a;
  stroke: #1e40af;
  font-weight: 700;
}

.place-label.lake {
  fill: #0369a1;
  stroke: #0c4a6e;
  font-weight: 700;
}
```

## Coordinate Space Management

- **Labels are placed under the zoomed group** (`#labels` under `.viewbox`)
- **World coordinates** are used for positioning
- **Labels scale with the map** by default
- **Constant-size option** available via toggle
- **Auto-fit compatibility** maintained

## Usage

### Automatic Label Generation
Labels are automatically computed and rendered after feature marking:

```javascript
// Compute and render map labels with proper deduplication
const labelData = computeMapLabels(polygons);
drawLabels(labelData);
```

### Manual Label Control
Functions are exposed globally for debugging:

```javascript
// Recompute labels
const labels = window.computeMapLabels(window.currentPolygons);
window.drawLabels(labels);

// Toggle label scaling
window.toggleLabelScaling();
```

## Testing

1. **Generate a new map** - All features should get appropriate labels
2. **Check for duplicates** - Each unique feature should have exactly one label
3. **Verify placement** - Labels should be centered on their features
4. **Test zoom/pan** - Labels should move correctly with the map
5. **Regenerate map** - No label accumulation should occur

## Files Modified

- `src/main.js` - Added `computeMapLabels` function and updated label rendering
- `styles.css` - Added feature-specific label styling
- `src/modules/labels.js` - Fixed ReferenceError in D3 callbacks and improved null safety
- `LABEL_FIXES.md` - This documentation file

## Recent Bug Fixes

### Idempotent Label Zoom Styling (2025-08-30)

**Issue**: After ocean label placement, island and lake label font sizes were compounding across zoom updates, causing unwanted font growth and inconsistent rendering.

**Root Cause**: 
- `updateLabelZoom` was using compound transforms and reading existing font styles
- Font sizes were being multiplied across multiple zoom update passes
- No baseline font size persistence on label data

**Solution**:
1. **Idempotent transform updates**: `updateLabelZoom` now rebuilds transforms from scratch using `scale(1/k)`
2. **Baseline font persistence**: Set `baseFontPx` and `baseStrokePx` on label datum in `renderLabels`
3. **Deterministic font sizing**: Font sizes derived from baseline, not compounded from existing styles
4. **Ocean label baseline**: `fitOceanLabelToRect` sets `baseFontPx` instead of transient `fontSize`
5. **Simplified zoom updates**: `updateLabelZoom` gets zoom level internally, no `k` parameter needed

**Files Changed**:
- `src/modules/labels.js` - Updated `updateLabelZoom`, `renderLabels`, `fitOceanLabelToRect`, `computeLabelMetrics`, `annealLabels`
- `src/modules/interaction.js` - Updated `updateLabelZoom` calls to remove `k` parameter

### ReferenceError: d is not defined (2025-08-30)

**Issue**: The `renderLabels` function was throwing a ReferenceError when trying to access properties on `d` in D3 callbacks, particularly when the `placed` array contained `undefined` or `null` elements.

**Root Cause**: 
- Arrow functions (`=>`) in D3 callbacks can have issues with data binding context
- Optional chaining (`?.`) wasn't sufficient when `d` itself was `undefined`
- Some elements in the `placed` array were `undefined` or `null`

**Solution**:
1. **Converted arrow functions to explicit function declarations**: Changed `d => ...` to `function(d) { ... }` in all D3 callbacks
2. **Enhanced null safety**: Used explicit `function(d) { return d && d.property ? d.property : defaultValue; }` syntax
3. **Added data filtering**: Filter out null/undefined elements before binding data to D3 selections
4. **Updated all affected functions**: `renderLabels`, `updateLabelZoom`, `updateLabelVisibility`, and debug overlay functions

**Files Changed**:
- `src/modules/labels.js` - Fixed all D3 callback functions to use explicit function declarations and proper null checking

### Dynamic Budgets and Gating (2025-08-30)

**Issue**: At minimum zoom, too many island and lake labels were visible, causing crowding and poor readability. Static limits didn't scale well with zoom levels.

**Root Cause**: 
- Static label limits (e.g., 4 islands, 3 lakes) didn't adapt to zoom level
- No size-based filtering to prioritize larger, more important features
- No proximity checking to prevent label clustering
- Fixed thresholds didn't account for zoom-dependent visibility needs

**Solution**:
1. **Dynamic budget scaling**: `labelBudgetByZoom()` provides zoom-dependent label counts
   - Minimum zoom (k=1.1): 1 island, 1 lake, 1 ocean
   - Maximum zoom (k=2.3): 10 islands, 12 lakes, 1 ocean
   - Smooth linear interpolation between extremes

2. **Size-based gating**: `minAreaPx()` filters labels by pixel area with zoom scaling
   - Island threshold: 6000px² base at k≈1.0, scales down with zoom
   - Lake threshold: 4000px² base at k≈1.0, scales down with zoom
   - Higher zoom = lower thresholds = more labels visible

3. **Proximity-based separation**: `tooCloseToAny()` prevents label clustering
   - Minimum 36px separation in world coordinates
   - Zoom-aware scaling (36/k) for consistent screen separation
   - Greedy selection: keeps largest features that don't overlap

4. **Progressive reveal system**: Labels appear smoothly as you zoom in
   - Quality over quantity: largest features shown first
   - No sudden jumps: gradual increase in label density
   - Crowding prevention: maintains proper label spacing

**Implementation Details**:
```javascript
// Dynamic budgets based on zoom level
function labelBudgetByZoom(k) {
  const t = Math.max(0, Math.min(1, (k - 1.1) / 1.2)); // tune
  return { ocean: 1, island: Math.round(1 + 9*t), lake: Math.round(1 + 11*t) };
}

// Minimum area thresholds for label visibility
function minAreaPx(kind, k) {
  const base = kind === 'island' ? 6000 : 4000; // at k≈1.0; tune
  const scale = Math.max(0.4, 1.2 - 0.4*(k - 1));
  return base * scale;
}

// Check if label is too close to any kept labels
function tooCloseToAny(l, kept, minSepWorld) {
  for (const o of kept) {
    const dx = l.x - o.x, dy = l.y - o.y;
    if (Math.hypot(dx, dy) < minSepWorld) return true;
  }
  return false;
}
```

**Budget Scaling Examples**:
- **k=1.1 (min)**: 1 island, 1 lake, 1 ocean
- **k=1.5 (medium)**: 4 islands, 5 lakes, 1 ocean  
- **k=2.0 (high)**: 8 islands, 10 lakes, 1 ocean
- **k=2.3 (max)**: 10 islands, 12 lakes, 1 ocean

**Area Threshold Scaling**:
- **k=1.1**: Island ≥ 7200px², Lake ≥ 4800px²
- **k=1.5**: Island ≥ 6000px², Lake ≥ 4000px²
- **k=2.0**: Island ≥ 4800px², Lake ≥ 3200px²
- **k=2.3**: Island ≥ 4320px², Lake ≥ 2880px²

**Benefits**:
- **Clean minimum zoom**: No overwhelming label density
- **Progressive discovery**: Users discover more details as they zoom
- **Quality focus**: Always shows the most important features first
- **Performance**: Fewer labels to render at minimum zoom
- **Visual quality**: No crowding, proper separation maintained

**Files Changed**:
- `src/modules/labels.js` - Added dynamic budget functions and updated `filterByZoom` with gating logic

### CSS Safety and Debug Features (2025-08-30)

**Issue**: Labels could inherit stale `display: none` from CSS, and there was no way to force-unhide labels for debugging purposes.

**Solutions**:

#### P9: CSS Safety - Prevent Stale Display Inheritance
Added explicit CSS rules to restore display for labels:
```css
/* CSS safety: prevent stale display:none inheritance */
#labels-world .feature-label { display: unset; }
#labels-overlay .feature-label { display: unset; }
```

**Benefits**:
- Prevents labels from being hidden due to inherited CSS
- Uses `display: unset` to reset any inherited display restrictions
- Applies to both world and overlay label containers

#### P10: Optional Belt-and-Suspenders Unhide (Debug Flag)
Added debug flag-controlled unhide functionality in `renderOceanOnly()`:
```javascript
if (window.DBG && window.DBG.safety === true) {
  d3.select('#labels-world').selectAll('g.feature-label')
    .style('display', null)
    .attr('opacity', null);
}
```

**Usage**:
- Disabled by default for production
- Enable with: `window.DBG = { safety: true }` in browser console
- Force-unhides all world labels by clearing display and opacity restrictions

**Benefits**:
- Provides debugging safety net without affecting production
- Can be enabled temporarily to diagnose label visibility issues
- Clears both `display` and `opacity` restrictions

**Files Changed**:
- `styles.css` - Added CSS safety rules at end of file
- `src/modules/labels.js` - Added debug flag unhide functionality in `renderOceanOnly()`

### Island/Lake Label Zoom Behavior Fix (2025-08-30)

**Issue**: Island and lake labels were using inverse scaling (`scale(1/k)`) which made them shrink as users zoomed in, making them less readable and counterintuitive.

**Root Cause**: 
- Multiple places in the code were applying inverse scaling to all labels
- `updateLabelZoom` function used `scale(1/k)` for all labels
- `renderLabels` function applied `/ k` to font sizes
- `labelDrawXY` function converted screen coordinates with `/ k` scaling
- No clear separation between ocean and non-ocean label behavior

**Solution**: Implemented Strategy A - Transform only by map zoom, scale font by *k

#### 1. Fixed `updateLabelZoom` Function
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

#### 2. Fixed Font Size Scaling
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

#### 3. Fixed Initial Label Creation
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

#### 4. Added Sanity Guard
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

#### 5. Added Verification Logging
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

### Ocean Label First-Zoom Jump Fix (2025-08-30)

**Issue**: Ocean labels were experiencing a "first-zoom jump" where they would suddenly change position or size on the first zoom operation.

**Root Cause**: 
- Ocean labels were being processed by the zoom updater even though they should be in screen space
- The zoom handler was not properly excluding ocean labels from transform updates
- Ocean labels were getting inverse scaling applied during zoom operations

**Solution**: Complete separation of ocean and non-ocean label handling

#### 1. Fixed `updateLabelZoom` Function
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

#### 2. Zoom Handler Already Correct
**Verified**: The zoom handler in `interaction.js` already only transforms the `#world` container
- Ocean labels are not affected by the zoom transform
- Screen space is preserved for ocean labels

#### 3. Ocean Renderer Already Correct
**Verified**: `renderOceanOverlay` function already uses only `translate` without scaling
- Ocean labels get `translate(${rectPx.x},${rectPx.y})` only
- No `scale()` operations applied to ocean labels

#### 4. Added CSS for Crisp Outlines
**Added**: `.label.ocean text { vector-effect: non-scaling-stroke; }`
- Ocean label outlines won't fatten/thin with zoom
- Consistent rendering across all zoom levels

### Island/Lake Labels Sticky Behavior Fix (2025-08-30)

**Issue**: Island and lake labels were not sticking to their features during zoom/pan operations.

**Root Cause**: 
- Labels were getting per-label transforms that conflicted with the world layer transform
- The `#labels-world` group was not being transformed with the zoom
- Labels were being repositioned on each zoom instead of following the world layer

**Solution**: Put labels inside the zoomed world layer and remove per-label transforms

#### 1. Labels Are Inside the Zoomed World Layer
**Verified**: `renderLabels` function already uses `groupId: 'labels-world'`
- Labels are created in `#labels-world` group
- Labels are inside the zoomed world layer

#### 2. Removed Per-Label Transforms
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

#### 3. Added Labels-World to Zoom Transform
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

#### 4. Font Size Grows with Zoom
**Maintained**: BETA logic for font size growth
```javascript
const px = Math.max(1, Math.round(d.fontPx * Math.pow(k, BETA)));
```
- Labels become larger and more readable as you zoom in

### LOD/Budget Fix (2025-08-30)

**Issue**: After removing per-label scaling, the LOD system was showing `visible=0` even with healthy budgets.

**Root Cause**: 
- `featurePixelArea` property was being used but never defined
- The bbox computation was broken after removing inverse scaling
- Labels were failing the area filter due to missing properties

**Solution**: Compute pixel area correctly from world coordinates

#### 1. Fixed Missing Property
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

#### 2. Proper Area Scaling
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
