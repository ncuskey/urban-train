# Urban Train - Procedural Map Generator

A web-based procedural map generator that creates Voronoi-based terrain with interactive features, realistic hydronyms, and intelligent label placement.

## Features

### 🌊 **Terrain Generation**
- **Voronoi-based terrain** with realistic heightmaps
- **Feature detection**: Oceans, lakes, islands with connected components
- **Coastal refinement** with automatic coastline tracing
- **Deterministic generation** with seedable RNG

### 🏷️ **Label Management**
- **All features get names**: No minimum size thresholds - even the smallest lakes and islands receive appropriate names
- **Size-aware naming**: Uses feature area to select appropriate terms (e.g., "Mere" vs "Lake" vs "Ocean")
- **Simulated Annealing placement**: Advanced SA algorithm for optimal label placement with collision avoidance
- **Cluster-based optimization**: Groups nearby labels for simultaneous optimization
- **Ocean polishing**: Specialized SA optimization for ocean labels within their water boundaries
- **Size-based zoom filtering**: Features appear progressively based on area and zoom level
- **Robust error handling**: Multiple safety layers prevent crashes from invalid data
- **Ocean seeding**: Labels start inside their designated rectangles for faster convergence

### 🎯 **Interactive Features**
- **Pan and zoom** with smooth performance
- **Hover HUD** with feature information
- **Autofit to land** for optimal initial view
- **Performance monitoring** with built-in timers

## Key Algorithms

### **Simulated Annealing Label Placement**
The label placement system uses an advanced Simulated Annealing (SA) algorithm:
- **Cluster detection**: Groups nearby labels (within 200px) for simultaneous optimization
- **SA optimization**: Uses Monte Carlo optimization with temperature scheduling for global placement
- **Performance guardrails**: Dynamic sweeps based on cluster size with intelligent fallbacks
- **Ocean polishing**: Specialized SA optimization for ocean labels within their water boundaries
- **Post-SAT ocean-only SA**: Additional SA pass after SAT rectangle computation for fine-tuned ocean placement
- **Collision avoidance**: Minimizes overlaps while maintaining proximity to feature centroids
- **Box clamping**: Ensures labels stay within designated bounds after annealing
- **One-cluster fallback**: Additional annealing pass for any remaining overlaps

### **Safety and Robustness**
- **Input validation**: All coordinates and dimensions validated before processing
- **NaN protection**: Multiple layers prevent NaN/Infinity values in transforms
- **Fallback metrics**: Approximate text measurements when precise measurement fails
- **Ocean seeding**: Labels start inside their rectangles for optimal SA convergence
- **Post-SAT optimization**: Fine-tuned SA placement after initial rectangle computation
- **World coordinate consistency**: Proper screen-to-world conversion throughout SA processing
- **Zoom safety**: Finite zoom factors prevent rendering crashes

### **Size-Based Zoom Filtering**
- **Oceans**: Always visible
- **Lakes**: Tiny (50+) at zoom 2x, Small (200+) at zoom 1x, Medium (800+) at zoom 0.5x, All at zoom 4x
- **Islands**: Tiny (30+) at zoom 1.5x, Small (150+) at zoom 0.8x, Medium (600+) at zoom 0.4x, All at zoom 3x

### **Collision Avoidance**
- **Simulated Annealing optimization** for global placement optimization
- **Cluster-based processing** with performance guardrails
- **Priority-based placement** (oceans > lakes > islands)
- **Ocean boundary constraints** with specialized polishing
- **Post-SAT neighbor optimization**: Includes neighboring labels in ocean SA passes
- **Visual indicators** for overlapped labels (reduced opacity)
- **Overlap counting**: Debug output shows remaining overlaps after placement

## Quick Start

1. **Clone and serve**:
   ```bash
   git clone <repository>
   cd urban-train
   python3 -m http.server 8000
   ```

2. **Open in browser**:
   ```
   http://localhost:8000
   ```

3. **Interact**:
   - **Pan**: Click and drag
   - **Zoom**: Mouse wheel or pinch
   - **Debug**: Open console and run `debugLabels()`

## Debugging

### **Console Commands**
```javascript
// Comprehensive label inspection
debugLabels()

// Check self-tests
runSelfTests()

// Performance monitoring
Timers.report()

// Enable debug mode for detailed logging
window.DEBUG = true

// Show label bounding boxes
DEBUG_LABEL_BOXES = true
```

### **Development Tools**
For comprehensive debugging and testing, see the `/dev/` directory:
- **Test pages**: Focused testing of specific features
- **Debug scripts**: Console-based diagnostics
- **Performance tools**: Monitoring and optimization helpers

### **Test Pages**
- **Main app**: `index.html`
- **SA Labeler tests**: 
  - `test-feature-flag.html` - Feature flag verification
  - `test-d3-labeler.html` - D3-Labeler plugin testing
  - `test-label-metrics.html` - Label metrics computation
  - `test-anneal-labels.html` - Annealer wrapper testing
  - `test-sa-integration.html` - SA integration verification
  - `test-ocean-polishing.html` - Ocean polishing testing
  - `test-performance-guardrails.html` - Performance testing
- **Development tools**: See `/dev/` directory for comprehensive test pages and debugging tools

## Architecture

### **Core Modules**
- **`geometry.js`**: Poisson-disc sampling, Voronoi construction, neighbor detection
- **`heightmap.js`**: Terrain generation and height assignment
- **`features.js`**: Feature marking (ocean/lake/island detection)
- **`labels.js`**: Label generation, placement, and zoom filtering
- **`names.js`**: Fantasy hydronyms and island names
- **`interaction.js`**: Pan/zoom and hover HUD
- **`autofit.js`**: Land bounding box, Promise-based fit-to-view, and autoFitToWorld

### **Data Flow**
1. **Seed & Sampling** → `rng`, `poissonDiscSampler`
2. **Voronoi** → `buildVoronoi`, `detectNeighbors`
3. **Heightmap** → `randomMap` (heights ∈ [0,1])
4. **Features** → `markFeatures` (sets `featureType`, components)
5. **Labels** → `buildFeatureLabels` → `ensureMetrics` → `placeLabelsAvoidingCollisions` → `filterByZoom`
6. **Interaction** → `attachInteraction` (zoom, hover HUD)
7. **Autofit** → `fitToLand` (Promise-based, uses `computeLandBBox`)
8. **Ocean Labels** → Placed after autofit with correct post-transform bounds

## Configuration

### **Label Settings**
```javascript
{
  minLakeArea: 0,      // No minimum size - all lakes get names
  minIslandArea: 0,    // No minimum size - all islands get names
  maxOceans: 3,
  maxLakes: 15,
  maxIslands: 20
}
```

### **SA Labeler Configuration**
```javascript
// Safety toggles for easy rollback
export const USE_SA_LABELER = true;       // master switch
export const USE_SA_FOR_OCEANS = true;    // polish oceans in keepWithinRect
export const DEBUG_LABEL_BOXES = false;   // show rects behind text

{
  clusterRadius: 200,    // Pixels for cluster detection
  sweeps: {
    small: 200,          // Base sweeps for small clusters
    medium: 400,         // Medium clusters
    large: 800,          // Large clusters (with 30% reduction for >60 labels)
    ocean: 400,          // Ocean polishing sweeps
    fallback: 500        // One-cluster fallback sweeps
  }
}
```

### **Promise-Based Autofit**
```javascript
// fitToLand now returns a Promise for proper sequencing
await fitToLand({
  svg, zoom, polygons, width, height,
  seaLevel: 0.2, preferFeatureType: true,
  margin: 0.08, duration: 600
});

// Ocean labels placed after autofit with correct bounds
const [x0, y0, x1, y1] = getVisibleWorldBounds(svg, width, height);
```

## Performance

### **Optimizations**
- **RequestAnimationFrame** for hover/HUD throttling
- **Simulated Annealing** for global label placement optimization
- **Performance guardrails** with dynamic sweeps based on cluster size
- **Cluster-based processing** to prevent excessive computation
- **Ocean boundary constraints** for specialized optimization
- **Layer management** to minimize DOM manipulation
- **Text measurement caching** - computed once per render cycle
- **Robust error handling** prevents crashes from invalid data

### **Memory Usage**
- **Cluster formation**: O(n²) for initial clustering
- **SA optimization**: O(sweeps × cluster_size) per cluster
- **Performance guardrails**: Skip annealing for clusters ≤2 labels
- **Dynamic sweeps**: Adaptive computation based on cluster size
- **One-cluster fallback**: Additional pass only when overlaps remain

## Development

### **Tech Stack**
- **HTML5 + ES Modules** (no bundler)
- **D3.js v5** (global, no imports)
- **jQuery 3.6** (minimal usage)
- **Static file serving**

### **File Structure**
```
/src/
  /core/          # RNG, timers
  /modules/       # Main algorithms
  /render/        # Layer management
  /terrain/       # Terrain data
  main.js         # App entry point
  selftest.js     # Invariants and testing
```

### **Testing**
- **Self-tests**: `runSelfTests()` validates invariants
- **Focused tests**: `test-*.html` pages for specific functionality
- **Manual verification**: Console debugging and visual inspection
- **Overlap counting**: Debug output shows placement quality

## SA Labeler Migration

### **Overview**
The label placement system has been upgraded from a "cluster jiggling" algorithm to a **Simulated Annealing (SA)** approach using the D3-Labeler plugin. This provides better global optimization and more sophisticated collision avoidance.

### **Migration Status**
- ✅ **Step 1**: Vendor D3-Labeler plugin
- ✅ **Step 2**: Normalize anchors and dimensions
- ✅ **Step 3**: Add annealer wrapper
- ✅ **Step 4**: SA integration for lake/island labels
- ✅ **Step 5**: Ocean polishing with keepWithinRect
- ✅ **Step 6**: LOD & zoom transforms unchanged
- ✅ **Step 7**: Debug toggle & fallback path
- ✅ **Step 8**: Performance guardrails
- ✅ **Patch 1**: Safe label positioning with NaN protection
- ✅ **Patch 2**: Ensure metrics for all labels
- ✅ **Patch 3**: Hardened annealer wrapper
- ✅ **Patch 4**: Ocean seeding in rectangles
- ✅ **Patch 5**: Last-resort zoom scaling guards

### **Feature Flags**
The system can be toggled between old and new algorithms:
```javascript
// In src/modules/labels.js
export const USE_SA_LABELER = true;       // master switch
export const USE_SA_FOR_OCEANS = true;    // polish oceans in keepWithinRect
export const DEBUG_LABEL_BOXES = false;   // show rects behind text
```

### **Testing**
Comprehensive test suite available:
- **Feature flag testing**: `test-feature-flag.html`
- **Performance testing**: `test-performance-guardrails.html`
- **Integration testing**: `test-sa-integration.html`
- **Documentation**: `SA_LABELER_MIGRATION.md`

## Contributing

### **Guidelines**
- **No new dependencies** - keep it vanilla
- **Performance first** - avoid layout thrash
- **Deterministic generation** - maintain seedable RNG
- **Modular design** - keep functions focused and testable
- **SA labeler ready** - system supports both old and new algorithms
- **Robust error handling** - prevent crashes from edge cases

### **Debugging Tips**
- Use `debugLabels()` for comprehensive inspection
- Check console for SA placement statistics and performance metrics
- Monitor performance with built-in timers
- Test with various zoom levels and feature densities
- Use `getSALabelerStatus()` to check SA system status
- Enable debug mode with `window.DEBUG = true` for detailed logging
- Watch overlap counts in console for placement quality
- Use `DEBUG_LABEL_BOXES = true` to visualize label bounding boxes

## License

[Add your license here]
