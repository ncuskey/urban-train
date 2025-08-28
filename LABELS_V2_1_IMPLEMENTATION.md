# Labels v2.1 Implementation

## Overview
Enhanced label management system with advanced collision avoidance, size-based zoom filtering, and comprehensive debugging tools.

## Key Features

### No Minimum Size Thresholds
- **All features get names**: Lakes and islands of any size receive labels
- **Size-aware naming**: Uses area to select appropriate terms (e.g., "Mare" vs "Sea", "Loch" vs "Lake")
- **Progressive disclosure**: Labels appear based on zoom level and fixed count limits

### Advanced Collision Avoidance
The system uses a sophisticated multi-layered approach:

1. **Cardinal/Diagonal Offsets**: Initial attempts use 8 directional offsets (centroid + cardinal + diagonal)
2. **Spiral Placement**: Fallback for individual labels that can't be placed with offsets
3. **Cluster Jiggling Algorithm**: Groups nearby labels (within 200px) and simultaneously tries combinations of offsets for all labels in the cluster

#### Cluster Jiggling Details
- **Clustering**: Labels within 200px are grouped together
- **Combination Testing**: For small clusters (≤3 labels), tries all 9^cluster.length combinations (max 729)
- **Sampling**: For larger clusters, samples 500 random combinations
- **Scoring**: Minimizes total distance from feature centroids while avoiding collisions
- **Fallback**: If no collision-free placement found, uses overlapped centroid placement

### Size-Based Zoom Filtering
Progressive disclosure based on zoom level and fixed limits:

```javascript
const lim = {
  ocean: 4,                    // Always visible
  lake:   k < 1 ? 3 : k < 2 ? 10 : k < 4 ? 25 : 80,
  island: k < 1 ? 3 : k < 2 ? 14 : k < 4 ? 40 : 120,
  other:  k < 2 ? 0 : k < 4 ? 10 : 30
};
```

### Label BBox Estimation Optimization
The system uses a pragmatic approach for label width estimation:

#### Current Approach (Pragmatic)
```javascript
const baseWidth = Math.max(80, Math.min(500, lab.text.length * 8));
```
- **Fast**: Simple multiplication, no DOM measurement
- **Good enough**: Works well for most use cases (~90% accuracy)
- **Deterministic**: Same text = same width estimate
- **Performance**: O(1) operation

#### Optimization Opportunity (Precise)
For tighter packing scenarios, actual text width can be measured:
```javascript
// After DOM creation, measure actual width:
enter.each(function(d) {
  const textNode = d3.select(this).select('text.fill');
  const actualWidth = textNode.node().getComputedTextLength();
  d.w = actualWidth; // Update datum with measured width
});
// Then re-run collision avoidance with accurate widths
```

#### Tradeoff Analysis
- **Performance**: Current approach is O(1) vs O(n) DOM measurements
- **Precision**: Current approach is ~90% accurate vs 100% accurate
- **Complexity**: Current approach is simple vs requires re-running collision avoidance
- **Determinism**: Both approaches can be deterministic

#### When to Consider the Optimization
- High label density with tight packing
- Font variations significantly impact character width
- International text support with varying character widths
- Performance budget allows for the extra precision

## Performance Optimizations

### Efficient Zoom Filtering
- **Pre-sorted labels**: Labels are sorted once after placement by priority and area
- **Slice-only filtering**: `filterByZoom` only performs bucketing and slicing, no re-sorting
- **Reduced DOM churn**: Visibility updates use `display: none` instead of DOM manipulation

### Debug Output Control
- **Global toggle**: `window.DEBUG = false` controls all debug output
- **Throttled logging**: Debug statements are gated to prevent console spam
- **Comprehensive debugging**: `debugLabels()` function for inspecting label data and placement

## Development Tools

### Debug Scripts
- **`debug-labels.js`**: Global debugging function for label inspection
- **Test pages**: Comprehensive test suite in `/dev/` directory
- **Documentation**: Detailed usage instructions in `/dev/README.md`

### Code Organization
- **Clean separation**: Removed unused label subgroups and dead code
- **Modular structure**: Clear boundaries between label building, placement, and rendering
- **Future-ready**: TODO comments for planned label subgroups (towns, geographic features)

## Usage

### Basic Label Generation
```javascript
import { buildFeatureLabels, placeLabelsAvoidingCollisions, renderLabels } from './modules/labels.js';

const labels = buildFeatureLabels(polygons, { minLakeArea: 0, minIslandArea: 0 });
const placed = placeLabelsAvoidingCollisions(labels);
renderLabels({ svg, groupId: 'labels-features', placed, k: 1.0 });
```

### Zoom-Based Filtering
```javascript
import { filterByZoom, updateLabelVisibility } from './modules/labels.js';

const visible = filterByZoom(placed, zoomLevel);
updateLabelVisibility({ svg, groupId: 'labels-features', placed, k: zoomLevel, filterByZoom });
```

### Debug Mode
```javascript
window.DEBUG = true; // Enable debug output
window.debugLabels(); // Inspect all label data
```

## Future Enhancements
- **Town labels**: Settlement and city labeling system
- **Geographic features**: Mountain, river, and terrain feature labels
- **Internationalization**: Multi-language label support
- **Advanced typography**: Font-specific width measurements for tighter packing
