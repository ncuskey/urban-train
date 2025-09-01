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
│   │   ├── labels.js       # Build & place labels; annealing; ocean rect fit
│   │   ├── interaction.js  # D3 zoom/pan; counter-scaling; LOD visibility
│   │   ├── autofit.js      # Fit view to land/world; post-layout hooks
│   │   ├── rendering.js    # Polygon rendering
│   │   ├── fonts.js        # Font theme helpers
│   │   └── refine.js       # Coastline refinement + rebuild cycle
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

### `src/main.js` (≈1350 lines)

* **`generate(count)`** (≈ line 344): Master pipeline. Creates layers, samples sites, builds Voronoi, assigns heights, draws coastline, classifies features, builds labels, runs SA, and wires zoom.
* **Calls**:

  * `attachInteraction(...)` (≈ 441)
  * `buildFeatureLabels(...)` (≈ 541) and `placeLabelsAvoidingCollisions(...)` (≈ 567/846/887)
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

### `src/modules/labels.js`

* **World vs screen**: Oceans in world space; other labels in screen overlay.
* **Counter‑scaling**: fontSizePx is divided by zoom `k` so screen size stays constant.
* **Viewport culling**: Off-screen labels are hidden for performance with ocean sticky visibility.
* **Key exports**:

  * `computeLabelMetrics` (≈ 486): DOM/canvas text metrics w/ CSS variables.
  * `fitOceanToRectPx` (≈ 437): Rectangle fitting in screen px.
  * `fitFontToRect` (≈ 3314): Max font that fits rect; 2‑line support.
  * `annealLabels` (≈ 716): Collision‑free placement (non‑ocean).
  * `updateViewportCull` (≈ 181): Viewport culling with RAF throttling.
  * `ensureOceanStickyVisibility` (≈ 197): Ocean label sticky behavior.
  * `initLabelCulling` (≈ 212): Initialize culling system.
  * `ensureLabelLayers` / `ensureScreenLabelLayer` (≈ 39/52)
  * `updateOceanLabelScreenPosition` (≈ 3575), `clearScreenLabels` (≈ 3567).

### `src/modules/interaction.js`

* `getZoomState` (≈ 6) / `getVisibleWorldBounds` (≈ 17) / `padBounds` (≈ 25)
* `attachInteraction` (≈ 33): D3 zoom; on zoom → update overlay positions, visibility thresholds, and viewport culling.
* `getCurrentTransform` (≈ 305): Get current zoom transform state.

### `src/modules/autofit.js`

* `afterLayout` (≈ 8): Safe "run after first layout" hook.
* `fitToLand` (≈ 89): Compute land bbox and pad; zoom to it.
* `autoFitToWorld` (≈ 141): Variant for broader framing.
* Also exposes `clampRectToBounds`, `computeLandBBox`.

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
