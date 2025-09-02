# Urban Train — Procedural Map Generator

A web‑based fantasy map generator that builds Voronoi‑based worlds with realistic coastlines, feature detection (oceans, lakes, islands), and an intelligent label system (size‑aware naming + collision‑free placement).

## Highlights

* **Deterministic generation** with a seedable RNG (see `src/core/rng.js`).
* **Terrain pipeline**: Poisson‑disc sampling → Voronoi diagram → height assignment → coastline refinement.
* **Feature detection**: Connected‑component flood‑fill classifies oceans, lakes, and islands.
* **Fantasy naming**: Size‑aware hydronyms with grammar/inflection guards and uniqueness.
* **Label system**:

  * Simulated‑annealing placement with collision avoidance for non‑ocean labels.
  * Ocean labels placed in **world space** and fitted into the largest valid rectangle; supports **two‑line** breaks and **counter‑scales** with zoom to keep readable on screen.
  * **SAT caching**: Water mask computation cached between runs when geometry hasn't changed (keyed on seed + viewport + water components).
  * **Deferred placement**: Ocean labels deferred to idle time when possible to avoid blocking `requestAnimationFrame`.
  * Zoom‑level LOD: small features fade in as you zoom.
  * **Viewport culling**: Off-screen labels are hidden for performance, with ocean label sticky visibility.
* **Interaction**: Smooth pan/zoom (D3 v5), HUD readouts, and a lightweight performance HUD.
* **Performance**: Intelligent deferral of heavy operations to idle time, SAT caching, and raster scaling optimizations.
* **Safety**: Defensive checks against NaN/Infinity, clamped zoom, and self‑tests.

---

## Quick start

**Requirements**: Any modern browser. No build step.

1. Serve the folder from a local static server (recommended):

```bash
cd urban-train
python3 -m http.server 8000
# then open http://localhost:8000
```

> Opening the file directly from `file://` can work, but a local server is more reliable for module imports.

2. Open `index.html`. Use **Random map**, **Options**, and the checkboxes to explore.

### Development & CI

**Local serve commands:**
```bash
npx http-server -p 8000 -c-1 .
# or
python3 -m http.server 8000
```

**Test commands:**
```bash
npm ci
npm run prepare
npm test
```

### External libraries

* **D3 v5** (CDN) – pan/zoom, selections.
* **Google Fonts** via CSS `@import` (fantasy typefaces).

> Note: jQuery and d3-labeler were removed as unused dependencies.

---

## How it works (pipeline)

1. **Sampling & Voronoi**
   `poissonDiscSampler` → sites → D3 Voronoi → cell graph.
   Source: `src/modules/geometry.js`.

2. **Height & landmasses**
   Seed a large "continent" blob, then several small blobs. Height spreads to neighbors; values clamped 0–1.
   Source: `src/modules/heightmap.js` (`randomMap`, `add`).

3. **Coastline**
   Trace coastlines and generate smooth SVG paths.
   Source: `src/modules/coastline.js` (`drawCoastline`).

4. **Feature classification & naming**
   Flood‑fill classifies oceans/lakes/islands; assign names with size‑aware terms (e.g., *Mere/Tarn/Pool* for lakes, *Sea/Ocean/Deep* for oceans) and adjective+noun patterns with grammar guards (avoids "Lake Winds" → chooses "Lake of the Winds", etc.). Names are unique across scope.
   Source: `src/modules/features.js` (`markFeatures`), `src/modules/names.js` (`makeNamer`).

5. **Label build & placement**

   * Build label data per feature, including area, centroid, and style hints.
   * **Non‑ocean labels**: Simulated‑annealing to avoid overlaps; stored in **screen space** overlay for crisp text.
   * **Ocean labels**: Compute a maximal fitting rect in **world space**, then fit text (possibly 2 lines). Font size is stored as *screen pixels* and applied as `fontSizePx / k` so labels stay the same on‑screen size as you zoom (`k` = current zoom).
     Sources: `src/modules/labels.js` (see functions below), `src/modules/interaction.js`.

6. **Auto‑fit & view**
   Auto‑frame the map to land bounds; re‑flow labels post‑layout.
   Source: `src/modules/autofit.js` (`autoFitToWorld`, `fitToLand`, `afterLayout`).

7. **Interaction & LOD**
   D3 zoom sets transform; label system **counter‑scales** and updates visibility thresholds with zoom.
   **Tier-based LOD**: Labels classified into 4 tiers (1=ocean, 2=major, 3=standard, 4=minor) with zoom-based visibility.
   **Real-time filtering**: Labels appear/disappear based on zoom level and tier importance.
   **Robust placement**: Uses solver coordinates (placed/layout/anchor) with CSS class fallbacks.
   Source: `src/modules/interaction.js`, `src/modules/labels.js`.

---

## Label system details

### Current Labeling System Status

The labeling system is currently being reconstructed with a new modular architecture:

* **✅ Step 1 (COMPLETE)**: Style system with validation, tokens, and lookup
* **✅ Step 2 (COMPLETE)**: Proto-anchors with spatial indexing for collision detection  
* **✅ Step 3 (COMPLETE)**: Anchor enrichment with polygon context and style attachment
* **🔄 Step 4 (NEXT)**: Label text generation and placement algorithms
* **🔄 Step 5 (PLANNED)**: Rendering and interaction integration

**New modules**: `src/labels/` directory contains the reconstructed system with ES modules, comprehensive validation, and performance optimizations.

**Coordinate spaces**

* Ocean labels: **world space** (x/y do not move relative to geography); font size counter‑scales with zoom.
* Other labels: **screen space** overlay to keep text crisp and detached from zoom blur.

**Key behaviors**

* Ocean label rectangle is stored on the datum in world units; fitting uses a hybrid screen/world strategy to ensure it remains inside bounds after zoom.
* Font measurement uses canvas/DOM width metrics and CSS variables for **accurate measurement** matching the rendered font.
* Annealing energy discourages collisions and favors center placement; oceans get higher "mass" so small labels yield around them.
* **Deterministic placement**: Labels use solver coordinates (placed/layout/anchor) with robust fallbacks to CSS classes.
* **Tier-based visibility**: Each label carries tier class (tier-1 through tier-4) for CSS styling and LOD control.
* **Zoom-responsive LOD**: Labels update visibility on every zoom change with smooth transitions.

**Notable functions** (in `src/modules/labels.js`):

* `computeLabelMetrics` (≈ line 486): measure text width/height.
* `fitOceanToRectPx` (≈ line 437): fit ocean label to a screen‑space rect.
* `annealLabels` (≈ line 716): SA for non‑ocean labels.
* `fitFontToRect` (≈ line 3314): pick max font size that fits rect (supports 2‑line).
* `updateViewportCull` (≈ line 181): viewport culling with performance optimization.
* `ensureOceanStickyVisibility` (≈ line 197): ocean label sticky behavior.
* `ensureLabelLayers` / `ensureScreenLabelLayer` (≈ lines 39/52): set up label layers.
* `updateOceanLabelScreenPosition` (≈ line 3575) & `clearScreenLabels` (≈ line 3567).
* **Performance optimizations**:
  * `getOrBuildSAT()`: SAT caching with automatic cleanup (10 entry limit)
  * `findOceanLabelRectAfterAutofit()`: Raster scaling for faster water mask computation
* **New LOD functions**:
  * `worldPoint(d)`: Robust coordinate extraction with solver priority
  * `applyLabelTransforms(svg)`: Updates label positions on every zoom
  * `updateLabelVisibility(svg)`: Tier-based visibility with fade support
  * `applyTierClasses(sel)`: Stamps tier classes on all labels

**Zoom/Layers**

* Non‑ocean labels render in `#labels-world-areas` (world space with tier classes).
* Ocean labels render in `#labels-world-ocean` (world space).
* Zoom handler updates label transforms, visibility, and LOD on every change.
* **LOD HUD**: Live debug overlay shows zoom level, tier bands, and computed opacity.

---

## Options, fonts, and theming

* Use **Options → sliders** to tweak point radius, max height, diffusion, etc. Controls are bound in `index.html` and read by `src/main.js`.
* Fantasy fonts are configured via CSS variables in `styles.css` (`--label-font` / `--label-font-family`). Programmatic helpers live in `src/modules/fonts.js` (`switchFont`, `listFonts`).

---

## Self‑tests & debugging

* Self tests (`src/selftest.js`) validate graph neighbor reciprocity, height ranges, and layer setup; a small badge is rendered if checks pass.
* A **Perf HUD** logs timings for generate/zoom/paint; toggle `window.DEBUG` in `src/main.js`.
* **LOD Debug HUD**: Live overlay shows zoom level, tier bands, and opacity values (see `src/modules/labelsDebug.js`).
* **Console LOD logging**: Shows filtered label counts at each zoom level.
* **Performance debugging**: SAT cache size (`window.getSATCacheSize()`), ocean placement control (`window.forceImmediateOceanPlacement()`), and interaction tracking.
* Dev sandboxes live in `/dev` (e.g., `test-label-zoom.html`, `test-anneal-labels.html`, `test-sat-ocean-placement.html`, `test-viewport-culling.html`, `verify-culling.html`).

---

## Known limitations / TODO

* Some edge cases for ocean rectangle search near tiny archipelagos can be slow; heuristics can be tuned.
* Automated CI regression testing is now available for label collisions and LOD thresholds.

---

## License

MIT (or your preferred license — update here if different.)
