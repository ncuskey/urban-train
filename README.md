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
- **Advanced collision avoidance**: Cluster-based jiggling algorithm that optimizes placement of nearby labels simultaneously
- **Size-based zoom filtering**: Features appear progressively based on area and zoom level

### 🎯 **Interactive Features**
- **Pan and zoom** with smooth performance
- **Hover HUD** with feature information
- **Autofit to land** for optimal initial view
- **Performance monitoring** with built-in timers

## Key Algorithms

### **Cluster Jiggling Algorithm**
The label placement system uses an innovative "cluster jiggling" approach:
- **Cluster detection**: Groups nearby labels (within 200px) for simultaneous optimization
- **Systematic combination testing**: For small clusters (≤3 labels), tries ALL possible combinations (up to 729 combinations)
- **Distance optimization**: Selects placement that minimizes total distance from feature centroids
- **Intelligent fallback**: Uses overlapped placement only when necessary

### **Size-Based Zoom Filtering**
- **Oceans**: Always visible
- **Lakes**: Tiny (50+) at zoom 2x, Small (200+) at zoom 1x, Medium (800+) at zoom 0.5x, All at zoom 4x
- **Islands**: Tiny (30+) at zoom 1.5x, Small (150+) at zoom 0.8x, Medium (600+) at zoom 0.4x, All at zoom 3x

### **Collision Avoidance**
- **Quadtree spatial indexing** for efficient collision detection
- **Cardinal direction offsets** (9 positions per label: centroid + 8 directions)
- **Priority-based placement** (oceans > lakes > islands)
- **Visual indicators** for overlapped labels (reduced opacity)

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
```

### **Development Tools**
For comprehensive debugging and testing, see the `/dev/` directory:
- **Test pages**: Focused testing of specific features
- **Debug scripts**: Console-based diagnostics
- **Performance tools**: Monitoring and optimization helpers

### **Test Pages**
- **Main app**: `index.html`
- **Development tools**: See `/dev/` directory for comprehensive test pages and debugging tools

## Architecture

### **Core Modules**
- **`geometry.js`**: Poisson-disc sampling, Voronoi construction, neighbor detection
- **`heightmap.js`**: Terrain generation and height assignment
- **`features.js`**: Feature marking (ocean/lake/island detection)
- **`labels.js`**: Label generation, placement, and zoom filtering
- **`names.js`**: Fantasy hydronyms and island names
- **`interaction.js`**: Pan/zoom and hover HUD
- **`autofit.js`**: Land bounding box and fit-to-view

### **Data Flow**
1. **Seed & Sampling** → `rng`, `poissonDiscSampler`
2. **Voronoi** → `buildVoronoi`, `detectNeighbors`
3. **Heightmap** → `randomMap` (heights ∈ [0,1])
4. **Features** → `markFeatures` (sets `featureType`, components)
5. **Labels** → `buildFeatureLabels` → `placeLabelsAvoidingCollisions` → `filterByZoom`
6. **Interaction** → `attachInteraction` (zoom, hover HUD)
7. **Autofit** → `fitToLand` (uses `computeLandBBox`)

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

### **Collision Avoidance**
```javascript
{
  clusterRadius: 200,  // Pixels for cluster detection
  maxCombinations: 1000, // Maximum combinations to try
  offsetDistance: 0.6  // 60% of label size for offsets
}
```

## Performance

### **Optimizations**
- **RequestAnimationFrame** for hover/HUD throttling
- **Quadtree collision detection** for O(log n) spatial queries
- **Combination limiting** to prevent exponential growth
- **Early termination** when collision-free placement found
- **Layer management** to minimize DOM manipulation

### **Memory Usage**
- **Cluster formation**: O(n²) for initial clustering
- **Combination generation**: O(9^n) for small clusters, O(500) for large
- **Collision detection**: O(log n) per check using quadtree

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

## Contributing

### **Guidelines**
- **No new dependencies** - keep it vanilla
- **Performance first** - avoid layout thrash
- **Deterministic generation** - maintain seedable RNG
- **Modular design** - keep functions focused and testable

### **Debugging Tips**
- Use `debugLabels()` for comprehensive inspection
- Check console for placement statistics
- Monitor performance with built-in timers
- Test with various zoom levels and feature densities

## License

[Add your license here]
