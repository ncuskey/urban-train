# Labels v2.1 Implementation

## Overview

Labels v2.1 implements a sophisticated collision avoidance system with size-based zoom filtering and cluster-based optimization. This system ensures all geographic features (oceans, lakes, islands) receive appropriate names and are displayed with intelligent placement that adapts to zoom levels and feature density.

## Key Features

### 1. No Minimum Size Thresholds
- **All features get names**: Lakes and islands of any size receive appropriate names
- **Size-aware naming**: Uses feature area to select appropriate terms (e.g., "Mere" vs "Lake" vs "Ocean")
- **Configurable thresholds**: `minLakeArea: 0`, `minIslandArea: 0` (no minimum size restrictions)

### 2. Advanced Collision Avoidance
- **Cluster-based jiggling**: Groups nearby labels and optimizes placement simultaneously
- **Cardinal direction offsets**: Tries 9 positions per label (centroid + 8 directions)
- **Systematic combination testing**: For small clusters (≤3 labels), tries ALL possible combinations
- **Distance optimization**: Selects placement that minimizes total distance from centroids
- **Intelligent fallback**: Uses overlapped placement only when necessary

### 3. Size-Based Zoom Filtering
- **Progressive disclosure**: Features appear based on area and zoom level
- **Oceans**: Always visible
- **Lakes**: Tiny (50+) at zoom 2x, Small (200+) at zoom 1x, Medium (800+) at zoom 0.5x, All at zoom 4x
- **Islands**: Tiny (30+) at zoom 1.5x, Small (150+) at zoom 0.8x, Medium (600+) at zoom 0.4x, All at zoom 3x

## Technical Implementation

### Cluster Detection
```javascript
function findLabelClusters(labels) {
  // Groups labels within 200px of each other
  // Forms clusters for simultaneous optimization
}
```

### Cluster Jiggling Algorithm
```javascript
function tryClusterJiggle(cluster) {
  // 9 offset options per label: centroid + 8 cardinal/diagonal directions
  // For small clusters (≤3): tries ALL combinations (9^3 = 729 combinations)
  // For large clusters (>3): samples 500 random combinations
  // Scores each combination by total distance from centroids
  // Selects best collision-free placement
}
```

### Size-Based Zoom Filtering
```javascript
function getVisibilityForZoom(kind, area, k) {
  const thresholds = {
    lake: { tiny: 50, small: 200, medium: 800, large: 2000 },
    island: { tiny: 30, small: 150, medium: 600, large: 1500 }
  };
  
  // Progressive disclosure based on area and zoom level
  // Returns true/false for visibility
}
```

## Configuration

### Label Thresholds
```javascript
// No minimum size restrictions
minLakeArea: 0
minIslandArea: 0

// Maximum counts to prevent overcrowding
maxOceans: 3
maxLakes: 15
maxIslands: 20
```

### Zoom Filtering Thresholds
```javascript
const sizeThresholds = {
  lake: { tiny: 50, small: 200, medium: 800, large: 2000 },
  island: { tiny: 30, small: 150, medium: 600, large: 1500 }
};
```

### Collision Avoidance Settings
```javascript
// Cluster detection radius
const clusterRadius = 200; // pixels

// Offset distance (60% of label size)
const offsetDistance = Math.max(w, h) * 0.6;

// Maximum combinations to try
const maxCombinations = Math.min(1000, Math.pow(9, cluster.length));
```

## Debugging

### Console Output
The system provides extensive debug logging:
```
[labels] DEBUG: Found 3 clusters: [1, 2, 1]
[labels] DEBUG: Cluster of 2 labels tried 81 combinations, found collision-free placement
[labels] DEBUG: Placement stats - centroid: 8, offset: 6, spiral: 0, overlapped: 2
[labels] DEBUG: Average label scale: 0.85, range: 0.60 - 1.00
[labels] DEBUG: Distance stats - avg: 12.3, max: 45.2
```

### Global Debug Function
```javascript
// Available in browser console
debugLabels() // Comprehensive label inspection
```

### Test Pages
- `test-labels-v2.1.html` - Comprehensive label testing
- `test-collision-zoom.html` - Collision avoidance and zoom filtering
- `test-label-zoom.html` - Zoom behavior testing

## Performance Considerations

### Optimization Strategies
- **Quadtree collision detection**: Efficient spatial indexing for collision checks
- **Combination limiting**: Caps combinations at 1000 for large clusters
- **Early termination**: Stops searching when collision-free placement found
- **Distance-based scoring**: Prioritizes placements close to feature centroids

### Memory Usage
- **Cluster formation**: O(n²) for initial clustering (acceptable for typical label counts)
- **Combination generation**: O(9^n) for small clusters, O(500) for large clusters
- **Collision detection**: O(log n) per check using quadtree

## Usage Examples

### Basic Implementation
```javascript
import { buildFeatureLabels, placeLabelsAvoidingCollisions, filterByZoom } from './modules/labels.js';

// Build labels for all features
const labels = buildFeatureLabels(polygons, {
  minLakeArea: 0,
  minIslandArea: 0
});

// Place labels with collision avoidance
const placedLabels = placeLabelsAvoidingCollisions({ svg, labels });

// Filter by zoom level
const visibleLabels = filterByZoom(placedLabels, zoomLevel);
```

### Custom Configuration
```javascript
// Adjust cluster detection radius
const clusters = findLabelClusters(labels, { radius: 150 });

// Custom zoom thresholds
const customThresholds = {
  lake: { tiny: 30, small: 150, medium: 600 },
  island: { tiny: 20, small: 100, medium: 400 }
};
```

## Testing

### Manual Verification
1. **Load test page**: `http://localhost:8007/test-labels-v2.1.html`
2. **Check console**: Verify debug output shows cluster formation and placement stats
3. **Zoom testing**: Pan and zoom to verify size-based filtering
4. **Collision inspection**: Use `debugLabels()` to inspect placement quality

### Automated Tests
```javascript
// Run self-tests
runSelfTests();

// Check label invariants
- All features have names
- No duplicate names within same feature type
- Labels positioned within reasonable distance of features
- Zoom filtering respects size thresholds
```

## Future Enhancements

### Potential Improvements
- **Dynamic cluster radius**: Adjust based on zoom level and feature density
- **Label rotation**: Allow angled placement for better fit
- **Priority-based placement**: Consider feature importance in cluster optimization
- **Animation**: Smooth transitions when labels appear/disappear during zoom

### Performance Optimizations
- **Web Workers**: Move cluster optimization to background thread
- **Spatial partitioning**: More efficient cluster detection for large datasets
- **Caching**: Cache placement results for static features

## Troubleshooting

### Common Issues
1. **Labels not appearing**: Check zoom level and size thresholds
2. **Distant placement**: Verify cluster detection radius and combination limits
3. **Performance issues**: Monitor combination count for large clusters
4. **Overlap**: Check collision detection and fallback logic

### Debug Commands
```javascript
// Inspect all placed labels
debugLabels();

// Check specific cluster
console.log(findLabelClusters(labels));

// Test collision detection
console.log(rectsOverlap(label1, label2));
```
