# CODEMAP.md (refreshed)

## Overview

A map of the source layout, key functions, and typical control flow. Line numbers are approximate and may shift as you edit; they are provided for orientation.

```
urban-train/
├── index.html              # Main UI and controls; CDN scripts; module entry
├── styles.css              # Fonts, label styles, theme variables
├── src/
│   ├── main.js             # Orchestrates generation, rendering, labels, zoom
│   ├── core/
│   │   ├── rng.js          # Seedable RNG
│   │   ├── timers.js       # Lightweight timing helpers
│   │   ├── zoom-utils.js   # Reliable zoom state access (Step 7)
│   │   ├── idle.js         # Centralized idle scheduler with cancellation (Step 8)
│   │   └── rect.js         # Rectangle utilities (intersect, clamp, water fraction)
│   ├── modules/
│   │   ├── geometry.js     # Poisson-disc sampling + Voronoi + neighbors
│   │   ├── heightmap.js    # Seed blobs + diffuse heights; clamp 0..1
│   │   ├── coastline.js    # Coastline tracing/paths
│   │   ├── features.js     # Flood-fill oceans/lakes/islands
│   │   ├── names.js        # Fantasy naming; inflection rules; uniqueness
│   │   ├── labels-null-shim.js # Temporary null implementations (Step 0)
│   │   ├── interaction.js  # D3 zoom/pan; counter-scaling; LOD visibility
│   │   ├── autofit.js      # Fit view to land/world; post-layout hooks
│   │   ├── rendering.js    # Polygon rendering
│   │   ├── fonts.js        # Font theme helpers
│   │   ├── geo.js          # Map coordinates & per-cell latitude (Step 4)
│   │   ├── climate.js      # Temperature assignment by latitude & altitude (Step 5a)
│   │   ├── lakes.js        # Priority-flood lake detection and outlet routing (Step 6)
│   │   ├── rivers.js       # River generation: downhill routing + flux accumulation (Step 7)
│   │   ├── watersheds.js   # Watershed analysis, Strahler/Shreve orders, discharge Q (Step 8)
│   │   └── refine.js       # Coastline refinement + rebuild cycle
│   ├── labels/              # NEW: Labeling system (Step 1+)
│   │   ├── schema.js       # Runtime validation + style lookup builder
│   │   ├── style-tokens.js # Style definitions (tiers, categories, rules)
│   │   ├── index.js        # Initialization + getters
│   │   ├── anchors.js      # Proto-anchors from polygons (Step 2)
│   │   ├── spatial-index.js # Quadtree spatial indexing (Step 2)
│   │   ├── enrich.js       # Anchor enrichment with polygon context (Step 3)
│   │   ├── style-apply.js  # Style attachment to anchors (Step 3)
│   │   ├── placement/      # NEW: Label placement pipeline (Step 5+)
│   │   │   └── candidates.js # Candidate boxes for visible anchors (Step 5+)
│   │   ├── metrics/        # NEW: Text measurement system (Step 7)
│   │   │   └── text-metrics.js # Canvas-based text dimensions + caching
│   │   ├── lod.js          # LOD bands + zoom filtering (Step 4)
│   │   ├── water-split.js  # Water component topology + kind assignment (Step 3b)
│   │   ├── anchors-water.js # Water-specific anchor building (Step 3b)
│   │   ├── debug-markers.js # QA dots + rectangles for debugging
│   │   └── ocean/          # NEW: Ocean label placement system
│   │       ├── layout.js   # Ocean label layout computation
│   │       └── sat.js      # SAT utilities (water mask, erosion, largest rectangle)
│   ├── ui/                 # NEW: UI modules
│   │   └── layers-panel.js # Layer visibility controls
│   ├── debug/              # NEW: Debug renderers
│   │   ├── climate-layers.js # Temperature/precipitation debug visualizations
│   │   ├── scalar-overlay.js # Scalar field visualization (height/temp/precip)
│   │   └── scalar-legend.js  # Interactive legend for scalar overlays
│   ├── render/
│   │   ├── layers.js       # SVG layer creation/ordering/cleanup
│   │   ├── rivers.js       # River rendering: centroid-to-centroid lines with flux-based width
│   │   ├── rivers-edges.js # River rendering: edge-following segments with discharge-based width
│   │   └── lakes.js        # Lake rendering: polygon fills for priority-flood detected lakes
│   └── selftest.js         # Sanity checks + badge
├── dev/                    # Sandboxes for local testing
│   ├── test-text-metrics.html    # Text metrics testing (Step 7)
│   ├── test-zoom-utils.html      # Zoom utilities testing (Step 7)
│   ├── test-collision-qa.html    # Collision QA testing (Step 6)
│   ├── test-candidates.html      # Candidates testing (Step 5)
│   └── ...                        # Other test pages
├── vendor/

├── README.md
└── CODEMAP.md
```

---

## Module notes & key entry points

### `src/main.js` (≈1577 lines)

* **`generate(count)`** (≈ line 361): Master pipeline. Creates layers, samples sites, builds Voronoi, assigns heights, draws coastline, classifies features, initializes labeling style system, builds proto-anchors with spatial indexing, and wires zoom.
* **Calls**:

  * `initLabelingStyle()` (≈ 365): Initialize Step 1 labeling style system
  * `attachInteraction(...)` (≈ 441)
  * `buildProtoAnchors()` (≈ 553): Build Step 2 proto-anchors from largest polygons
  * `makeAnchorIndex()` (≈ 554): Create spatial index for collision detection
  * `enrichAnchors()` (≈ 564): Enrich anchors with polygon context and kind classification (Step 3)
  * `attachStyles()` (≈ 567): Attach styles to anchors based on kind (Step 3)
  * `buildFeatureLabels(...)` (≈ 541) and `placeLabelsAvoidingCollisions(...)` (≈ 567/846/887) - via null shim
  * `initLayersPanel({ svg, polygons })` (≈ 1882): Initialize layer visibility controls after climate assignment
  * `fitToLand` / `autoFitToWorld` usage appears via helpers and menu actions.
* **Candidates System** (Step 5): LOD-aware candidate boxes for label placement
  * `window.syncQACandidates(k)`: Zoom-driven candidate updates with LOD filtering
  * `window.__candidates`: Global access to current candidate data
  * `window.clearQACandidates()`: Remove QA rectangles for testing
  * Flag-gated with `?flags=qaCandidates` URL parameter
* **Collision System** (Step 6): Greedy collision pruning with spatial indexing
  * `window.syncQACollision(k)`: Zoom-driven collision updates with LOD filtering
  * `window.__placed` / `window.__rejected`: Global access to collision results
  * `greedyPlace(candidates, { cell = 64 })`: Efficient collision detection algorithm
  * Grid-based spatial indexing for O(1) neighborhood queries
  * Priority-based ranking with tier scores + kind boosts + area penalties
  * Flag-gated with `?flags=qaCollide` URL parameter
* **Text Metrics System** (Step 7): Canvas-based text measurement for precise label sizing
  * `measureLabel({ text, style, tier })`: Precise text dimensions with font properties
  * **Caps transformation**: upper, title case with smart word handling
  * **Letter spacing**: accurate width calculations including tracking
  * **Performance caching**: prevents repeated Canvas operations
  * **Fallback metrics**: graceful degradation when Canvas unavailable
* **Zoom Utilities** (Step 7): Reliable zoom state access throughout application
  * `getZoomScale()`: Current zoom scale factor with fallback
  * `getZoomTransform()`: Full zoom transform object {k, x, y}
  * `getZoomState()`: Convenient zoom state with human-readable level
  * **Global functions**: `window.getZoomScale`, `window.getZoomTransform`, `window.getZoomState`
  * **QA seeding**: Immediate QA updates after autofit using current zoom level
* **Idle Scheduler** (Step 8): Centralized idle scheduling with cancellation support
  * `deferIdle(cb, { timeout, fallbackDelay, signal })`: Safari-safe idle scheduling
  * **Fallback handling**: Automatic setTimeout when requestIdleCallback unavailable
  * **Cancellation**: `.cancel()` method prevents duplicate executions
  * **Signal support**: AbortSignal for early cancellation
  * **Ocean placement**: Deferred to idle time to avoid blocking main thread
* **Ocean Placement System** (Step 8+): Advanced interior water mask system with Manhattan distance transforms and maximal water-only rectangles
  * **Interior water mask**: Manhattan distance transform creates guaranteed coast-free water areas
  * **Screen space unification**: All computation in screen coordinates with proper world coordinate conversion at render time
  * **Transform helpers**: `currentZoomTransform()`, `toScreenXY()`, `toWorldXY()` for coordinate conversion
  * **Distance-based erosion**: Two-pass Manhattan distance transform ensures proper padding from coastlines
  * **Largest rectangle algorithm**: O(gw*gh) histogram + monotonic stack for globally optimal water-only rectangles
  * **Water-only constraints**: Hard 95% minimum water fraction with corrected prefix sum calculations
  * **Robust fallback chain**: Interior → frame → corner selection with water purity gates
  * **Screen-space debug overlay**: Non-zoomed debug rectangles with color-coded selection methods
  * **Defensive validation**: Minimum size requirements and water fraction guards prevent invalid placements
  * **Smart fallback system**: Maximal rectangle → frame→refine with consistent water-only enforcement
  * **Enhanced scoring**: Power functions for better land avoidance, aspect ratio penalties
  * **Store safety**: Merge-safe updates prevent data loss during label operations
* **Screen Space Coordinate System**: Transform helpers for unified coordinate handling
  * `currentZoomTransform()`: Gets current zoom transform from SVG
  * `toScreenXY([x, y])`: Converts world coordinates to screen coordinates
  * `toWorldXY([sx, sy])`: Converts screen coordinates to world coordinates
* **Interior Water Mask System**: Manhattan distance transform for guaranteed coast-free placement
  * `buildInteriorMask(mask, padPx)`: Creates interior water mask with distance-based erosion
  * `largestAllOnesRect(mask)`: Finds largest rectangle of 1s in interior mask using histogram + stack
  * `chooseOceanRect(mask, padPx)`: Main function combining interior mask + validation
  * `gridRectToScreen(mask, r)`: Converts grid rectangle to screen pixel coordinates
* **Binary Utilities**: Core mask manipulation functions
  * `invertBinary(A)`: Flips binary arrays (water↔land)
  * `countOnes(A)`: Counts 1s in binary arrays for statistics
  * `erodeBinary(a, gw, gh, steps)`: Binary erosion with 4-neighbor connectivity
* **Corrected Water Fraction Calculation**: Accurate water fraction computation
  * `buildPrefixSum(mask)`: Builds 2D prefix sum array for O(1) rectangle queries
  * `waterFrac(mask, rect)`: Returns accurate water fraction for specific rectangles
  * `gridRectFromScreen(mask, rect)`: Converts screen rectangle to grid coordinates
  * `sumPS(mask, gx0, gy0, gx1, gy1)`: Computes sum using prefix sum
* **Screen-Space Debug System**: Non-zoomed debug visualization
  * `ensureDebugOverlay()`: Creates screen-space debug overlay group
  * `drawDebugRect(kind, r, style)`: Draws debug rectangles with color-coded styling
* **Legacy SAT Helpers**: Maintained for compatibility
  * `buildSAT(a, gw, gh)`: Builds summed-area table for O(1) rectangle sum queries
  * `waterFracSAT(mask, rect)`: Legacy water fraction calculation (replaced by waterFrac)
* **Water-Only Constraints**: Hard constraints for placement quality
  * `OCEAN_MIN_WATER_FRAC = 0.97`: Hard cutoff for water fraction (97% minimum)
  * `OCEAN_AR_PENALTY = 0.6`: Aspect ratio penalty strength
  * `OCEAN_SAFE_INSET_PX = 8`: Safe viewport inset for boundary respect
* **Utilities**: `timeit` for coarse timings; `window.DEBUG` toggle.

### `src/core/rect.js`

* `intersectRect(a, b)`: Finds intersection of two rectangles, returns `{x, y, w, h}` or zero-area rect
* `clampPointToRect(x, y, rect, pad)`: Clamps point coordinates within rectangle bounds with optional padding
* `waterFractionInRect(mask, rect)`: Calculates water cell fraction within a screen-space rectangle
* **SAT integration**: Works with SAT mask objects for water-aware placement analysis
* **Coordinate conversion**: Handles screen-to-grid coordinate transformations

### `src/core/zoom-utils.js`

* `getZoomScale()`: Reliable zoom scale access with fallback to `window.currentTransform`
* `getZoomTransform()`: Full zoom transform object access
* `getZoomState()`: Convenient zoom state with human-readable level descriptions
* **Global setup**: Automatically provides `window.getZoomScale`, `window.getZoomTransform`, `window.getZoomState`

### `src/labels/metrics/text-metrics.js`

* `measureLabel({ text, style, tier })`: Canvas-based text measurement with caching
* **Font handling**: family, weight, italic, size per tier
* **Caps transformation**: upper, title case with smart word handling
* **Letter spacing**: accurate width calculations including tracking
* **Performance**: Cached results prevent repeated Canvas operations

### `src/modules/geometry.js`

* `poissonDiscSampler` (≈ 5): Even site distribution.
* `buildVoronoi` (≈ 76): Compute diagram.
* `detectNeighbors` (≈ 88): Reciprocal adjacency.

### `src/modules/heightmap.js`

* `randomMap` (≈ 4): Seed one large and several small blobs, diffuse.
* `add` (≈ 52): Height injection helper.

### `src/modules/coastline.js`

* `drawCoastline` (public): Build/paint coastline SVG paths.

### `src/modules/features.js`

* `markFeatures` (public): Flood‑fill and assign `featureType`, area, and other props. Invokes naming.

### `src/modules/names.js`

* `makeNamer` (public): Returns a name generator with:

  * adjective+noun pools (e.g., **Ancient**, **Azure** × **Winds**, **Storms**),
  * size‑aware terms (e.g., *Mere/Tarn/Pool* for lakes, *Sea/Ocean/Deep* for oceans),
  * uniqueness guard and grammar fixes (e.g., "Lake of the Winds").

### `src/labels/` (NEW: Step 1+ Labeling System)

* **`schema.js`**: Runtime validation for style tokens and style lookup builder
  * `validateStyleTokens(tokens)`: Validates tier format, category references, rule completeness
  * `buildStyleLookup(tokens)`: Creates kind→style Map by merging category base + rule overrides
* **`style-tokens.js`**: Style definitions with 4 tiers (t1-t4) and 3 categories
  * `landArea`: UPPERCASE serif fonts with loose letter spacing
  * `waterArea`: Italic Title Case with blue colors
  * `settlement`: Mixed case sans-serif styling
* **`index.js`**: Main module with initialization and getters
  * `initLabelingStyle(tokens)`: Validates and initializes the style system
  * `getStyleFor(kind)`: Returns merged style for a specific feature kind
  * `getStyleTokens()`: Returns the complete token configuration
* **`anchors.js`**: Proto-anchor creation from polygons (Step 2)
  * `buildProtoAnchors({ polygons, max = 200 })`: Creates anchors from largest polygons
  * `estimateTextWidth(text, px)`: Heuristic text width estimation
* **`spatial-index.js`**: Quadtree spatial indexing (Step 2)
  * `makeAnchorIndex(anchors)`: Creates D3 quadtree with query interface
* **`enrich.js`**: Anchor enrichment with polygon context (Step 3)
  * `enrichAnchors({ anchors, polygons, sea = 0.10 })`: Classifies water/land and links to polygons
  * `isWaterPoly(poly, sea)`: Water detection with multiple fallback strategies
* **`style-apply.js`**: Style attachment to anchors (Step 3)
  * `attachStyles(anchors)`: Attaches styles to anchors based on kind classification
* **`placement/candidates.js`**: Candidate boxes for visible anchors (Step 5+)
  * `makeCandidates({ anchorsLOD, k })`: Generates candidate boxes with LOD filtering
  * **Text metrics integration** (Step 7): Uses `measureLabel()` for precise dimensions
  * **Canvas-based measurement**: Real font metrics instead of heuristic estimation
  * **Caps transformation**: Applies caps during measurement for accurate sizing
  * **Letter spacing**: Accurate width calculations including tracking
  * Centered positioning with x0, y0, x1, y1 bounding box coordinates
  * LOD-aware visibility using `visibleAtK()` for zoom-based filtering
* **`placement/collide.js`**: Greedy collision detection with spatial indexing (Step 6)
  * `greedyPlace(candidates, { cell = 64 })`: Efficient collision pruning algorithm
  * `GridIndex` class with configurable cell size for fast neighborhood queries
  * Priority-based ranking using tier scores, kind boosts, and area penalties
  * AABB intersection testing with `intersects(a, b)` helper
  * Returns structured results: `{ placed, rejected }` arrays
* **`lod.js`**: Level-of-Detail bands and zoom filtering (Step 4)
  * `computeLOD(anchors, options)`: Attaches min/max zoom bands by tier
  * `visibleAtK(anchors, k)`: Filters anchors visible at zoom scale k
  * Per-kind overrides for QA-friendly visibility (sea: 1.1, lake: 1.2)
* **`debug-markers.js`**: QA debugging helpers
  * `renderQACandidates(svg, candidates)`: Draws orange rectangles for candidates
  * `renderQAWaterAnchors(svg, anchors)`: Draws colored dots for water anchors
  * `renderQACollision(svg, placed, rejected)`: Shows accepted (green) vs rejected (red) rectangles
  * `clearQACandidates(svg)`: Removes QA rectangles
  * World coordinate positioning with zoom transform support
  * Non-scaling strokes for crisp rendering under zoom transforms
* **`ocean/layout.js`**: Ocean label layout computation
  * `computeBestLayout(rect, label, k, opts)`: Finds optimal text layout within rectangle bounds
  * **Font sizing**: Dynamic font size optimization with min/max constraints
  * **Multi-line support**: Automatic line breaking with configurable max lines
  * **Scoring system**: Layout quality scoring based on fit, readability, and aesthetics
* **`ocean/sat.js`**: Legacy SAT utilities (main functionality moved to main.js)
  * `rasterizeWaterMask(viewport, cells, getHeight, getXY, seaLevel, cellPx)`: Creates screen-space water mask
  * `erodeWater(mask, r)`: Legacy binary erosion (replaced by erodeBinary)
  * `largestRectOnes(mask)`: Legacy rectangle finder (replaced by largestAllOnesRect)
  * `gridToScreenRect(mask, gr)`: Legacy coordinate conversion (replaced by gridRectToScreen)
  * **Note**: Core functionality moved to main.js for better integration with interior mask system

### `src/modules/labels-null-shim.js` (Temporary: Step 0)

* **Temporary null implementations** of all old labeling functions
* **Prevents crashes** during Step 0 while new system is being built
* **Will be replaced** by new modules as they're implemented

### `src/modules/interaction.js`

* `getZoomState` (≈ 6) / `getVisibleWorldBounds` (≈ 17) / `padBounds` (≈ 25)
* `attachInteraction` (≈ 33): D3 zoom; on zoom → update overlay positions, visibility thresholds, and viewport culling.
* `getCurrentTransform` (≈ 305): Get current zoom transform state.
* **Zoom-driven QA updates**: Automatic LOD filtering for QA dots, candidates, and collision detection
  * `syncQADotsLOD(t.k)`: Updates water anchor dots based on zoom level
  * `syncQACandidates(t.k)`: Updates candidate rectangles based on zoom level
  * `syncQACollision(t.k)`: Updates collision visualization based on zoom level
  * **Quiet zoom spam**: Console logging gated behind `?flags=debugZoomIdentity` URL parameter

### `src/modules/autofit.js`

* `afterLayout` (≈ 8): Safe "run after first layout" hook.
* `fitToLand` (≈ 89): Compute land bbox and pad; zoom to it.
* `autoFitToWorld` (≈ 141): Variant for broader framing.
* Also exposes `clampRectToBounds`, `computeLandBBox`.
* **Ocean placement**: Integrated with deferred placement system to avoid blocking `requestAnimationFrame`.

### `src/ui/layers-panel.js` (NEW: Layer Visibility Controls)

* **Layer visibility switcher**: Toggle visibility of map layers via HTML checkboxes
* `initLayersPanel({ svg, polygons })`: Initialize layer panel with event handlers
  * **Target selectors**: Maps layer names to CSS selectors (ocean, land, coast, rivers, labels, temp, precip, biomes)
  * **Debug layer creation**: Creates `#layer-temp` and `#layer-precip` groups under `#world`
  * **Event handling**: Checkbox changes trigger visibility updates and lazy debug rendering
  * **Bulk controls**: "Hide all" and "Show all" buttons for quick layer management
  * **Debug hook**: Exposes `window.LayerPanelDebug` for development access
* **Integration**: Called after climate assignment in main.js generation pipeline

### `src/debug/climate-layers.js` (NEW: Climate Debug Renderers)

* **Temperature debug renderer**: Visualizes temperature data as colored circles at cell centroids
  * `renderTempDebug(polygons, g)`: Renders temperature dots with blue→yellow→red color ramp
  * **Color mapping**: HSL-based ramp from blue (cold) to red (hot) via yellow (moderate)
  * **Data filtering**: Only renders cells with valid temperature values
* **Precipitation debug renderer**: Visualizes precipitation data as colored squares at cell centroids  
  * `renderPrecipDebug(polygons, g)`: Renders precipitation squares with light→dark blue gradient
  * **Color mapping**: HSL with varying lightness based on precipitation intensity
  * **Data filtering**: Only renders cells with valid precipitation values
* **Performance**: Uses D3 data join pattern for efficient updates, lazy rendering on first toggle

### `src/debug/scalar-overlay.js` (NEW: Scalar Field Visualization)

* **Scalar overlay renderer**: Colors land polygons by scalar field values (height, temperature, precipitation)
  * `renderScalarOverlay(polygons, g, { field, seaLevel })`: Renders colored polygons for land cells
  * **Field support**: "height", "temp", "prec" with appropriate color ramps
  * **Color ramps**: Height (green→bright red), Temperature (blue→yellow→red), Precipitation (white→blue)
  * **Land filtering**: Only renders cells above sea level by default
* **Color computation**: 
  * `scalarColor(field, t)`: Returns HSL color for normalized value t ∈ [0,1]
  * **Height**: Green to bright red gradient (hue 110→0, saturation 60→100%, lightness 45→55%)
  * **Temperature**: Blue to red via yellow (hue 240→0, saturation 85%, lightness 50%)
  * **Precipitation**: White to blue (hue 210, saturation 80%, lightness 95→35%)
* **Domain computation**:
  * `computeScalarDomain(polygons, field, seaLevel)`: Calculates min/max/mean values for land cells
  * **Statistics**: Returns `{ count, min, mean, max }` for legend generation
  * **Data filtering**: Only includes land cells with valid scalar values
* **Performance**: Uses D3 data join pattern with efficient polygon rendering
* **Integration**: Called from layers panel when scalar overlay is enabled

### `src/debug/scalar-legend.js` (NEW: Interactive Legend System)

* **Legend renderer**: Generates inline SVG legends for scalar overlays
  * `renderScalarLegend(polygons, seaLevel, field, container)`: Renders legend into DOM container
  * **Visual elements**: Gradient bar, min/mean/max value labels, field title
  * **Responsive design**: Shows/hides based on data availability
* **Value formatting**:
  * **Temperature**: Shows values with "°C" suffix (1 decimal place)
  * **Precipitation**: Shows values with 2 decimal places
  * **Height**: Shows values with 3 decimal places
  * **Invalid values**: Shows "—" for NaN/undefined values
* **SVG generation**: 
  * **Gradient bar**: Linear gradient with 3 stops (0%, 50%, 100%) using scalar color function
  * **Labels**: Min (left), mean (center), max (right) with proper text anchoring
  * **Dimensions**: 160×44px with 6px padding and 10px bar height
* **Accessibility**: Proper ARIA attributes and semantic structure
* **Integration**: Called from layers panel when scalar overlay is enabled or field changes

### `src/render/layers.js`

* `ensureLayers` (≈ 26): Root groups for polygons, coastline, labels, HUD.
* `ensureLabelSubgroups` (≈ 63): `#labels-root`, `#labels-world`, `#labels-overlay`.
* `clearLayer` (≈ 82): Housekeeping.

### `src/selftest.js`

* `ensureReciprocalNeighbors` (≈ 27)
* `runSelfTests` (≈ 41)
* `renderSelfTestBadge` (≈ 90)

### `src/modules/refine.js`

* `refineCoastlineAndRebuild` (≈ 6): Re‑sample the coastline and rebuild derived structures.

### `src/modules/rendering.js`

* `drawPolygons` (public): Core polygon paint; toggles blur when requested.

### `src/modules/fonts.js`

* `switchFont` (≈ 69), `getCurrentFont` (≈ 88), `listFonts` (≈ 104).

### `src/modules/geo.js` (NEW: Step 4 - Map Coordinates)

* **Map coordinate system**: Defines world-like geographic extents and assigns latitudes/longitudes to polygons
* `defineMapCoordinates({ width, height, centerLat, spanLat, centerLon, spanLon })`: Creates coordinate system with configurable center and span
  * Default: 120° latitude span, 180° longitude span, centered at (0°, 0°)
  * Returns: `{ width, height, latTop, latBottom, lonLeft, lonRight, kmPerPxAtEquator }`
  * Uses Earth's equatorial circumference (40,075.017 km) for realistic scale calculations
* `assignLatitudes(polygons, map)`: Assigns latitude to each polygon based on centroid Y position
  * Handles edge cases: empty arrays, null polygons, malformed geometry
  * Stores result in `poly.lat` property for each polygon
  * Latitude decreases as Y increases (SVG coordinate system)
* `assignLongitudes(polygons, map)`: Assigns longitude to each polygon based on centroid X position
  * Handles edge cases: empty arrays, null polygons, malformed geometry
  * Stores result in `poly.lon` property for each polygon
  * Longitude increases as X increases (standard geographic convention)
* `haversineKm(a, b)`: Calculates great-circle distance between two polygons in kilometers
  * Uses haversine formula with Earth radius of 6,371 km
  * Returns NaN for invalid inputs (missing lat/lon, non-finite values)
  * Enables distance-based features and scale calculations
* **Integration**: Called after height stats, before feature classification in main.js
* **Logging**: Enhanced coordinate logging shows `{ minLat, maxLat, minLon, maxLon }` ranges
* **Self-tests**: Optional geo monotonicity check verifies lat/lon alignment with x/y coordinates
* **Future use**: Enables climate features (Step 5), scale bar implementation, and distance-based algorithms

### `src/modules/lakes.js` (NEW: Step 6 - Priority-Flood Lakes)

* **Lake detection system**: Uses priority-flood algorithm to detect closed depressions above sea level
* `computeLakes(polygons, { seaLevel, eps })`: Main lake detection function
  * **Priority-flood algorithm**: Min-heap based flood-fill from ocean cells outward
  * **Spill height calculation**: Computes water level needed for each cell to drain to ocean
  * **Lake identification**: Groups contiguous cells with same spill height into lake regions
  * **Outlet detection**: Finds single outlet point for each lake where water escapes
  * **Input requirements**: `polygons[*].height`, `polygons[*].neighbors` must be set
  * **Output**: Adds `polygons[*].spillHeight`, `polygons[*].lakeId`, `polygons[*].isLake`, `polygons[*].lakeOutlet` fields
* **Performance optimized**: Efficient min-heap implementation for large maps
* **Integration**: Called after features, before rivers in main.js
* **River integration**: Lake cells route directly to their outlets for realistic drainage

### `src/render/lakes.js` (NEW: Step 6 - Lake Rendering)

* **Lake visualization**: Renders lakes as polygon fills with light blue color
* `renderLakes(polygons, gLakes)`: Main lake rendering function
  * **Polygon-based rendering**: Fills lake cells with light blue color (#76c8ff)
  * **Layer management**: Lakes render above land but below coastlines and rivers
  * **D3 integration**: Uses data join pattern for efficient updates
* **Visual styling**: 75% opacity fills with no stroke for clean appearance
* **Layer integration**: Renders into existing `#lakes` group with layer panel support

### `src/modules/rivers.js` (NEW: Step 7 - River Generation)

* **River generation system**: Creates realistic river networks through downhill routing and flux accumulation
* `generateRivers(polygons, { seaLevel, baseRunoff, fluxQuantile, minSegments })`: Main river generation function
  * **Downhill routing**: Each cell routes to its lowest neighbor (steepest descent)
  * **Flux accumulation**: Multi-pass relaxation system accumulating flow from precipitation and base runoff
  * **Dynamic thresholding**: Rivers marked where flux >= 92nd percentile of land flux (configurable)
  * **Statistics tracking**: Counts sources, confluences, mouths, and segments
  * **Input requirements**: `polygons[*].height`, `polygons[*].prec`, and `polygons[*].neighbors` must be set
  * **Output**: Adds `polygons[*].down`, `polygons[*].flux`, `polygons[*].isRiver`, `polygons[*].isMouth`, `polygons[*].riverInDeg` fields
* **River-only statistics**: Uses `riverInDeg` to count only river-to-river connections for accurate network topology
* **Integration**: Called after climate and features, before labeling in main.js
* **Performance**: 20-pass relaxation sufficient for ~10k cells, deterministic with existing RNG

### `src/render/rivers.js` (NEW: Step 7 - River Rendering)

* **River visualization**: Renders rivers as centroid-to-centroid line segments with flux-based width scaling
* `renderRivers(polygons, gRivers)`: Main river rendering function
  * **Centroid calculation**: Computes cell centers for line endpoints
  * **Width scaling**: River width scales from 0.6px to 2.8px based on flow volume
  * **Visual styling**: Blue rivers (#49a8ff) with rounded line caps and non-scaling stroke
  * **Layer management**: Automatically raises rivers above land/biomes/scalar overlays
  * **D3 integration**: Uses data join pattern for efficient updates
* **Non-scaling stroke**: `vector-effect="non-scaling-stroke"` keeps lines readable at all zoom levels
* **Layer integration**: Renders into existing `#rivers` group with layer panel support

### `src/modules/watersheds.js` (NEW: Step 8 - Watershed Analysis)

* **Watershed analysis system**: Computes drainage basins, river orders, and discharge calculations
* `computeWatersheds(polygons, map, { seaLevel })`: Main watershed analysis function
  * **Watershed identification**: Groups rivers by their drainage basins (mouth-based)
  * **Strahler ordering**: Hierarchical river ordering where confluences increase order
  * **Shreve ordering**: Additive ordering that sums upstream contributions
  * **Discharge calculation**: Realistic discharge proxy using precipitation × area + upstream flow
  * **Geographic scaling**: Converts pixel areas to km² using latitude-dependent scaling
  * **Segment length**: Calculates river segment lengths in kilometers using haversine formula
  * **Input requirements**: `polygons[*].isRiver`, `polygons[*].riverInDeg`, `polygons[*].down`, `polygons[*].lat`, `polygons[*].lon`, `polygons[*].height`, `polygons[*].prec`, `polygons[*].isLake` must be set
  * **Output**: Adds `polygons[*].basinId`, `polygons[*].orderStrahler`, `polygons[*].orderShreve`, `polygons[*].Q`, `polygons[*].segLenKm` fields
* **Topological processing**: Uses Kahn's algorithm for proper downstream propagation
* **Mass balance tracking**: Validates discharge conservation and provides statistics
* **Integration**: Called after rivers, before labeling in main.js

### `src/render/rivers-edges.js` (NEW: Step 8 - Edge-Following River Rendering)

* **Edge-following river visualization**: Renders rivers using shared Voronoi edges between cells
* `renderRiversEdges(polygons, gRivers)`: Main edge-based river rendering function
  * **Shared edge detection**: Finds common edges between adjacent Voronoi cells
  * **Edge midpoint calculation**: Uses midpoints of shared edges for river path points
  * **Tolerance-based matching**: Uses 3-decimal precision for robust edge matching
  * **Discharge-based width**: River width scales from 0.8px to 3.4px based on discharge Q
  * **Logarithmic scaling**: Uses log10 scaling for better dynamic range visualization
  * **Fallback compatibility**: Falls back to flux if Q is not available
* **Realistic river paths**: Rivers follow natural boundaries between cells instead of cutting through
* **Smooth visualization**: Midpoint-based rendering creates natural-looking river courses
* **Performance optimized**: Efficient edge detection and rendering for large river networks

### `src/modules/climate.js` (NEW: Step 5a/5b - Temperature & Precipitation)

* **Climate temperature model**: Assigns realistic temperature values to each polygon based on latitude and altitude
* `assignTemperatures(polygons, map, { seaLevel, maxElevKm, lapseRateFperKm })`: Main temperature assignment function
  * **Sea-level temperature**: Varies by latitude using piecewise-linear bands
    * Equator (0°): 81°F
    * Mid-latitudes (60°): 45°F  
    * Poles (90°): -13°F
  * **Altitude cooling**: Standard atmospheric lapse rate of 11.7°F per kilometer
  * **Input requirements**: `polygons[*].lat` and `polygons[*].height` must be set
  * **Output**: Adds `polygons[*].temp` field in Fahrenheit
  * **Statistics**: Returns `{ count, min, max, mean }` for debugging
* `seaLevelTempAtLat(latDeg)`: Internal function calculating sea-level temperature at given latitude
  * Uses piecewise-linear interpolation between key latitude bands
  * Handles both northern and southern hemispheres symmetrically

* **Precipitation model**: Assigns realistic precipitation values based on prevailing winds and orographic effects
* `assignPrecipitation(polygons, map, { seaLevel, pickupRate, precipRate, orographicCoeff, humidityMax })`: Main precipitation assignment function
  * **Prevailing wind patterns**:
    * Easterlies (trades 0-30°, polar 60-90°): east→west winds
    * Westerlies (mid-latitudes 30-60°): west→east winds
  * **Latitude-based moisture factors**:
    * ITCZ (0-5°): 1.5x moisture (very wet)
    * Tropics (5-20°): 1.2x moisture (wet)
    * Subtropical highs (20-35°): 0.6x moisture (dry/deserts)
    * Westerlies (35-55°): 1.0x moisture (normal)
    * Subpolar (55-70°): 0.9x moisture (slightly dry)
    * Polar (70-90°): 0.6x moisture (dry)
  * **Orographic effects**: Windward slopes get extra precipitation (1.5x coefficient)
  * **Wind mechanics**: Sweeps rows in wind direction, picks up moisture over water, deposits on land
  * **Output**: Adds `polygons[*].prec` field in arbitrary units
  * **Statistics**: Returns `{ count, min, max, mean }` for debugging
* `bandMoistureFactor(absLat)`: Internal function calculating moisture factor by latitude band
* `prevailingWindX(absLat)`: Internal function determining wind direction by latitude
* **Integration**: Temperature called after coordinate assignment, precipitation called after feature classification
* **Future use**: Enables biome classification, river generation, and climate-aware labeling

---

## Coordinate systems & invariants

* **World space**: SVG units tied to the geometry. Ocean labels live here.
* **Screen space**: Overlay layer for crisp, zoom‑independent text. Non‑ocean labels live here.
* Zoom transform `k` is **never** multiplied into stored font sizes; we divide by `k` when rendering so labels remain the same on screen.
* Ocean label rects are stored in world units and must remain inside their keep‑within rect after zoom.
* Reciprocal neighbors are enforced for Voronoi cells (self‑test).

---

## UI wiring (index.html)

* Controls and options elements are read by `src/main.js` on generate.
* CDN scripts: D3 v5 only; vanilla JS DOM events and helpers.

---

## Dev sandboxes (`/dev`)

* `test-label-zoom.html`, `test-anneal-labels.html`, `test-sat-ocean-placement.html`, `test-names.html`, `test-viewport-culling.html`, `verify-culling.html`, etc., each mount a reduced harness to exercise a specific subsystem.
* **`test-candidates.html`**: Standalone test page for candidates system (Step 5)
  * Tests `syncQACandidates()`, `clearQACandidates()`, and zoom integration
  * Provides manual flag testing and console verification
  * Independent operation (no infinite redirects)

---

## Conventions & notes

* Do **not** import D3 in modules; it is provided globally via CDN in `index.html`.
* Prefer storing persistent label data in **world** coordinates and computing screen overlays on demand.
* Use `window.DEBUG` and the Perf HUD for local profiling.
* Keep the naming pools in `names.js` de‑duplicated; the generator enforces uniqueness but clean inputs reduce retries.
* If you remove jQuery, replace `$.grep` and simple selectors with vanilla equivalents.
* **Performance**: Use SAT caching and deferred placement for heavy operations; monitor cache size with `window.getSATCacheSize()`.
* **Debugging**: Control ocean placement timing with `window.forceImmediateOceanPlacement()` and `window.forceDeferredOceanPlacement()`.
