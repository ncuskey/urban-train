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
