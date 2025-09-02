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
│   │   └── timers.js       # Lightweight timing helpers
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
│   │   └── refine.js       # Coastline refinement + rebuild cycle
│   ├── labels/              # NEW: Labeling system (Step 1+)
│   │   ├── schema.js       # Runtime validation + style lookup builder
│   │   ├── style-tokens.js # Style definitions (tiers, categories, rules)
│   │   ├── index.js        # Initialization + getters
│   │   ├── anchors.js      # Proto-anchors from polygons (Step 2)
│   │   ├── spatial-index.js # Quadtree spatial indexing (Step 2)
│   │   ├── enrich.js       # Anchor enrichment with polygon context (Step 3)
│   │   └── style-apply.js  # Style attachment to anchors (Step 3)
│   ├── render/
│   │   └── layers.js       # SVG layer creation/ordering/cleanup
│   └── selftest.js         # Sanity checks + badge
├── dev/                    # Sandboxes for local testing
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
* **Utilities**: `timeit` for coarse timings; `window.DEBUG` toggle.

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

### `src/modules/labels-null-shim.js` (Temporary: Step 0)

* **Temporary null implementations** of all old labeling functions
* **Prevents crashes** during Step 0 while new system is being built
* **Will be replaced** by new modules as they're implemented

### `src/modules/interaction.js`

* `getZoomState` (≈ 6) / `getVisibleWorldBounds` (≈ 17) / `padBounds` (≈ 25)
* `attachInteraction` (≈ 33): D3 zoom; on zoom → update overlay positions, visibility thresholds, and viewport culling.
* `getCurrentTransform` (≈ 305): Get current zoom transform state.

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

---

## Conventions & notes

* Do **not** import D3 in modules; it is provided globally via CDN in `index.html`.
* Prefer storing persistent label data in **world** coordinates and computing screen overlays on demand.
* Use `window.DEBUG` and the Perf HUD for local profiling.
* Keep the naming pools in `names.js` de‑duplicated; the generator enforces uniqueness but clean inputs reduce retries.
* If you remove jQuery, replace `$.grep` and simple selectors with vanilla equivalents.
* **Performance**: Use SAT caching and deferred placement for heavy operations; monitor cache size with `window.getSATCacheSize()`.
* **Debugging**: Control ocean placement timing with `window.forceImmediateOceanPlacement()` and `window.forceDeferredOceanPlacement()`.
