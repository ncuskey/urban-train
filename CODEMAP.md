# Code Map - Urban Train Map Generator

## Overview

This document provides a detailed map of the codebase structure, functions, and their relationships for the Urban Train procedural map generator.

## File Structure

```
urban-train/
├── index.html              # Main HTML interface
├── styles.css              # Application styling
├── src/
│   ├── main.js             # Core application logic
│   ├── core/
│   │   ├── rng.js          # Deterministic, seedable RNG
│   │   └── timers.js       # Performance timing utilities
│   ├── modules/
│   │   ├── geometry.js     # Voronoi diagram and neighbor detection
│   │   ├── heightmap.js    # Terrain generation and height mapping
│   │   ├── features.js     # Geographic feature detection and naming
│   │   ├── coastline.js    # Coastline tracing and path generation
│   │   ├── rendering.js    # Polygon rendering and visual effects
│   │   ├── interaction.js  # Zoom and hover HUD functionality
│   │   ├── autofit.js      # Promise-based land fitting and autoFitToWorld
│   │   ├── labels.js       # Feature labeling with collision avoidance
│   │   ├── names.js        # Fantasy hydronyms and island names
│   │   └── refine.js       # Adaptive coastline refinement
│   ├── render/
│   │   └── layers.js       # SVG layer management
│   └── selftest.js         # Regression testing and validation
├── README.md               # Project overview and quick start
├── devlog.md               # Comprehensive development log (consolidated)
└── CODEMAP.md              # This file
```

## HTML Structure (index.html)

### Key Elements
- **SVG Canvas**: 640x360 pixel map area with filters and patterns
- **Control Panel**: Buttons for map generation and navigation
- **Options Panel**: Collapsible settings for terrain customization
- **Debug Display**: Real-time cell information display

### Dependencies
- D3.js v5 (CDN)
- jQuery 3.6.0 (CDN)
- Local CSS and JavaScript files

## CSS Structure (styles.css)

### Layout Classes
- `.controls`: Main control button container
- `.options-panel`: Collapsible settings panel
- `.options-left/.options-right`: Settings layout divisions

### SVG Styling
- Map cell colors and strokes
- Coastline and feature styling
- Interactive element states

## JavaScript Architecture

### Label System
**Purpose**: Automatic feature labeling with deduplication and proper placement
**Key Features**:
- **`computeMapLabels(polygons)`**: Groups polygons by feature type and name, calculates centroids
- **`drawLabels(data)`**: Renders labels with keyed data joins to prevent accumulation
- **Feature-specific styling**: Different colors and weights for Islands, Oceans, and Lakes
- **Coordinate space management**: Labels scale with map or maintain constant size
- **Deduplication**: One label per unique feature (no duplicates)
- **Centroid calculation**: Proper placement at feature centers, not edges

### Core Modules

#### `src/core/rng.js`
**Purpose**: Deterministic, seedable random number generation
**Key Features**:
- **sfc32 + xmur3 algorithms** for high-quality random numbers
- **Seeded generation** for reproducible results
- **Helper methods**: `random()`, `int()`, `float()`, `bool()`, `pick()`, `shuffle()`
- **Global singleton** for quick access

#### `src/core/timers.js`
**Purpose**: Performance monitoring and timing utilities
**Key Features**:
- **Mark/lap timing** for performance measurement
- **Console.table output** for detailed analysis
- **RequestAnimationFrame integration** for accurate timing
- **Summary generation** for performance reports

#### `src/render/layers.js`
**Purpose**: SVG layer management and organization
**Key Features**:
- **Centralized layer creation** with proper stacking order
- **Layer validation** for self-tests
- **Clear layer functionality** for cleanup
- **Default layer order** management

#### `src/selftest.js`
**Purpose**: Validation and regression testing
**Key Features**:
- **Graph neighbor reciprocity** validation
- **Height range validation** (0..1)

#### `src/modules/autofit.js`
**Purpose**: Promise-based land fitting and viewport management
**Key Features**:
- **`fitToLand()`**: Promise-based autofit that resolves when transition completes
- **`autoFitToWorld()`**: Alternative fitting function for custom world bounds
- **`computeLandBBox()`**: Calculates land bounding box for optimal fitting
- **Transition event handling**: Proper Promise resolution on 'end' or 'interrupt' events

#### `src/modules/labels.js`
**Purpose**: Feature labeling with collision avoidance and zoom filtering
**Key Features**:
- **`getVisibleWorldBounds()`**: Gets post-autofit visible world bounds
- **`placeLabelsAvoidingCollisions()`**: Advanced collision detection and placement
- **`filterByZoom()`**: Level-of-detail filtering based on zoom level
- **Ocean label placement**: Rectangle-based placement after autofit completion with consistent CSS styling
- **River width validation** (non-negative)
- **SVG layer presence** validation
- **Visual badge** with clickable failure details
- **Toast notifications** for non-blocking feedback
- **Helper functions**: `clamp01()`, `ensureReciprocalNeighbors()`

### Feature Modules

#### `src/modules/geometry.js`
**Purpose**: Voronoi diagram generation and neighbor detection
**Key Features**:
- **Poisson-disc sampling** for natural point distribution
- **Voronoi diagram creation** with D3.js
- **Neighbor detection** for connected regions
- **Polygon generation** from Voronoi cells

#### `src/modules/heightmap.js`
**Purpose**: Terrain generation and height mapping
**Key Features**:
- **Random map generation** with multiple features
- **Height spreading algorithms** for islands and hills
- **Terrain feature placement** and distribution
- **Deterministic generation** with seeded RNG

#### `src/modules/features.js`
**Purpose**: Geographic feature detection and naming
**Key Features**:
- **Flood-fill algorithms** for connected region identification
- **Ocean, island, and lake classification**
- **Random name generation** from adjective lists
- **Feature numbering** and grouping

#### `src/modules/names.js`
**Purpose**: Fantasy descriptive naming system with weighted templates
**Key Features**:
- **Weighted template system** for generating varied, descriptive names
- **60+ adjectives and 70+ nouns** for rich vocabulary
- **Ocean names**: "Sea of Fallen Stars", "Mare Umbra", "The Azure Deeps"
- **Lake names**: "Lake Sorrow", "Shimmering Lake", "Lotus Mere"
- **Island names**: "Dragon Isle", "Verdant Island", "Skullholm"
- **Flavor packs**: Norse, Greek, and Desert themes
- **Uniqueness enforcement** with fallback disambiguation
- **Seeded RNG integration** for reproducible generation

#### `src/modules/coastline.js`
**Purpose**: Coastline tracing and path generation
**Key Features**:
- **Land-water boundary detection** using height thresholds
- **Edge collection and classification** by feature type
- **Continuous path generation** for coastlines and lakeshores
- **Shallow water marking** for ocean-adjacent areas
- **D3 path generation** with smooth curve interpolation
- **DOM path creation** for multiple SVG layers (coastline, lakecoast, islandBack, mask)

#### `src/modules/rendering.js`
**Purpose**: Polygon rendering and visual effects
**Key Features**:
- **Land cell polygon rendering** with height-based color interpolation
- **Sea cutoff logic** with configurable threshold (0.2 default, 0 when seaInput.checked)
- **Shallow water cell rendering** for ocean-adjacent areas
- **Blur effect management** with adjustable stroke width
- **Stroke outline rendering** for cell boundaries
- **DOM cleanup** and re-rendering for dynamic updates

#### `src/modules/interaction.js`
**Purpose**: Zoom, pan, and hover HUD functionality with LOD optimization
**Key Features**:
- **D3 zoom behavior** with scale limits (0.5-32x) and translate extent
- **Smooth pan and zoom** with proper v5 event handling
- **Hover HUD updates** with real-time cell information display
- **Level-of-Detail (LOD) system** for performance optimization
- **Spatial picking** for efficient cell selection without DOM hit-testing
- **Performance optimization** with RequestAnimationFrame throttling
- **Change detection** to prevent redundant DOM updates
- **Vanilla DOM updates** for high-frequency UI performance
- **Auto-fit functionality** for optimal map viewing
- **Cleanup API** for event listener management
- **Label counter-scaling** for constant on-screen label size during zoom operations
- **Global transform tracking** for coordinate conversions
- **Coordinate space conversion** for proper mouse picking

### Counter-Scaling Implementation
**Purpose**: Maintains constant on-screen label size during pan/zoom operations
**Key Features**:
- **Dual transform system**: Map groups get normal zoom transforms, labels get counter-scaling
- **Vector-effect attributes**: `vector-effect="non-scaling-stroke"` for constant halo width
- **Zoom level guards**: Counter-scaling clamped to reasonable bounds (0.5x to 32x)
- **Rotation preservation**: Maintains existing label rotation during counter-scaling
- **Performance optimized**: No font-size recalculations, efficient transform-based scaling
- **Debug logging**: Console output when counter-scaling is applied (controlled by `window.DBG.labels`)
- **CSS kill switch**: Debug rectangles can be hidden with CSS rules

**Implementation Details**:
- **Zoom handler**: `zoomed()` function in `interaction.js` applies counter-scaling to all label groups
- **Label creation**: All text elements created with vector-effect attributes in `labels.js`
- **Font-size scaling removed**: `updateLabelZoom()` function no longer scales font sizes
- **Transform chain**: `translate(x,y) + scale(1/k) + rotate(angle)` for each label group
- **Documentation**: Comprehensive details available in `devlog.md`

#### `src/modules/refine.js`
**Purpose**: Adaptive coastline refinement for smoother shorelines
**Key Features**:
- **Coastal edge detection** between land (height ≥ 0.2) and sea (height < 0.2) cells
- **Point insertion** along coastal edges with controlled spacing
- **De-duplication** using d3.quadtree to prevent clustering
- **Voronoi rebuild** with augmented sample set
- **Height transfer** from old cells to new cells using nearest-neighbor lookup
- **Neighbor preservation** with idempotent `detectNeighbors` calls
- **Performance optimization** with minimum point threshold (10 points)
- **Configurable spacing** based on global Poisson radius settings

### Main Application (src/main.js)

### Global Functions (Window Object)

#### `generate(count)`
**Purpose**: Main initialization and map generation function
**Parameters**: 
- `count` (optional): Number of random features to generate
**Key Operations**:
- Sets up SVG canvas and D3.js elements
- Creates Poisson-disc sampling
- Generates Voronoi diagram
- Initializes interactive features
- Integrates modular components (RNG, Timers, Layers, Self-tests, Rendering)
- Calls `randomMap(count)` if count provided
- **Applies adaptive coastline refinement** for smoother shorelines
- Performs validation and performance monitoring
- Imports rendering functions from `src/modules/rendering.js`

#### `undraw()`
**Purpose**: Clears the current map and resets settings
**Operations**:
- Removes all SVG groups and paths
- Resets input values to defaults

#### `toggleOptions()`
**Purpose**: Shows/hides the options panel
**Operations**:
- Toggles `hidden` attribute on options panel

#### `toggleBlobCenters()`
**Purpose**: Shows/hides terrain center points
**Operations**:
- Toggles visibility of `.circles` elements

#### `toggleLabelScaling()`
**Purpose**: Toggles between scaling and constant-size label modes
**Operations**:
- Switches `LABELS_NONSCALING` global flag
- Re-applies current transform to update label scaling
- Logs current mode to console

#### `computeMapLabels(polygons)`
**Purpose**: Computes label data with deduplication and proper positioning
**Parameters**:
- `polygons`: Array of polygon objects with feature data
**Returns**: Array of label objects with id, name, x, y, kind properties
**Operations**:
- Groups polygons by feature type and name
- Calculates centroids for each feature group
- Creates unique IDs for keyed data joins
- Filters out features without type/name data

#### `drawLabels(data)`
**Purpose**: Renders labels with proper coordinate space management
**Parameters**:
- `data`: Array of label objects from `computeMapLabels`
**Operations**:
- Clears existing labels to prevent accumulation
- Uses keyed data joins with unique IDs
- Applies feature-specific CSS classes
- Positions labels in world coordinates
- Supports both scaling and constant-size modes

### Core Map Generation Functions

#### `poissonDiscSampler(width, height, radius)`
**Purpose**: Creates evenly distributed points for natural terrain
**Returns**: Function that generates sample points
**Algorithm**: Based on Jason Davies' implementation
**Key Features**:
- Maintains minimum distance between points
- Uses grid-based optimization
- Generates points until no more can fit

#### `detectNeighbors()`
**Purpose**: Identifies adjacent cells for each polygon
**Operations**:
- Iterates through Voronoi diagram cells
- Finds shared edges between polygons
- Stores neighbor indices in polygon objects
- **Preserves existing heights** (idempotent operation)

#### `refineCoastlineAndRebuild()`
**Purpose**: Adds detail points along coastal edges for smoother shorelines
**Parameters**:
- `samples`: Original point set
- `diagram`: Current Voronoi diagram
- `polygons`: Current polygon array
- `mapWidth/mapHeight`: Map dimensions
- `seaLevel`: Height threshold (default 0.2)
- `targetSpacing`: Desired point spacing
- `minSpacingFactor`: Minimum spacing factor for de-duplication
**Operations**:
- Detects edges between land (≥ seaLevel) and sea (< seaLevel) cells
- Subdivides coastal edges with controlled spacing
- Uses quadtree for efficient de-duplication
- Rebuilds Voronoi diagram with augmented samples
- Transfers heights from old cells to new cells
- Returns updated samples, diagram, and polygons

#### `add(start, type)`
**Purpose**: Adds terrain features to the map
**Parameters**:
- `start`: Index of starting polygon
- `type`: "island" or "hill"
**Algorithm**:
- Flood-fill approach spreading from start point
- Height decreases with distance from center
- Supports different spreading patterns for islands vs hills
- Uses seeded RNG for deterministic behavior
- Includes safety checks for undefined polygon access

### Visualization Functions

#### `drawPolygons()` (from `src/modules/rendering.js`)
**Purpose**: Renders terrain polygons with colors and effects
**Parameters**:
- `polygons`: Array of polygon objects with height and type data
- `color`: D3 color scale for height interpolation
- `seaInput`: Checkbox controlling sea cutoff threshold
- `blurInput`: Input controlling blur effect intensity
- `mapCellsLayer`: D3 selection for land cell paths
- `oceanLayer`: D3 selection for ocean rectangle
- `shallowLayer`: D3 selection for shallow water paths
- `circlesLayer`: D3 selection for seed circles
- `svg`: Main SVG selection for cleanup operations
**Operations**:
- Removes existing polygons
- Creates new paths based on height values
- Applies color interpolation
- Handles visual effects (blur, strokes)
- Renders shallow water cells
- Manages sea cutoff logic

#### `markFeatures()`
**Purpose**: Identifies and names geographic features
**Algorithm**:
- Flood-fill to identify connected regions
- Classifies areas as Ocean, Island, or Lake
- Assigns random names from adjective list
**Features**:
- Ocean detection from corner point
- Island/lake classification by height
- Connected region grouping

#### `drawCoastline()` (from `src/modules/coastline.js`)
**Purpose**: Creates smooth coastline boundaries
**Algorithm**:
- Detects edges between land and water using height thresholds
- Groups edges by feature type (Island/Lake)
- Creates continuous paths using D3 line generator with curveBasisClosed
- Marks shallow water for ocean-adjacent areas
**Features**:
- Handles both island and lake coastlines
- Creates smooth curved paths with proper interpolation
- Supports shallow water detection and marking
- Generates paths for multiple SVG layers (coastline, lakecoast, islandBack, mask)
- Uses jQuery grep for edge filtering and connection

### Interactive Features

#### Click Handler
**Purpose**: Adds terrain on map clicks
**Logic**:
- First click creates island
- Subsequent clicks create hills
- Updates settings automatically
- Triggers map redraw

#### Mouse Movement Handler (`moved()`)
**Purpose**: Provides real-time cursor information with optimized performance
**Displays**:
- Current cell index
- Height value
- Feature name and type
**Performance Optimizations**:
- RequestAnimationFrame throttling for smooth updates
- Change detection to only update when cell changes
- Vanilla DOM updates instead of jQuery for faster performance
- Removed visual cursor indicator for better performance
**Location**: Extracted to `src/modules/interaction.js`

#### Zoom and Pan
**Purpose**: Navigation controls with performance optimization
**Implementation**:
- D3 zoom behavior bound directly to SVG
- Scale limits (0.5-32x) with translate extent
- Smooth transitions with proper v5 event handling
- Level-of-Detail (LOD) system for performance
- Auto-fit functionality for optimal viewing
- Spatial picking for efficient cell selection
**Location**: Extracted to `src/modules/interaction.js`

### Random Map Generation

#### `randomMap(count)`
**Purpose**: Creates maps with random terrain features
**Algorithm**:
- Creates one large island in center area
- Adds smaller hills in surrounding areas
- Ensures proper spacing and positioning
- Applies random height variations

### Utility Functions

#### `toggleBlur()` (from `src/modules/rendering.js`)
**Purpose**: Adds/removes blur effects on terrain
**Parameters**:
- `polygons`: Array of polygon objects with height data
- `color`: D3 color scale for height interpolation
- `seaInput`: Checkbox controlling sea cutoff threshold
- `blurInput`: Input controlling blur effect intensity
- `mapCellsLayer`: D3 selection for land cell paths
**Operations**:
- Creates stroke effects on polygons
- Adjustable stroke width
- Respects sea polygon settings
- Manages sea cutoff logic

#### `toggleStrokes()`
**Purpose**: Shows/hides grid lines between cells
**Operations**:
- Adds grey strokes to polygons
- Toggle-based visibility
- Respects height thresholds

## Data Structures

### Polygon Objects
```javascript
{
  index: number,           // Cell index
  height: number,          // Terrain height (0-1, normalized)
  neighbors: [number],     // Adjacent cell indices (reciprocal)
  featureType: string,     // "Ocean", "Island", "Lake"
  featureName: string,     // Random adjective name
  featureNumber: number    // Feature instance number
}
```

### State Object
```javascript
{
  seed: number             // Current generation seed
}
```

### Global Configuration
```javascript
{
  currentTransform: d3.zoomTransform,  // Current zoom transform for coordinate conversions
  LABELS_NONSCALING: boolean           // Label scaling mode (false = scale with map, true = constant size)
}
```

### Timer Objects
```javascript
{
  label: string,           // Timing label
  ms: number              // Duration in milliseconds
}
```

### Edge Objects
```javascript
{
  start: string,           // "x y" coordinates
  end: string,             // "x y" coordinates
  type: string,            // "Island" or "Lake"
  number: number           // Feature number
}
```

### Label Objects
```javascript
{
  id: string,              // Unique identifier (e.g., "ocean:warm-ocean")
  name: string,            // Display text (e.g., "Warm Ocean")
  x: number,               // World coordinate X position
  y: number,               // World coordinate Y position
  kind: string,            // Feature type for CSS styling ("ocean", "island", "lake")
  featureType: string,     // Original feature type ("Ocean", "Island", "Lake")
  featureName: string      // Original feature name
}
```

## Key Algorithms

### 1. Poisson-disc Sampling
- **Purpose**: Natural point distribution
- **Complexity**: O(n log n)
- **Features**: Minimum distance enforcement, grid optimization

### 2. Voronoi Diagram Generation
- **Purpose**: Cellular terrain division
- **Implementation**: D3.js voronoi()
- **Features**: Bounded extent, polygon generation

### 3. Flood Fill
- **Purpose**: Connected region identification
- **Implementation**: Queue-based breadth-first search
- **Features**: Height-based classification, name assignment

### 4. Coastline Path Finding
- **Purpose**: Continuous boundary creation
- **Algorithm**: Edge traversal and path construction with jQuery grep filtering
- **Features**: Smooth curves with curveBasisClosed, feature-specific paths, shallow water marking

### 5. Deterministic RNG (sfc32 + xmur3)
- **Purpose**: Reproducible random number generation
- **Implementation**: Custom sfc32 + xmur3 algorithms
- **Features**: Seeded generation, high-quality randomness

### 6. Performance Timing
- **Purpose**: Accurate performance measurement
- **Implementation**: RequestAnimationFrame-based timing
- **Features**: Mark/lap functionality, console.table output

### 7. Self-Testing
- **Purpose**: Validation and regression testing
- **Implementation**: Invariant checking with visual feedback
- **Features**: Graph validation, height normalization, layer verification

### 8. Level-of-Detail (LOD) System
- **Purpose**: Performance optimization through adaptive rendering
- **Implementation**: Automatic switching between raster and vector rendering
- **Features**: Zoom-based threshold switching, stroke optimization, spatial picking

### 9. Fantasy Naming System
- **Purpose**: Generate rich descriptive names for geographic features
- **Implementation**: Weighted template system with seeded RNG
- **Features**: Ocean, lake, and island name generation with uniqueness enforcement

## Event Flow

1. **Page Load**: `generate()` called automatically with modular initialization
2. **User Interaction**: Click handlers trigger terrain addition
3. **Map Update**: `drawPolygons()`, `markFeatures()`, `drawCoastline()` called
4. **Validation**: Self-tests run with visual feedback via badge
5. **Performance**: Timing data logged to console
6. **Visual Feedback**: Real-time cursor information updates
7. **Settings Changes**: Option toggles trigger visual updates

## Performance Considerations

- **Voronoi Generation**: O(n log n) complexity
- **Flood Fill**: O(n) for each feature
- **Rendering**: Efficient D3.js updates
- **Memory**: Polygon objects stored in memory
- **Optimization**: Grid-based neighbor detection
- **Hover Performance**: RequestAnimationFrame throttling and change detection
- **DOM Updates**: Vanilla JavaScript for high-frequency UI updates
- **Visual Effects**: Removed unnecessary cursor rendering for better performance
- **Modular Architecture**: ES6 modules for better code splitting and caching
- **Interaction Module**: Extracted zoom and hover logic for better maintainability
- **Level-of-Detail (LOD)**: Automatic raster/vector switching for performance
- **Spatial Picking**: Efficient cell selection without DOM hit-testing
- **Fantasy Naming**: Weighted template system for descriptive geographic names
- **Deterministic Generation**: Seeded RNG eliminates need for re-generation
- **Performance Monitoring**: Built-in timing for optimization insights
- **Self-Testing**: Automated validation prevents regressions

## Browser Compatibility

- **ES6 Modules**: Modern browser support required
- **D3.js v5**: Compatible with Chrome 60+, Firefox 55+
- **SVG Support**: Universal modern browser support
- **Touch Events**: Mobile-friendly interaction

## Future Enhancements

- **Phase 1**: Extract remaining visualization and utility functions
- **Phase 2**: Advanced terrain features (rivers, mountains, biomes)
- **Phase 3**: Save/Load functionality and map persistence
- **Phase 4**: WebGL rendering for larger maps
- **Export**: Image and data export capabilities
- **Multiplayer**: Collaborative map creation
- **Advanced UI**: Enhanced controls and visualization options

## Documentation

- **`README.md`**: Project overview, quick start, and feature summary
- **`devlog.md`**: Comprehensive development log covering all implementation details, fixes, and technical decisions
- **`CODEMAP.md`**: This file - detailed code structure and function documentation
- **`dev/README.md`**: Development tools and test page documentation
