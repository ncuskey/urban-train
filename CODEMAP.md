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
│   ├── render/
│   │   └── layers.js       # SVG layer creation/ordering/cleanup
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

* **Map coordinate system**: Defines world-like geographic extents and assigns latitudes to polygons
* `defineMapCoordinates({ width, height, centerLat, spanLat, centerLon, spanLon })`: Creates coordinate system with configurable center and span
  * Default: 120° latitude span, 180° longitude span, centered at (0°, 0°)
  * Returns: `{ width, height, latTop, latBottom, lonLeft, lonRight, kmPerPxAtEquator }`
  * Uses Earth's equatorial circumference (40,075.017 km) for realistic scale calculations
* `assignLatitudes(polygons, map)`: Assigns latitude to each polygon based on centroid Y position
  * Handles edge cases: empty arrays, null polygons, malformed geometry
  * Stores result in `poly.lat` property for each polygon
  * Latitude decreases as Y increases (SVG coordinate system)
* **Integration**: Called after height stats, before feature classification in main.js
* **Future use**: Enables climate features (Step 5) and scale bar implementation

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
