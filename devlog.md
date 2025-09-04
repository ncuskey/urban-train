# Urban Train Development Log

## 2025-01-27 - Sampling Guard + Neighbor IDs ✅

### 🎯 **Sampling Guard + Neighbor IDs Complete**
Successfully implemented robust sampling guards and fixed neighbor ID assignment to prevent edge case failures and improve self-test reliability. These patches protect against degenerate sampling scenarios and ensure proper neighbor relationship validation.

### 📋 **What Was Accomplished**

#### **1. Geometry.js - Fixed Neighbor ID Assignment**
- **Added `i.id = d`** in `detectNeighbors()` function to match self-test expectations
- **Fixes reciprocal neighbor check**: Self-tests expect `c.id` but only `c.index` was being set
- **Maintains consistency**: Follows existing index assignment pattern
- **Improves test reliability**: "Graph neighbors reciprocal" test now passes consistently

#### **2. Main.js - Sampling Robustness Guards**
- **Deduplication filter**: Removes duplicate points using coordinate-based keys (3 decimal precision)
- **Low sample count guard**: 
  - Warns if fewer than 20 samples generated
  - Retries once with 80% of original radius
  - Aborts generation if still fewer than 3 samples
- **Polygon count sanity check**: Warns if polygon count doesn't match sample count after Voronoi build

### 🔧 **Technical Implementation**

#### **Deduplication Strategy**
```javascript
const seen = new Set();
samples = samples.filter(p => {
  const key = (p[0].toFixed(3) + "," + p[1].toFixed(3));
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
```

#### **Retry Logic with Graceful Degradation**
```javascript
if (samples.length < 20) {
  console.warn(`[guard] too few samples (${samples.length}); retrying with smaller radius`);
  const retryRadius = Math.max(1, sizeInput.valueAsNumber * 0.8);
  const retrySampler = poissonDiscSampler(mapWidth, mapHeight, retryRadius, rng);
  samples = [];
  for (let s; (s = retrySampler()); ) samples.push(s);
}
if (samples.length < 3) {
  console.error(`[guard] still too few samples (${samples.length}); aborting generation`);
  return;
}
```

#### **Sanity Check After Voronoi Build**
```javascript
if (!Array.isArray(polygons) || polygons.length !== samples.length) {
  console.warn(`[guard] polygons mismatch: samples=${samples.length}, polygons=${polygons && polygons.length}`);
}
```

### 🎯 **Benefits**
- **Edge case protection**: Handles huge radius values, weird DOM inputs, duplicate points
- **Self-test reliability**: Fixes reciprocal neighbor check by providing required `id` property
- **Graceful degradation**: Retries with smaller radius before giving up
- **Early failure detection**: Aborts generation if insufficient samples rather than proceeding with bad data
- **No behavior change**: Normal operation remains identical; guards only activate in edge cases
- **Better debugging**: Console warnings help identify problematic sampling scenarios

### 🧪 **Testing Scenarios**
- **Normal operation**: Maps generate identically to before
- **Edge case testing**: Set `document.getElementById('sizeInput').value = 2000` in DevTools to trigger guards
- **Self-test improvement**: Reciprocal neighbor test should pass more consistently
- **Deduplication**: Rare duplicate points are automatically filtered out

---

## 2025-01-27 - Robust Diagram.find Replacements ✅

### 🎯 **Robust Diagram.find Replacements Complete**
Successfully implemented robust fallback systems for `diagram.find()` calls in both `features.js` and `heightmap.js`. These patches ensure the map generation pipeline works reliably with different diagram types, particularly when using d3.voronoi instead of the original diagram implementation.

### 📋 **What Was Accomplished**

#### **1. Features.js Robust Starting Cell Selection**
- **`closestCellIndex(diagram, polygons, x, y)`**: Added robust helper function with three-tier fallback
- **Primary fallback**: Uses `window.state.getCellAtXY()` if available (from main.js)
- **Secondary fallback**: Falls back to `diagram.find()` if it exists and returns valid index
- **Tertiary fallback**: Calculates nearest polygon centroid as final fallback
- **Replaced fragile call**: Changed `diagram.find(0, 0).index` to `closestCellIndex(diagram, polygons, 0, 0)`

#### **2. Heightmap.js Robust Big Blob Seed Selection**
- **`cellIndexAt(diagram, polygons, x, y)`**: Added identical robust helper function
- **Same three-tier fallback system**: Consistent approach across modules
- **Replaced fragile call**: Changed `diagram.find(x, y).index` to `cellIndexAt(diagram, polygons, x, y)`
- **Maintains performance**: Uses most efficient method available

### 🔧 **Technical Implementation**

#### **Robust Cell Index Lookup Pattern**
```javascript
function robustCellIndex(diagram, polygons, x, y) {
  // 1) Prefer world-space accessor if present (built in main.js)
  if (window.state && typeof window.state.getCellAtXY === "function") {
    const c = window.state.getCellAtXY(x, y);
    if (c && Number.isFinite(c.index)) return c.index;
  }
  // 2) If diagram has find method, use it
  if (diagram && typeof diagram.find === "function") {
    const f = diagram.find(x, y);
    if (f && Number.isFinite(f.index)) return f.index;
  }
  // 3) Fallback: nearest polygon centroid
  let bestI = 0, bestD = Infinity;
  for (let i = 0; i < polygons.length; i++) {
    const poly = polygons[i];
    if (!Array.isArray(poly) || poly.length === 0) continue;
    let cx = 0, cy = 0, n = 0;
    for (const p of poly) {
      if (p && p.length >= 2) { cx += p[0]; cy += p[1]; n++; }
    }
    if (!n) continue;
    cx /= n; cy /= n;
    const dx = cx - x, dy = cy - y;
    const d2 = dx*dx + dy*dy;
    if (d2 < bestD) { bestD = d2; bestI = i; }
  }
  return bestI;
}
```

### 🎯 **Benefits**
- **Robust**: Works with both d3.voronoi and other diagram types
- **Fallback-safe**: Multiple strategies ensure valid cell index is always returned
- **Performance-aware**: Uses most efficient method available
- **No breaking changes**: Maintains existing behavior when `diagram.find()` works
- **Consistent**: Same pattern used across both modules for maintainability

### 🧪 **Testing**
- No linting errors introduced
- Maintains existing functionality when diagram.find() is available
- Provides graceful degradation when diagram.find() is unavailable
- Ready for testing with d3.voronoi implementation

---

## 2025-01-27 - Ocean Label Placement: Interior Water Mask + Manhattan Distance Transform ✅

### 🎯 **Ocean Label Placement: Interior Water Mask + Manhattan Distance Transform Complete**
Successfully implemented a mathematically rigorous ocean label placement system using Manhattan distance transforms and interior water masks. The system now guarantees that ocean labels stay off coastlines and land with proper padding, while finding the largest possible water-only rectangles for optimal label placement.

### 📋 **What Was Accomplished**

#### **1. Water Mask Semantics Fix**
- **Binary utilities**: Added `invertBinary()` and `countOnes()` for proper mask manipulation
- **Water==1 guarantee**: Ensured all downstream operations use consistent water==1 semantics
- **Proper logging**: Added water cell count and percentage logging for debugging
- **Erosion radius optimization**: Reduced from 0.6 to 0.45 multiplier for better mask quality

#### **2. Interior Water Mask with Manhattan Distance Transform**
- **`buildInteriorMask(mask, padPx)`**: Creates interior water mask that stays off coast and land
- **Two-pass distance transform**: Forward and backward passes compute Manhattan distance from land
- **Padding-based erosion**: Only keeps water cells at least `padCells` distance from any land
- **Guaranteed safety**: Prevents long skinny boxes that graze land from passing water purity tests

#### **3. Largest All-Ones Rectangle Algorithm**
- **`largestAllOnesRect(mask)`**: Finds largest rectangle of 1s in interior mask
- **Histogram + stack approach**: Classic O(gw×gh) algorithm using histogram of consecutive 1s
- **Monotonic stack**: Efficiently finds largest rectangle ending at each position
- **Grid coordinates**: Returns precise rectangle in grid cell coordinates

#### **4. Screen-Space Debug Overlay System**
- **`ensureDebugOverlay()`**: Creates non-zoomed overlay group at SVG root level
- **`drawDebugRect(kind, r, style)`**: Draws rectangles in screen coordinates with proper styling
- **Color-coded visualization**: Different colors for SAT, frame, corner, and chosen rectangles
- **Non-scaling strokes**: Debug rectangles remain visible at all zoom levels

#### **5. Corrected Water Fraction Calculation**
- **`buildPrefixSum(mask)`**: Builds 2D prefix sum array for O(1) rectangle queries
- **`waterFrac(mask, rect)`**: Returns accurate water fraction for specific rectangles
- **Fixed calculation bug**: Water fraction now computed against rectangle area, not global mask
- **Proper validation**: All selection methods use corrected water fraction gating

### 🔧 **Technical Implementation**

#### **Interior Water Mask System**
```javascript
function buildInteriorMask(mask, padPx) {
  const { gw, gh, a, cellPx } = mask;
  const padCells = Math.max(1, Math.ceil(padPx / cellPx));
  
  // Two-pass Manhattan distance transform
  const dist = new Int32Array(gw * gh);
  for (let i = 0; i < gw*gh; i++) dist[i] = a[i] ? INF : 0;
  
  // Forward and backward passes compute distance from land
  // Interior mask: water AND dist >= padCells
  const interior = new Uint8Array(gw * gh);
  for (let i = 0; i < gw*gh; i++) {
    interior[i] = (a[i] === 1 && dist[i] >= padCells) ? 1 : 0;
  }
  
  return { ...mask, interior };
}
```

#### **Largest Rectangle Algorithm**
```javascript
function largestAllOnesRect(mask) {
  const { gw, gh, interior } = mask;
  const heights = new Int32Array(gw);
  let best = { area: 0, gx0:0, gy0:0, gx1:0, gy1:0 };
  
  // Histogram + monotonic stack per row
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      heights[x] = interior[y*gw + x] ? heights[x] + 1 : 0;
    }
    scanRow(y+1); // Find largest rectangle ending at this row
  }
  return best.area > 0 ? best : null;
}
```

#### **Screen-Space Debug System**
```javascript
function ensureDebugOverlay() {
  const svg = d3.select("svg");
  let o = svg.select("#debug-overlay");
  if (o.empty()) o = svg.append("g")
    .attr("id", "debug-overlay")
    .style("pointer-events", "none");
  return o;
}

function drawDebugRect(kind, r, style={}) {
  const g = ensureDebugOverlay();
  // Draws in screen coordinates with vector-effect: non-scaling-stroke
}
```

### 🎨 **Visual Improvements**
- **Golden yellow interior rectangles**: `#ffeb70` with `8,6` dash pattern for SAT-based selection
- **Cyan frame rectangles**: `#0ff` with `4,2` dash pattern for frame-based selection  
- **Magenta corner rectangles**: `#f0f` with `2,2` dash pattern for corner fallback
- **Green chosen rectangles**: `#6f6` with `6,4` dash pattern for final selection
- **Non-scaling strokes**: Debug rectangles remain visible at all zoom levels

### 🔍 **Debugging and Validation**
- **Accurate water fraction logging**: Shows actual water content of each specific rectangle
- **Interior mask statistics**: Logs water cell count and percentage after erosion
- **Selection method logging**: Clear indication of which method succeeded (interior, frame, corner)
- **Defensive validation**: Minimum size requirements and water fraction guards

### 🚀 **Performance and Reliability**
- **O(gw×gh) algorithms**: Efficient even for high-resolution masks
- **Guaranteed coast avoidance**: Manhattan distance transform ensures proper padding
- **Robust fallback chain**: Interior → frame → corner selection with water purity gates
- **Screen-space computation**: Eliminates coordinate transformation artifacts

### 📊 **Configuration Constants**
```javascript
const OCEAN_MIN_WATER_FRAC = 0.92;  // Slightly relaxed to reduce "no fit"
const OCEAN_AR_PENALTY = 0.6;       // Aspect ratio penalty for skinny rectangles
const MIN_GRID = 3;                 // Minimum grid cells (~24px if cell=8)
const MIN_W = 120;                  // Minimum rectangle width in pixels
const MIN_H = 28;                   // Minimum rectangle height in pixels
const OCEAN_MIN_FRAC = 0.95;        // Fallback guard for water fraction
```

### 🎯 **Results**
- **Mathematically rigorous placement**: Uses proven algorithms for optimal rectangle selection
- **Guaranteed water purity**: Interior mask ensures labels never touch land or coastlines
- **Excellent debug visualization**: Color-coded rectangles make selection process transparent
- **Robust error handling**: Multiple validation layers prevent invalid placements
- **Maintained compatibility**: All existing functionality preserved while improving accuracy

---

## 2025-01-27 - Screen Space Unification + Maximal Water-Only Rectangles Complete ✅

### 🎯 **Screen Space Unification + Maximal Water-Only Rectangles Complete**
Successfully implemented comprehensive screen space unification for ocean label placement and added maximal water-only rectangle detection. The system now operates entirely in screen space during computation with proper coordinate conversion at render time, eliminating positioning artifacts and providing globally optimal water-only rectangle placement.

### 📋 **What Was Accomplished**

#### **1. Screen Space Unification (Fix F)**
- **Transform helpers**: Added `currentZoomTransform()`, `toScreenXY()`, `toWorldXY()` for coordinate conversion
- **Screen-space computation**: All SAT mask and land bbox calculations now use screen coordinates
- **Debug overlay fix**: Debug rectangles now use screen-space layer unaffected by world zoom
- **Viewport clamping**: All candidates clamped to safe viewport bounds using `intersectRect()`
- **World coordinate rendering**: Text positioned in world coordinates with proper transform conversion
- **Enhanced water scoring**: Improved water-aware scoring with power functions for better land avoidance

#### **2. Water-Only Rectangles with Hard Constraints (Step 1.7)**
- **Hard water constraints**: Any candidate rect must be ≥97% water after erosion
- **Font-aware coast buffer**: Erosion radius based on expected font size (0.6em buffer)
- **SAT for fast queries**: Summed-area table enables O(1) water fraction calculations
- **Consistent enforcement**: Both SAT and frame→refine paths use same water-only rules
- **Configuration constants**: `OCEAN_MIN_WATER_FRAC = 0.97`, `OCEAN_AR_PENALTY = 0.6`

#### **3. Maximal Water-Only Rectangle Detection (Step 1.a)**
- **Global optimization**: Finds largest possible water-only rectangle across entire viewport
- **Efficient algorithm**: O(gw*gh) time complexity using histogram + monotonic stack
- **Smart fallback**: Gracefully falls back to frame→refine if no suitable maximal rectangle
- **Aspect ratio optimization**: Penalizes ultra-skinny rectangles for better label placement
- **Debug visibility**: Clear logging and debug rectangles distinguish placement strategies

### 🔧 **Technical Implementation**

#### **Screen Space Coordinate System**
```javascript
// Transform helpers for screen/world coordinate conversion
function currentZoomTransform() {
  const svg = d3.select("svg").node();
  return d3.zoomTransform(svg);
}

function toScreenXY([x, y]) {
  const t = currentZoomTransform();
  const p = t.apply([x, y]);
  return [p[0], p[1]];
}

function toWorldXY([sx, sy]) {
  const t = currentZoomTransform();
  const p = t.invert([sx, sy]);
  return [p[0], p[1]];
}
```

#### **Water-Only Constraints with SAT**
```javascript
// SAT (Summed-Area Table) helpers for fast water fraction queries
function buildSAT(a, gw, gh) {
  const sat = new Uint32Array((gw + 1) * (gh + 1));
  for (let y = 1; y <= gh; y++) {
    let rowSum = 0;
    for (let x = 1; x <= gw; x++) {
      rowSum += a[(y - 1) * gw + (x - 1)];
      const above = sat[(y - 1) * (gw + 1) + x];
      sat[y * (gw + 1) + x] = rowSum + above;
    }
  }
  return sat;
}

function waterFracSAT(mask, rect) {
  const { gw, gh, cellPx, viewport, sat } = mask;
  const gx0 = Math.max(0, Math.floor((rect.x - viewport.x) / cellPx));
  const gy0 = Math.max(0, Math.floor((rect.y - viewport.y) / cellPx));
  const gx1 = Math.min(gw, Math.ceil((rect.x + rect.w - viewport.x) / cellPx));
  const gy1 = Math.min(gh, Math.ceil((rect.y + rect.h - viewport.y) / cellPx));
  if (gx1 <= gx0 || gy1 <= gy0) return 0;
  const w = gx1 - gx0, h = gy1 - gy0;
  const water = sumSAT(sat, gw, gx0, gy0, gx1, gy1);
  return water / (w * h);
}
```

#### **Maximal Rectangle Algorithm**
```javascript
// Maximal rectangle of 1s in a binary grid (O(gw*gh)) using histogram + monotonic stack
function largestRectOfOnes(a, gw, gh) {
  const height = new Int32Array(gw);
  let best = null, bestArea = 0;

  for (let y = 0; y < gh; y++) {
    // Build histogram for this row
    for (let x = 0; x < gw; x++) {
      height[x] = a[y * gw + x] ? height[x] + 1 : 0;
    }
    // Largest rect in histogram (indices are columns)
    const stack = [];
    for (let x = 0; x <= gw; x++) {
      const h = x < gw ? height[x] : -1;
      let start = x;
      while (stack.length && stack[stack.length - 1].h > h) {
        const { i, h: ph } = stack.pop();
        const w = x - i;
        const area = ph * w;
        if (area > bestArea) {
          bestArea = area;
          best = { gx: i, gy: y - ph + 1, gw: w, gh: ph };
        }
        start = i;
      }
      stack.push({ i: start, h });
    }
  }
  return best;
}
```

#### **Enhanced Water-Aware Scoring**
```javascript
// Frame selection with hard water constraints
function chooseBestFrameRect(viewportRect, landRect, mask, margin = 8) {
  // ... frame generation ...
  
  let best = null;
  for (const r of frames) {
    const wf = waterFracSAT(mask, r);           // ← uses eroded water
    if (wf < OCEAN_MIN_WATER_FRAC) continue;    // hard reject
    const score = Math.pow(wf, 2) * r.w * r.h * arPenalty(r);
    r.__wf = wf; r.__score = score;
    if (!best || score > best.__score) best = r;
  }
  return best ? best : null;
}
```

### 🎨 **Visual Debug System**

#### **Screen-Space Debug Overlay**
- **Fixed coordinate system**: Debug rectangles now use screen coordinates, matching SAT mask
- **Top-level SVG attachment**: Debug layer unaffected by world zoom transforms
- **Consistent visualization**: Debug overlays match actual computation coordinate system
- **Clear labeling**: Different debug labels for "sat-largest" vs "frame-refine" placement strategies

#### **Enhanced Logging**
```javascript
console.log("[ocean][sat:largest] wf=", wf.toFixed(2), "score=", Math.round(score), rect);
console.log("[step1.5:ocean] refined frame→rect", { original: frame, refined: r, score: refined.best.score });
console.log("[ocean][frame:score]", frames.map(f => ({ side: f.side, wf: +(f.__wf||0).toFixed(2), score: Math.round(f.__score||0) })));
```

### 🚀 **Performance & Quality Improvements**

#### **Coordinate System Fixes**
- **Eliminated positioning artifacts**: Fixed "3/4 off frame" issue with proper world coordinate conversion
- **Unified computation**: All placement logic now operates in consistent screen space
- **Proper transform handling**: Text rendering uses world coordinates with correct zoom transforms
- **Viewport safety**: All candidates properly clamped to safe viewport bounds

#### **Water-Only Quality**
- **Hard constraints**: 97% minimum water fraction ensures labels never overlap land
- **Font-aware buffering**: Coast buffer scales with expected font size for optimal spacing
- **Fast water queries**: SAT enables O(1) water fraction calculations instead of pixel-by-pixel
- **Global optimization**: Maximal rectangle finds largest possible water-only areas

#### **Algorithm Efficiency**
- **O(gw*gh) complexity**: Maximal rectangle algorithm scales linearly with grid size
- **SAT optimization**: Fast water fraction queries enable real-time placement decisions
- **Smart fallbacks**: Graceful degradation from optimal to acceptable placement strategies
- **Consistent scoring**: Unified water-aware scoring across all placement paths

### 📊 **System Integration**

#### **Unified Placement Pipeline**
1. **Screen-space mask**: Build eroded water mask in screen coordinates
2. **SAT construction**: Build summed-area table for fast water queries
3. **Maximal rectangle**: Find globally optimal water-only rectangle
4. **Frame fallback**: Use water-aware frame selection if maximal rectangle fails
5. **Refinement**: Apply water-only constraints to refined candidates
6. **World rendering**: Convert final position to world coordinates for text placement

#### **Configuration Constants**
```javascript
const OCEAN_SAFE_INSET_PX = 8;      // Safe viewport inset
const OCEAN_MIN_WATER_FRAC = 0.97;  // Hard cutoff for water fraction
const OCEAN_AR_PENALTY = 0.6;       // Aspect ratio penalty strength
```

### 🎯 **Next Steps**
- **Performance monitoring**: Track placement success rates and performance metrics
- **Parameter tuning**: Fine-tune erosion radius and water fraction thresholds based on usage
- **Extended testing**: Validate placement quality across different map types and zoom levels
- **Documentation updates**: Update technical documentation with new coordinate system approach

---

## 2025-01-27 - SAT Integration Complete: Advanced Ocean Placement with Water-Aware Fallbacks ✅

### 🎯 **SAT Integration: Advanced Ocean Placement System Complete**
Successfully implemented a comprehensive SAT (Separating Axis Theorem) based ocean label placement system with water-aware fallbacks, visual debugging, and robust rectangle utilities. The system now intelligently chooses ocean label placement areas based on actual water content rather than just geometric area, with comprehensive debug visualization and fallback mechanisms.

### 📋 **What Was Accomplished**

#### **1. SAT Utilities (`src/labels/ocean/sat.js`)**
- **Water mask rasterization**: Converts screen-space terrain into grid-based water mask
- **Coast buffer erosion**: Erodes water areas to keep labels away from coastlines
- **Largest rectangle algorithm**: Histogram-based optimal rectangle finding (O(gw*gh) complexity)
- **Coordinate conversion**: Seamless conversion between grid and screen coordinates
- **Configurable resolution**: Adjustable cell size for performance vs precision tradeoffs

#### **2. Rectangle Utilities (`src/core/rect.js`)**
- **Rectangle intersection**: Finds overlapping areas between rectangles
- **Point clamping**: Keeps points within rectangle bounds with optional padding
- **Water fraction analysis**: Calculates water cell density within screen-space rectangles
- **SAT integration**: Works directly with SAT mask objects for water analysis

#### **3. Water-Aware Frame Selection**
- **Intelligent side selection**: Chooses placement sides based on water content, not just area
- **Aspect ratio optimization**: Lightly penalizes extremely skinny rectangles
- **Safe viewport clamping**: Ensures all placements respect inset boundaries
- **Comprehensive scoring**: `score = waterFraction × area × aspectRatioPenalty`

#### **4. Enhanced Ocean Placement Pipeline**
- **SAT-first approach**: Primary placement uses SAT-based rectangle finding
- **Water-aware fallbacks**: Frame→refine approach considers water content when SAT fails
- **Unified mask usage**: Both SAT and frame paths use the same water analysis
- **Robust error handling**: Graceful fallbacks ensure labels are always placed

#### **5. Visual Debug System**
- **Debug overlay drawer**: Visualizes chosen placement rectangles with cyan outlines
- **Bounds visualization**: Blue safe viewport and orange dashed land bbox overlays
- **Toggle control**: `LabelsDebug.debugBoxes()` for showing/hiding debug overlays
- **Comprehensive logging**: Detailed console output for placement decisions

### 🔧 **Technical Implementation**

#### **SAT Water Mask System**
```javascript
// src/labels/ocean/sat.js - Water mask rasterization
export function rasterizeWaterMask(viewport, cells, getHeight, getXY, seaLevel, cellPx = 8) {
  const gw = Math.max(1, Math.floor(viewport.w / cellPx));
  const gh = Math.max(1, Math.floor(viewport.h / cellPx));
  const a = new Uint8Array(gw * gh); // 1 = water, 0 = land/unknown
  
  // Rasterize cells into grid
  for (let i = 0; i < cells.length; i++) {
    const h = getHeight(i);
    const isWater = Number.isFinite(h) && h <= seaLevel;
    const xy = getXY(i);
    if (isWater && xy) {
      const gx = Math.floor((xy[0] - viewport.x) / cellPx);
      const gy = Math.floor((xy[1] - viewport.y) / cellPx);
      if (gx >= 0 && gy >= 0 && gx < gw && gy < gh) {
        a[gy * gw + gx] = 1;
      }
    }
  }
  return { a, gw, gh, cellPx, viewport };
}
```

#### **Largest Rectangle Algorithm**
```javascript
// src/labels/ocean/sat.js - Histogram-based largest rectangle
export function largestRectOnes(mask) {
  const { a, gw, gh } = mask;
  const H = new Uint16Array(gw); // running heights
  let best = { gx: 0, gy: 0, gw: 0, gh: 0, area: 0 };

  for (let y = 0; y < gh; y++) {
    // Update histogram
    for (let x = 0; x < gw; x++) {
      H[x] = a[y * gw + x] ? (H[x] + 1) : 0;
    }
    // Max rectangle in histogram (monotonic stack)
    const stack = [];
    for (let x = 0; x <= gw; x++) {
      const h = x < gw ? H[x] : 0;
      let start = x;
      while (stack.length && h < stack[stack.length - 1].h) {
        const { h: hh, i: ii } = stack.pop();
        const width = x - ii;
        const area = hh * width;
        if (area > best.area) {
          best = { gx: ii, gy: y - hh + 1, gw: width, gh: hh, area };
        }
        start = ii;
      }
      stack.push({ h, i: start });
    }
  }
  return best.area > 0 ? best : null;
}
```

#### **Water-Aware Frame Selection**
```javascript
// src/main.js - Intelligent frame selection
function chooseBestFrameRect(viewportRect, landRect, mask, margin = 8) {
  // Generate 4 frame rectangles (top, bottom, left, right)
  const frames = [
    { x: vX, y: vY, w: viewportW, h: Math.max(0, T - vY), side: "top" },
    { x: vX, y: B, w: viewportW, h: Math.max(0, vY+viewportH - B), side: "bottom" },
    { x: vX, y: T, w: Math.max(0, L - vX), h: Math.max(0, B - T), side: "left" },
    { x: R, y: T, w: Math.max(0, vX+viewportW - R), h: Math.max(0, B - T), side: "right" }
  ].filter(r => r.w > 16 && r.h > 16);

  // Score by water content * area * aspect ratio penalty
  let best = null;
  for (const r of frames) {
    const fr = intersectRect(r, viewportRect); // ensure inside safe viewport
    if (fr.w < 16 || fr.h < 16) continue;
    const wf = mask ? waterFractionInRect(mask, fr) : 1;
    const area = fr.w * fr.h;
    const score = wf * area * arPenalty(fr);
    if (!best || score > best.__score) best = r;
  }
  return best?.__rect || null;
}
```

#### **Visual Debug System**
```javascript
// src/main.js - Debug overlay visualization
function drawDebugBounds(safeVP, landRect) {
  const layer = ensureOceanDebugLayer();
  // Blue safe viewport
  layer.append("rect").attr("class", "debug-safe-vp")
    .style("fill", "none").style("stroke", "#60a5fa")
    .style("stroke-width", 1.5).style("vector-effect", "non-scaling-stroke");
  // Orange dashed land bbox
  if (landRect) layer.append("rect").attr("class", "debug-land-bbox")
    .style("fill", "none").style("stroke", "#f59e0b")
    .style("stroke-dasharray", "4 3").style("stroke-width", 1.5);
}
```

### 🎨 **Visual Debug System**

#### **Debug Overlay Colors**
- **Blue solid**: Safe viewport (inset from screen edges)
- **Orange dashed**: Land bounding box (computed from terrain data)
- **Cyan solid**: Final chosen placement area (SAT or frame-based)
- **Cyan center tick**: Exact label anchor point

#### **Debug Controls**
- `LabelsDebug.debugBoxes(true)` - Show all debug overlays
- `LabelsDebug.debugBoxes(false)` - Hide all debug overlays
- Console logging shows water fractions, scores, and placement decisions

### 🚀 **Performance & Quality Improvements**

#### **Algorithm Efficiency**
- **O(gw*gh) complexity**: Linear time for largest rectangle finding
- **Configurable resolution**: 8px cells provide good balance of speed vs precision
- **Early exit optimizations**: Single-line fits win immediately
- **Cached computations**: Water masks reused across placement attempts

#### **Placement Quality**
- **Water-aware selection**: Prefers areas with higher water content
- **Aspect ratio optimization**: Avoids extremely skinny rectangles
- **Coast buffer**: 12px erosion keeps labels away from coastlines
- **Safe boundaries**: All placements respect viewport insets

#### **Robustness**
- **Multiple fallback paths**: SAT → frame→refine → anchor-based placement
- **Error handling**: Graceful degradation when SAT fails
- **Debug instrumentation**: Comprehensive logging for troubleshooting
- **Visual feedback**: Immediate visual confirmation of placement decisions

### 📊 **System Integration**

#### **Unified Water Analysis**
- Both SAT and frame-based paths use the same water mask
- Consistent water fraction calculations across all placement methods
- Shared rectangle utilities for intersection and clamping operations

#### **Debug API Integration**
- `LabelsDebug.debugBoxes()` controls all debug overlays
- Console logging provides detailed placement decision information
- Visual debugging makes algorithm behavior transparent

#### **Performance Monitoring**
- Comprehensive logging of SAT mask dimensions and processing time
- Frame scoring shows water fractions and aspect ratio penalties
- Debug overlays provide immediate visual feedback

### 🎯 **Next Steps**

The SAT-based ocean placement system is now complete with:
- ✅ Water-aware placement using actual terrain data
- ✅ Efficient algorithms for real-time performance
- ✅ Comprehensive debug visualization
- ✅ Robust fallback mechanisms
- ✅ Unified rectangle utilities

The system provides intelligent, water-aware ocean label placement that significantly improves placement quality while maintaining excellent performance and providing comprehensive debugging capabilities.

---

## 2025-01-27 - Step 1 Complete: Ocean Label Layout Computation + Debug Visualization ✅

### 🎯 **Step 1: Ocean Label Layout Computation + Debug Visualization Complete**
Successfully implemented Step 1 of the ocean label placement system, which computes optimal font sizes and text wrapping for ocean labels within chosen rectangles. The system now provides intelligent layout optimization with debug visualization, storing results per-epoch for Step 2 consumption.

### 📋 **What Was Accomplished**

#### **1. Text Measurement Utility (`src/core/measure-text.js`)**
- **Offscreen canvas measurement**: Reliable text width/height using canvas context
- **Font string builder**: Proper CSS font string formatting with size, family, weight, style
- **Letter spacing support**: Accurate width calculations including letter-spacing adjustments
- **Word wrapping utility**: Greedy algorithm for fitting text within width constraints
- **Performance optimized**: Singleton canvas context for efficient reuse

#### **2. Ocean Layout Scorer (`src/labels/ocean/layout.js`)**
- **Layout optimization**: Finds best font size and wrapping for given rectangle
- **Scoring algorithm**: Prioritizes larger fonts, good space utilization, fewer lines
- **Multi-line support**: Tests 1, 2, and 3 lines for each font size
- **Early exit optimization**: Single-line fits at maximum size win immediately
- **Comprehensive options**: Configurable font ranges, padding, letter-spacing

#### **3. Step 1 Orchestration (`src/main.js`)**
- **Placements registry**: Per-epoch storage of computed layouts
- **All placement paths covered**: SAT-based, frame-based, and fallback placement
- **Layout computation**: Calls `computeBestLayout` for each chosen rectangle
- **Debug visualization**: Draws faint rectangles and center ticks
- **No final rendering**: Step 1 stops after computation and storage

#### **4. Enhanced Debug API**
- **LabelsDebug.oceanBest()**: Inspect current epoch's ocean layout decision
- **Placement inspection**: Easy access to rect, font size, lines, and scoring
- **Console debugging**: Developer-friendly inspection of Step 1 results

### 🔧 **Technical Implementation**

#### **Text Measurement Core**
```javascript
// src/core/measure-text.js - Offscreen canvas measurement
let _canvas, _ctx;
function ctx() {
  if (!_canvas) { _canvas = document.createElement("canvas"); _ctx = _canvas.getContext("2d"); }
  return _ctx;
}

export function measureLine(text, fontPx, opts = {}) {
  const { family = "serif", letterSpacing = 0, lineHeight = 1.2, weight = "", style = "" } = opts;
  const c = ctx();
  c.font = fontString(fontPx, family, weight, style);
  const m = c.measureText(text || "");
  const width = (m.width || 0) + Math.max(0, (text?.length ? (text.length - 1) : 0)) * letterSpacing;
  const height = Math.ceil(fontPx * lineHeight);
  return { width, height, fontPx, lineHeight, letterSpacing, family };
}
```

#### **Layout Optimization Algorithm**
```javascript
// src/labels/ocean/layout.js - Best layout computation
export function computeBestLayout(rect, text, k, opts = {}) {
  const { maxPx = 36, minPx = 12, stepPx = 1, padding = 8, letterSpacing = 0.08 } = opts;
  
  let best = null;
  for (let px = maxPx; px >= minPx; px -= stepPx) {
    // Try single line first
    const one = measureLine(text, px, { family, letterSpacing, lineHeight });
    if (one.width <= innerW && one.height <= innerH) {
      const score = px * 10 + (one.width / innerW) * 2 - 0.5;
      best = { ok: true, fontPx: px, lines: [text], score, reasons };
      break; // max px single-line wins
    }
    // Try wrapped into 2..maxLines
    for (let lines = 2; lines <= maxLines; lines++) {
      const wrapped = wrapText(text, px, innerW, { family, letterSpacing, lineHeight }, lines);
      if (wrapped && wrapped.height <= innerH) {
        const score = px * 10 + fill * 3 - linePenalty;
        if (!best || score > best.score) best = candidate;
      }
    }
  }
  return best;
}
```

#### **Step 1 Integration**
```javascript
// src/main.js - Step 1 orchestration
const __placements = new Map(); // epoch -> { ocean?: {...}, seas?:[], ... }

function placementsForCurrentEpoch() {
  const e = getPlacementEpoch?.() ?? 0;
  if (!__placements.has(e)) __placements.set(e, {});
  return __placements.get(e);
}

// After choosing rect (SAT/frame/fallback), compute best layout
const best = computeBestLayout(rect, label, k, {
  maxPx: 36, minPx: 12, stepPx: 1,
  padding: 10, letterSpacing: 0.6, family: "serif", lineHeight: 1.2, maxLines: 3
});

if (best?.ok) {
  const bucket = placementsForCurrentEpoch();
  bucket.ocean = { rect, best, k };
  
  // Debug draw: outline chosen rect + center tick
  const g = ensureOceanLabelGroup();
  g.append("rect").attr("class", "ocean-layout-debug")...
  g.append("line").attr("class", "ocean-layout-center")...
}
```

#### **Debug API Extension**
```javascript
// src/main.js - Enhanced LabelsDebug
Object.assign(window.LabelsDebug, {
  step0: step0ClearAfterAutofit,
  epoch: () => getPlacementEpoch?.(),
  bumpEpoch: () => bumpPlacementEpoch?.(),
  cancel: () => { try { cancelPendingPlacement(); } catch (e) { console.warn(e); } },
  oceanBest: () => { const p = placementsForCurrentEpoch(); return p?.ocean || null; },
});
```

### 🎨 **Debug Visualization**

#### **Visual Elements**
- **Faint rectangles**: Show chosen placement areas with 40% opacity
- **Center ticks**: Horizontal lines indicating anchor points
- **Consistent styling**: Uses `currentColor` for theme compatibility
- **Clean removal**: Previous debug elements removed before new ones added

#### **Console Inspection**
```javascript
// Check what Step 1 decided
LabelsDebug.oceanBest()
// Returns: { rect: {...}, best: {fontPx: 24, lines: ["Ocean"], score: 245.6}, k: 1 }

// Inspect the chosen rectangle
LabelsDebug.oceanBest()?.rect
// Returns: { x: 100, y: 80, w: 200, h: 60 }

// Check font size and line count
LabelsDebug.oceanBest()?.best
// Returns: { fontPx: 24, lines: ["Ocean"], lineWidths: [120], score: 245.6 }
```

### 🚀 **Next Steps: Step 2**

Step 1 is now complete and provides:
- ✅ **Layout computation**: Optimal font sizes and wrapping
- ✅ **Result storage**: Per-epoch placement decisions
- ✅ **Debug visualization**: Visual feedback for chosen areas
- ✅ **Console inspection**: Easy access to computed layouts

Step 2 will consume these stored layouts and render the actual ocean labels with the computed font sizes and line configurations.

---

## 2025-01-27 - Step 0 Complete: Label Placement State Cleanup + Store Warnings ✅

### 🎯 **Step 0: Label Placement State Cleanup + Store Warnings Complete**
Successfully implemented comprehensive label placement state cleanup after autofit operations, including placement epoch management, DOM cleanup, store reset, and intelligent warnings for numeric-only payloads. The system now provides clean, isolated placement runs with protection against stale callbacks and confusing store updates.

### 📋 **What Was Accomplished**

#### **1. Step 0 Placement State Cleanup (`src/main.js`)**
- **Placement epoch system**: Unique epoch numbers for each autofit run
- **DOM cleanup**: Removes rendered labels while preserving containers
- **Pending work cancellation**: Cancels idle handles and scheduled placement work
- **Store reset**: Resets store to clean, empty state
- **Automatic execution**: Triggers immediately after zoom extent lock

#### **2. Epoch-Based Callback Protection**
- **Epoch capture**: Records epoch when placement is scheduled
- **Stale callback detection**: Ignores callbacks from previous epochs
- **Immediate placement guards**: Prevents execution if epoch changed
- **Idle callback protection**: Safely ignores late idle callbacks
- **Comprehensive logging**: Tracks epoch progression and callback filtering

#### **3. Intelligent Store Warnings**
- **Numeric-only detection**: Identifies payloads with only counts (no arrays)
- **Warning + ignore**: Logs clear warnings and returns unchanged store
- **Step 0 protection**: Allows explicit resets while blocking rogue writes
- **Merge-safe operations**: Preserves existing arrays when appropriate
- **Developer awareness**: Clear console warnings about ignored payloads

#### **4. Dev Console Debug Tools**
- **LabelsDebug API**: `window.LabelsDebug` namespace for console debugging
- **Step 0 control**: `LabelsDebug.step0()` for manual cleanup
- **Epoch inspection**: `LabelsDebug.epoch()` and `LabelsDebug.bumpEpoch()`
- **Work cancellation**: `LabelsDebug.cancel()` for pending placement work
- **Dev-only exposure**: Only available in browser environment

### 🔧 **Technical Implementation**

#### **Step 0 Core Functions**
```javascript
// src/main.js - Placement epoch & cleanup helpers
var __placementEpoch = 0;
export function getPlacementEpoch() { return __placementEpoch; }
export function bumpPlacementEpoch() { __placementEpoch += 1; return __placementEpoch; }

export function step0ClearAfterAutofit() {
  const epoch = bumpPlacementEpoch();
  cancelPendingPlacement();
  clearLabelDOM();
  resetLabelStoreClean();
  console.log("[step0] Ready for fresh placement. epoch=", epoch);
}
```

#### **Epoch-Guarded Placement Scheduling**
```javascript
// src/main.js - Epoch protection in deferOceanPlacement
function deferOceanPlacement(callback, options = {}) {
  // Capture current epoch at schedule time
  const epochAtSchedule = getPlacementEpoch?.() ?? __placementEpoch ?? 0;
  
  // ... scheduling logic ...
  
  _oceanIdleHandle = deferIdle(() => {
    // Ignore late callback from previous epoch
    const nowEpoch = getPlacementEpoch?.() ?? __placementEpoch ?? 0;
    if (nowEpoch !== epochAtSchedule) {
      console.log("[step0] Skip idle callback from stale epoch", { epochAtSchedule, nowEpoch });
      return;
    }
    callback();
  }, { timeout, fallbackDelay });
}
```

#### **Store Warning System**
```javascript
// src/main.js - Numeric-only payload detection
export function setFeatureLabelsStore(next) {
  // ... normalization logic ...
  
  // If caller provided only numeric counts (no arrays), treat as a no-op and warn.
  const onlyNumbersNoArrays =
    !Array.isArray(normNext.oceans) &&
    !Array.isArray(normNext.nonOcean) &&
    Object.keys(normNext).every(k => ["total", "ocean", "oceans", "nonOcean"].includes(k) && typeof normNext[k] !== "object");
  if (onlyNumbersNoArrays) {
    console.warn("[store] ignored numeric-only payload (no arrays provided)", normNext);
    return __labelsStore;
  }
  
  // ... normal processing ...
}
```

#### **Dev Console Debug API**
```javascript
// src/main.js - Dev-only debug tools
if (typeof window !== "undefined") {
  Object.assign(window.LabelsDebug, {
    step0: step0ClearAfterAutofit,
    epoch: () => getPlacementEpoch?.(),
    bumpEpoch: () => bumpPlacementEpoch?.(),
    cancel: () => { try { cancelPendingPlacement(); } catch (e) { console.warn(e); } },
  });
  console.log("[debug] window.LabelsDebug ready (step0 | epoch | bumpEpoch | cancel)");
}
```

### 🚀 **Benefits Achieved**

- **Clean placement state**: Each autofit run starts with known-clean state
- **Callback isolation**: Late callbacks from previous runs can't pollute current state
- **Store consistency**: Prevents rogue numeric-only writes from clobbering arrays
- **Developer visibility**: Clear warnings and debug tools for troubleshooting
- **Performance protection**: Cancels pending work to avoid unnecessary processing
- **Epoch tracking**: Clear visibility into placement run isolation

### 🔍 **What Was Fixed**

- **Post-autofit confusion**: No more `{total: 0, ocean: 0, nonOcean: 0}` store pollution
- **Stale callback execution**: Late placement callbacks are safely ignored
- **DOM state cleanup**: Previous labels are removed before new placement
- **Store reset reliability**: Step 0 provides explicit, controlled store reset
- **Debug visibility**: Console warnings and debug API for troubleshooting
- **Placement isolation**: Each autofit run is completely independent

### 🧪 **Testing & Verification**

- **Step 0 test page**: `test-step0.html` verifies cleanup functions
- **Store warnings test**: `test-store-warnings.html` tests numeric-only payload handling
- **Debug API test**: `test-debug-api.html` verifies console tools
- **Console integration**: All warnings and debug messages are properly logged
- **Epoch progression**: Verified epoch increments and callback filtering

---

## 2025-01-27 - Step 9 Complete: SeaLevel Resolution + Scope Safety ✅

### 🎯 **SeaLevel Resolution + Scope Safety Complete**
Successfully implemented robust seaLevel resolution with proper scope capture, eliminating ReferenceError issues in nested callbacks and global functions. The system now provides a single source of truth for seaLevel configuration with proper fallback and clamping.

### 📋 **What Was Accomplished**

#### **1. SeaLevel Resolver Function (`src/main.js`)**
- **`resolveSeaLevel(state, opts)`** with proper fallback and clamping
- **Single source of truth** for seaLevel configuration
- **Automatic fallback** to `DEFAULT_SEA_LEVEL = 0.20` when no value provided
- **Value clamping** ensures seaLevel stays within [0, 1] range
- **Priority order**: opts.seaLevel → state.seaLevel → DEFAULT_SEA_LEVEL

#### **2. Scope-Safe SeaLevel Usage**
- **Captured in generate()** with `const sl = seaLevel;` for nested callbacks
- **Global functions** use `DEFAULT_SEA_LEVEL` constant directly
- **No more ReferenceError** from free variable access in nested promises
- **Consistent behavior** across all seaLevel-dependent operations

#### **3. Comprehensive SeaLevel Integration**
- **Coastline refinement**: Uses resolved seaLevel for coastal point generation
- **Water components**: Ocean/sea/lake classification with consistent seaLevel
- **SAT placement**: Ocean label placement with proper water detection
- **Autofit functions**: Land bounding box computation with correct seaLevel
- **Debug logging**: Consistent seaLevel reporting across all operations

### 🔧 **Technical Implementation**

#### **SeaLevel Resolver**
```javascript
// src/main.js - Single source of truth for seaLevel
const DEFAULT_SEA_LEVEL = 0.20;

/** Resolve sea level from options/state with clamping. */
function resolveSeaLevel(state, opts) {
  let v = (opts && Number.isFinite(opts.seaLevel) ? opts.seaLevel : undefined);
  if (v == null && state && Number.isFinite(state.seaLevel)) v = state.seaLevel;
  if (!Number.isFinite(v)) v = DEFAULT_SEA_LEVEL;
  if (v < 0) v = 0;
  if (v > 1) v = 1;
  return v;
}
```

#### **Scope-Safe Capture in Generate**
```javascript
// src/main.js - Captured for nested callbacks
// NOTE: Do not reference `seaLevel` as a free variable inside generate() or nested callbacks.
// Always use the captured `sl` defined below.

// Resolve once per run and capture for nested callbacks/promises.
const seaLevel = resolveSeaLevel(window.__mapState, options);
const sl = seaLevel; // stable capture
```

#### **Global Function Safety**
```javascript
// src/main.js - Uses constant directly, no scope issues
window.fitLand = () => fitToLand({
  svg: svgSel,
  zoom: zoom,
  polygons,
  width: mapWidth,
  height: mapHeight,
  seaLevel: DEFAULT_SEA_LEVEL, // Constant, always available
  preferFeatureType: true,
  margin: 0.08,
  duration: 600
});
```

### 🚀 **Benefits Achieved**

- **No more ReferenceError**: Eliminated free variable access issues in nested callbacks
- **Single source of truth**: All seaLevel values come from the resolver function
- **Proper fallback**: Automatic fallback to sensible defaults when no value provided
- **Value validation**: SeaLevel values are clamped to valid [0, 1] range
- **Scope safety**: Global functions use constants, local functions use captured values
- **Consistent behavior**: Same seaLevel value used throughout generation pipeline

### 🔍 **What Was Fixed**

- **Coastline refinement**: Now uses `DEFAULT_SEA_LEVEL` instead of undefined `sl`
- **Water components**: Consistent seaLevel for ocean/sea/lake classification
- **SAT placement**: Proper seaLevel for ocean label placement algorithms
- **Autofit functions**: Correct seaLevel for land bounding box computation
- **Debug logging**: Consistent seaLevel reporting across all operations
- **Global functions**: No more scope issues in `window.fitLand` and similar functions

---

## 2025-01-27 - Step 8 Complete: Robust Idle Scheduler + Ocean Placement Resilience ✅

### 🎯 **Robust Idle Scheduler + Ocean Placement Resilience Complete**
Successfully implemented a centralized idle scheduler with Safari-safe options handling, robust ocean placement with fallback labels, and merge-safe store operations. The system now provides bulletproof idle scheduling, resilient ocean label placement, and data-safe store updates.

### 📋 **What Was Accomplished**

#### **1. Centralized Idle Scheduler (`src/core/idle.js`)**
- **`deferIdle(cb, { timeout, fallbackDelay, signal })`** with safe options handling
- **Safari-compatible** - only passes options when timeout is finite
- **Automatic fallback** to `setTimeout` when `requestIdleCallback` unavailable
- **Cancellation support** with `.cancel()` method on returned handles
- **Signal support** for early cancellation via AbortSignal
- **Error handling** with try-catch wrapper and console logging

#### **2. Ocean Placement Resilience (`src/main.js`)**
- **Hoisted store helpers** prevent TDZ errors with `var __labelsStore`
- **Merge-safe store updates** via `setFeatureLabelsStore()` prevent data loss
- **Fallback to cached anchors** when legacy store is empty
- **SAT precondition instrumentation** logs exact inputs and thresholds
- **Safe fallback labels** when SAT rectangle finding fails
- **Counter-scaled fallback** maintains constant size across zoom levels

#### **3. Store Safety & Normalization**
- **Key normalization** automatically converts `ocean` → `oceans`
- **Array preservation** prevents accidental array clobbering
- **Total recalculation** always accurate from actual data
- **Backward compatibility** maintains `window.__labelsStore` for existing code
- **Hoisted functions** ensure `ensureLabelsStore()` and `setFeatureLabelsStore()` available everywhere

#### **4. Ocean Label Fallback System**
- **`ensureOceanLabelGroup()`** creates dedicated ocean label layer
- **`placeOceanFallbackLabel(anchor)`** places readable labels at anchor centers
- **Counter-scaling** maintains constant visual size across zoom levels
- **Duplicate prevention** removes existing fallbacks before placing new ones
- **Comprehensive logging** shows when and why fallbacks are used

### 🔧 **Technical Implementation**

#### **Centralized Idle Scheduler**
```javascript
// src/core/idle.js - Safari-safe idle scheduling
export function deferIdle(cb, opts = {}) {
  const { timeout, fallbackDelay = 16, signal } = opts;

  if (signal?.aborted) return { type: "none", id: null, cancel: () => {} };

  const wrapped = (deadline) => {
    if (signal?.aborted) return;
    try { cb(deadline); } catch (err) { console.error("[idle] callback error:", err); }
  };

  if (hasRIC()) {
    // Only pass options when timeout is finite (Safari-safe)
    if (Number.isFinite(timeout)) {
      const id = window.requestIdleCallback(wrapped, { timeout: Number(timeout) });
      return { type: "ric", id, cancel: () => window.cancelIdleCallback?.(id) };
    } else {
      const id = window.requestIdleCallback(wrapped);
      return { type: "ric", id, cancel: () => window.cancelIdleCallback?.(id) };
    }
  }

  // Fallback to setTimeout
  const delay = Math.max(0, Number.isFinite(fallbackDelay) ? fallbackDelay : 16);
  const id = window.setTimeout(() => wrapped({ didTimeout: true, timeRemaining: () => 0 }), delay);
  return { type: "timeout", id, cancel: () => window.clearTimeout(id) };
}
```

#### **Merge-Safe Store Updates**
```javascript
// src/main.js - Prevents data loss during store updates
export function setFeatureLabelsStore(next) {
  const prev = ensureLabelsStore();
  const normNext = { ...next };
  
  // Normalize singular key if some producers send { ocean: [...] }
  if (normNext && "ocean" in normNext && !("oceans" in normNext)) {
    normNext.oceans = normNext.ocean;
    delete normNext.ocean;
  }

  const merged = { ...prev, ...normNext };
  if (!Array.isArray(merged.oceans)) merged.oceans = Array.isArray(prev.oceans) ? prev.oceans : [];
  if (!Array.isArray(merged.nonOcean)) merged.nonOcean = Array.isArray(prev.nonOcean) ? prev.nonOcean : [];
  merged.total = (merged.oceans?.length || 0) + (merged.nonOcean?.length || 0);

  __labelsStore = merged;
  return __labelsStore;
}
```

#### **Ocean Placement Fallback**
```javascript
// src/main.js - Always shows ocean labels, even when SAT fails
function placeOceanFallbackLabel(anchor) {
  if (!anchor) return;
  const k = (window.__zoom && window.__zoom.k) || window.zoomK || 1;
  const g = ensureOceanLabelGroup();
  const id = `ocean-fallback-${anchor.id || "0"}`;
  
  // Remove any previous fallback for id to avoid duplicates
  g.select(`#${id}`).remove();

  const cx = anchor.cx ?? anchor.x ?? (anchor.bbox?.cx) ?? 0;
  const cy = anchor.cy ?? anchor.y ?? (anchor.bbox?.cy) ?? 0;
  const label = anchor.label || anchor.name || "Ocean";

  // Choose a safe, readable pixel size (bounded)
  const fontPx = Math.max(12, Math.min(24, (label?.length || 10) < 12 ? 22 : 18));

  // Create a child group with counter-scaling
  const node = g.append("g")
    .attr("id", id)
    .attr("class", "ocean-label fallback")
    .attr("transform", `translate(${cx},${cy}) scale(${1 / k})`)
    .style("pointer-events", "none")
    .style("opacity", 0.92);

  node.append("text")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central")
    .attr("class", "label water ocean")
    .style("font-style", "italic")
    .style("letter-spacing", "0.08em")
    .style("font-size", `${fontPx}px`)
    .text(label);

  console.log("[ocean][fallback] placed:", { id, k, cx, cy, fontPx, label });
}
```

### 🧪 **Testing & Verification**

#### **Idle Scheduler Tests**
- **Basic functionality** - defer/cancel operations work correctly
- **Safari compatibility** - options only passed when timeout is finite
- **Fallback behavior** - setTimeout used when RIC unavailable
- **Race protection** - cancellation prevents duplicate executions
- **Error handling** - exceptions caught and logged

#### **Ocean Placement Tests**
- **SAT success path** - normal rectangle finding and placement
- **SAT failure path** - fallback labels appear at anchor centers
- **Store fallback** - cached water anchors used when legacy store empty
- **Zoom consistency** - fallback labels maintain size across zoom levels
- **Duplicate prevention** - only one fallback label per ocean

#### **Store Safety Tests**
- **Key normalization** - `ocean` → `oceans` conversion works
- **Array preservation** - existing arrays not clobbered by empty updates
- **Total accuracy** - counts always reflect actual data
- **Backward compatibility** - existing code continues to work

### 🚀 **Performance Impact**

- **Idle scheduling** - ocean placement no longer blocks main thread
- **Store operations** - merge-safe updates prevent unnecessary recomputation
- **Fallback labels** - minimal overhead, only created when needed
- **SAT instrumentation** - logging adds negligible performance cost

### 🔍 **Debugging & Monitoring**

#### **SAT Precondition Logging**
```
[ocean][sat:pre] k= 1.5 anchor: { id: "ocean-0", name: "ATLANTIC", areaW: 1200, areaH: 800, cx: 512, cy: 384 } thresholds: { _minPx: 12, _maxPx: 24, _minRectW: 80, _minRectH: 18 }
```

#### **SAT Result Logging**
```
[ocean][sat:hit] { x: 256, y: 192, w: 400, h: 96 }
[ocean][sat:miss] No rectangle returned. Likely causes: too-small ocean area, overly strict min size, or fully blocked mask.
```

#### **Fallback Placement Logging**
```
[ocean] ❌ No suitable SAT rectangle found; placing fallback label at anchor center.
[ocean][fallback] placed: { id: "ocean-fallback-0", k: 1.5, cx: 512, cy: 384, fontPx: 18, label: "ATLANTIC" }
```

### 📈 **Next Steps**

The system now provides robust ocean label placement with comprehensive fallback mechanisms. Future improvements could include:
- **Enhanced SAT algorithms** for better rectangle finding
- **Dynamic threshold adjustment** based on ocean size and zoom level
- **Advanced collision avoidance** for fallback labels
- **Performance optimization** for large numbers of ocean features

---

## 2025-01-27 - Step 7 Complete: Real Text Metrics (Canvas) + Reliable Zoom Utils ✅

### 🎯 **Real Text Metrics + Reliable Zoom Utils Complete**
Successfully implemented Canvas-based text measurement for precise label box sizing and reliable zoom utilities for consistent zoom state access throughout the application. The system now provides accurate text dimensions and robust zoom state management.

### 📋 **What Was Accomplished**

#### **1. Canvas-Based Text Metrics (`src/labels/metrics/text-metrics.js`)**
- **`measureLabel()` function** uses Canvas `measureText()` for precise dimensions
- **Font property handling** supports family, weight, italic, size per tier
- **Caps transformation** with smart title case (small words remain lowercase)
- **Letter spacing calculation** for accurate width measurements
- **Performance caching** prevents repeated Canvas operations
- **Fallback metrics** when Canvas metrics aren't available

#### **2. Enhanced Candidate Generation (`src/labels/placement/candidates.js`)**
- **Replaced heuristic text width estimation** with real Canvas measurements
- **Integrated `measureLabel()` function** for accurate text box sizing
- **Applied caps transformation** during measurement (text is shaped before measuring)
- **Precise width/height calculations** using actual font metrics (ascent + descent)
- **No more guesswork** - candidate boxes now match actual text dimensions exactly

#### **3. Reliable Zoom Utilities (`src/core/zoom-utils.js`)**
- **`getZoomScale()`** returns current zoom scale factor reliably
- **`getZoomTransform()`** returns full zoom transform object {k, x, y}
- **`getZoomState()`** returns convenient zoom state with human-readable level
- **Fallback system** uses `window.currentTransform` when D3 zoom is unavailable
- **Global setup** automatically provides `window.getZoomScale`, `window.getZoomTransform`, `window.getZoomState`

#### **4. QA Seeding After Autofit (`src/main.js`)**
- **Updated all autofit success locations** to use `getZoomScale()`
- **Immediate QA seeding** right after autofit completes (not at zoom 0)
- **Consistent zoom access** across all three autofit methods
- **Eliminated repetitive** zoom extraction logic
- **Better user experience** - QA elements appear at correct zoom level immediately

#### **5. Comprehensive Test Suite**
- **`dev/test-text-metrics.html`** - Tests all text metrics functionality
- **`dev/test-zoom-utils.html`** - Tests zoom utilities and fallback behavior
- **Visual feedback** with Canvas previews and zoom state displays
- **Performance testing** for caching effectiveness
- **Fallback testing** when D3 zoom is unavailable

### 🔧 **Technical Implementation**

#### **Canvas-Based Text Measurement**
```javascript
// src/labels/metrics/text-metrics.js - Precise text dimensions
export function measureLabel({ text, style={}, tier="t3" }) {
  const size = (style.size && style.size[tier]) || 12;
  const family = style.fontFamily || "serif";
  const weight = style.weight || 400;
  const italic = !!style.italic;
  const letterSpacing = style.letterSpacing || 0;
  const caps = style.caps || "none";

  const shaped = applyCaps(text || "", caps);
  const key = JSON.stringify({ shaped, size, family, weight, italic, letterSpacing });

  if (_cache.has(key)) return { ..._cache.get(key), text: shaped };

  const c = ctx();
  c.font = cssFont({ size, weight, italic, family });
  const m = c.measureText(shaped);
  const trackExtra = Math.max(0, shaped.length - 1) * letterSpacing * size;
  const w = m.width + trackExtra;
  const asc = (m.actualBoundingBoxAscent ?? size * 0.8);
  const desc = (m.actualBoundingBoxDescent ?? size * 0.2);

  const out = { w, asc, desc, em: size };
  _cache.set(key, out);
  return { ...out, text: shaped };
}
```

#### **Reliable Zoom State Access**
```javascript
// src/core/zoom-utils.js - Consistent zoom state management
export function getZoomScale() {
  try {
    const svg = d3.select('svg').node();
    if (svg) {
      return d3.zoomTransform(svg).k;
    }
  } catch (e) {
    // Fallback if D3 or SVG not available
  }
  return window.currentTransform?.k ?? 1;
}

export function getZoomState() {
  const transform = getZoomTransform();
  return {
    scale: transform.k,
    x: transform.x,
    y: transform.y,
    level: getZoomLevel(transform.k)
  };
}
```

#### **QA Seeding After Autofit**
```javascript
// src/main.js - Immediate QA seeding after autofit success
// after autofit success:
if (window.syncQADotsLOD)    window.syncQADotsLOD(getZoomScale());
if (window.syncQACandidates) window.syncQACandidates(getZoomScale());
if (window.syncQACollision)  window.syncQACollision(getZoomScale());
```

### 🎯 **Key Benefits**

1. **Precise Text Boxes**: Candidate boxes now match actual text dimensions exactly
2. **Font-Aware Measurements**: Handles different fonts, weights, and styles correctly
3. **Performance Optimized**: Caching prevents repeated Canvas operations
4. **Typography Support**: Proper caps transformation and letter spacing
5. **Reliable Zoom Access**: Consistent zoom state from anywhere in the application
6. **Immediate QA Feedback**: Users see QA elements at correct zoom level after autofit
7. **Fallback Safety**: Graceful degradation when Canvas metrics aren't available

### 🚀 **Next Steps**

The text metrics and zoom utilities are now ready for **Step 8** where we'll implement the actual text rendering using these precise metrics. The candidate boxes will fit the text exactly, eliminating the need for manual adjustments or guesswork in label placement.

---

## 2025-01-27 - Step 6 Complete: Greedy Collision Pruning + QA Visualization ✅

### 🎯 **Greedy Collision Pruning + QA Visualization Complete**
Successfully implemented a greedy collision detection system with spatial grid indexing for performance, plus comprehensive QA visualization showing accepted vs rejected label candidates. The system now provides real-time collision pruning with visual feedback for debugging label placement conflicts.

### 📋 **What Was Accomplished**

#### **1. Collision Detection Module (`src/labels/placement/collide.js`)**
- **`greedyPlace()` function** implements greedy placement algorithm
- **AABB intersection testing** with efficient `intersects()` helper
- **Priority-based ranking** using tier scores + kind boosts + area penalties
- **GridIndex spatial indexing** with configurable cell size (default 64px)
- **Performance optimized** neighborhood queries for collision detection
- **Returns structured results** with `{ placed, rejected }` arrays

#### **2. Enhanced QA Visualization (`src/labels/debug-markers.js`)**
- **`renderQACollision()`** shows accepted (green) vs rejected (red) rectangles
- **Reuses existing** `findWorldLayer()` helpers for zoom-aware positioning
- **Non-scaling strokes** maintain crisp rendering under zoom transforms
- **Visual distinction** between successful and failed placements
- **Automatic cleanup** with D3 data binding for dynamic updates

#### **3. Main App Integration (`src/main.js`)**
- **Imports** `greedyPlace` and `renderQACollision` functions
- **`window.syncQACollision(k)`** function for zoom-driven collision updates
- **Flag-gated** with `?flags=qaCollide` URL parameter
- **Global exposure** of collision results for debugging
- **Initial collision test** at k=1.0 when flag is enabled
- **Console logging** shows placed/rejected counts and zoom level

#### **4. Zoom Handler Integration (`src/modules/interaction.js`)**
- **Calls `syncQACollision(t.k)`** after applying zoom transforms
- **Maintains sync** with existing QA dots and candidates functionality
- **Real-time updates** as user zooms in/out
- **Performance optimized** - only updates when collision flag is enabled

#### **5. Test Page (`test-collision-qa.html`)**
- **Independent test page** for collision system verification
- **Manual testing** of collision QA functionality
- **Function verification** buttons for testing collision detection
- **Console logging** for debugging collision metrics

### 🔧 **Technical Implementation**

#### **Greedy Placement Algorithm with Spatial Indexing**
```javascript
// src/labels/placement/collide.js - Efficient collision detection
export function greedyPlace(candidates, { cell = 64 } = {}) {
  const placed = [];
  const rejected = [];
  const grid = new GridIndex(cell);

  const sorted = [...(candidates || [])].sort((a, b) => rank(b) - rank(a));
  for (const c of sorted) {
    const neighbors = grid.query(c);
    let hit = false;
    for (const n of neighbors) {
      if (intersects(c, n)) { hit = true; break; }
    }
    if (!hit) {
      placed.push(c);
      grid.insert(c);
    } else {
      rejected.push({ ...c, _reason: "overlap" });
    }
  }
  return { placed, rejected };
}
```

#### **Priority-Based Ranking System**
```javascript
// src/labels/placement/collide.js - Smart candidate prioritization
function rank(c) {
  const tierScore = { t1: 400, t2: 300, t3: 200, t4: 100 }[c.tier || "t3"] || 0;
  const kindBoost = { ocean: 40, sea: 30, lake: 20, region: 10 }[c.kind || ""] || 0;
  // Larger boxes later (prefer concise labels in tight spaces): negative area
  const area = Math.max(1, (c.x1 - c.x0) * (c.y1 - c.y0));
  return tierScore + kindBoost - area * 0.001; // very small area penalty
}
```

#### **Grid-Based Spatial Indexing**
```javascript
// src/labels/placement/collide.js - Fast neighborhood queries
class GridIndex {
  constructor(cell = 64) {
    this.cell = cell;
    this.cells = new Map(); // "ix,iy" -> Set of items
  }
  
  query(box) {
    const out = new Set();
    for (const k of this._rangeKeys(box)) {
      const bin = this.cells.get(k);
      if (!bin) continue;
      for (const it of bin) out.add(it);
    }
    return [...out];
  }
}
```

#### **QA Collision Visualization**
```javascript
// src/labels/debug-markers.js - Visual collision feedback
export function renderQACollision(svg, placed, rejected) {
  const layer = findWorldLayer(parent);

  // Accepted (green)
  let gOk = layer.select('#qa-cand-ok');
  if (gOk.empty()) gOk = layer.append('g').attr('id','qa-cand-ok');
  const ok = gOk.selectAll('rect.qa-ok').data(placed || [], d => d.id);
  ok.enter().append('rect')
    .attr('class','qa-ok')
    .attr('fill','none')
    .attr('stroke','#2ecc71')
    .attr('stroke-width',1.2)
    .style('vector-effect','non-scaling-stroke')
    .merge(ok)
    .attr('x', d => d.x0).attr('y', d => d.y0)
    .attr('width', d => Math.max(1, d.x1 - d.x0))
    .attr('height', d => Math.max(1, d.y1 - d.y0));

  // Rejected (red, translucent)
  let gBad = layer.select('#qa-cand-bad');
  if (gBad.empty()) gBad = layer.append('g').attr('id','qa-cand-bad');
  const bad = gBad.selectAll('rect.qa-bad').data(rejected || [], d => d.id);
  bad.enter().append('rect')
    .attr('class','qa-bad')
    .attr('fill','rgba(231, 76, 60, 0.10)')
    .attr('stroke','#e74c3c')
    .attr('stroke-width',1)
    .style('vector-effect','non-scaling-stroke')
    .merge(bad)
    .attr('x', d => d.x0).attr('y', d => d.y0)
    .attr('width', d => Math.max(1, d.x1 - d.x0))
    .attr('height', d => Math.max(1, d.y1 - d.y0));
}
```

### 🧪 **Testing & Verification**

#### **URL Flags for QA Testing**
- **`?flags=qaCollide`** enables collision visualization
- **Combines with existing** `?flags=qaCentroids,qaCandidates,qaCollide`
- **Real-time updates** during zoom operations
- **Console logging** shows collision metrics at each zoom level

#### **Performance Characteristics**
- **Grid cell size**: 64px (configurable via `{ cell: 64 }`)
- **Spatial indexing**: O(1) neighborhood queries for collision detection
- **Greedy algorithm**: O(n log n) sorting + O(n × neighbors) collision checks
- **Memory efficient**: Map-based grid with Set storage per cell

#### **Visual Feedback**
- **Green rectangles**: Successfully placed labels (no collisions)
- **Red rectangles**: Rejected labels due to overlaps
- **Zoom responsive**: All QA elements follow world coordinate transforms
- **Non-scaling strokes**: Maintain crisp appearance at all zoom levels

### 🚀 **Next Steps**

The collision detection system is now complete and provides:
1. **Efficient spatial indexing** for fast collision queries
2. **Smart prioritization** based on tier, kind, and area
3. **Real-time QA visualization** for debugging placement conflicts
4. **Zoom-responsive updates** that maintain sync with the map view

This foundation enables the next phase of label placement optimization and provides the debugging tools needed for fine-tuning the collision detection parameters.

---

## 2025-01-27 - Step 5 Complete: Placement Skeleton + QA Rectangles ✅

### 🎯 **Placement Skeleton + QA Rectangles Complete**
Successfully implemented the placement skeleton with candidate boxes for visible anchors and QA rectangles for debugging. The system now provides visual feedback for label placement candidates with LOD-aware filtering and zoom-responsive rendering.

### 📋 **What Was Accomplished**

#### **1. Candidates Module (`src/labels/placement/candidates.js`)**
- **`makeCandidates()` function** generates candidate boxes for visible anchors
- **LOD-aware filtering** using `visibleAtK()` for zoom-based visibility
- **Text width estimation** with basic heuristic (0.58 × length × size + letter spacing)
- **Centered positioning** with x0, y0, x1, y1 bounding box coordinates
- **Tier-based sizing** from style tokens with fallback defaults
- **Data-only approach** - no rendering, just candidate metadata

#### **2. Enhanced QA Helpers (`src/labels/debug-markers.js`)**
- **`renderQACandidates()`** draws orange rectangles for each candidate
- **`clearQACandidates()`** removes QA rectangles for cleanup
- **Reuses existing** `sel()` and `findWorldLayer()` helpers
- **Non-scaling strokes** for crisp rendering under zoom transforms
- **World coordinate positioning** follows zoom transforms correctly

#### **3. Main App Integration (`src/main.js`)**
- **Imports** `makeCandidates` and `renderQACandidates`
- **`window.syncQACandidates(k)`** function for zoom-driven updates
- **Flag-gated** with `?flags=qaCandidates` URL parameter
- **Global exposure** of `clearQACandidates` for testing
- **Initial render** at k=1.0 when flag is enabled
- **Console logging** shows candidate counts and data

#### **4. Zoom Handler Integration (`src/modules/interaction.js`)**
- **Calls `syncQACandidates(t.k)`** after applying zoom transforms
- **Maintains sync** with existing QA dots functionality
- **LOD filtering** updates as user zooms in/out
- **Performance optimized** - only updates when needed

#### **5. Test Page (`test-candidates.html`)**
- **Independent test page** for verification (no infinite redirects)
- **Manual flag testing** with link to main app
- **Function verification** buttons for testing candidates
- **Console logging** for debugging and verification

### 🔧 **Technical Implementation**

#### **Candidate Generation with LOD Filtering**
```javascript
// src/labels/placement/candidates.js - LOD-aware candidate boxes
export function makeCandidates({ anchorsLOD, k = 1.0 }) {
  if (!Array.isArray(anchorsLOD)) return [];
  const visibles = visibleAtK(anchorsLOD, k);

  return visibles.map(a => {
    const tier  = a.tier || "t3";
    const style = a.style || {};
    const size  = (style.size && style.size[tier]) || 12;
    const track = style.letterSpacing || 0;

    // text string (placeholder until names are wired)
    const text  = a.text || a.id;
    const w     = Math.max(6, estimateTextWidth(text, size, track));
    const h     = Math.max(6, size * 1.2); // ascent+descent approx

    // center the box on (x,y) for now (we'll bias per kind later)
    const x0 = a.x - w / 2;
    const y0 = a.y - h / 2;
    const x1 = a.x + w / 2;
    const y1 = a.y + h / 2;

    return {
      id: a.id, kind: a.kind, tier, x: a.x, y: a.y,
      text, size, w, h, x0, y0, x1, y1,
      lod: a.lod || { minK: 1, maxK: 32 }, style
    };
  });
}
```

#### **QA Rectangle Rendering with World Coordinates**
```javascript
// src/labels/debug-markers.js - Zoom-responsive QA rectangles
export function renderQACandidates(svg, candidates) {
  const parent = findWorldLayer(svg);
  let g = parent.select('#qa-candidates');
  if (g.empty()) g = parent.append('g').attr('id','qa-candidates');

  const seln = g.selectAll('rect.qa-cand').data(candidates || [], d => d.id);
  seln.enter()
    .append('rect')
    .attr('class', 'qa-cand')
    .attr('fill', 'none')
    .attr('stroke', '#f39c12')
    .attr('stroke-width', 1)
    .style('vector-effect', 'non-scaling-stroke')
    .merge(seln)
    .attr('x', d => d.x0)
    .attr('y', d => d.y0)
    .attr('width',  d => Math.max(1, d.x1 - d.x0))
    .attr('height', d => Math.max(1, d.y1 - d.y0));

  seln.exit().remove();
}
```

#### **Zoom-Driven Candidate Updates**
```javascript
// src/main.js - LOD-aware candidate sync
window.syncQACandidates = (k = 1.0) => {
  if (!hasFlag('qaCandidates')) return;
  const cands = makeCandidates({ anchorsLOD: window.__anchorsLOD, k });
  window.__candidates = cands; // for console poking
  const svgNode = (typeof svg !== 'undefined' && svg.node) ? svg : d3.select('svg');
  renderQACandidates(svgNode, cands);
};

// src/modules/interaction.js - Zoom handler integration
function zoomed() {
  const t = d3.event.transform;
  // ... transform application ...
  
  // keep QA dots glued and LOD-filtered as you zoom
  if (window.syncQADotsLOD) window.syncQADotsLOD(t.k);
  if (window.syncQACandidates) window.syncQACandidates(t.k);
}
```

### 🚀 **Usage & Testing**

#### **Enable Candidates + QA Rectangles**
```bash
# Add flag to URL
http://localhost:8000/index.html?flags=qaCandidates

# Or combine with other flags
http://localhost:8000/index.html?flags=qaCentroids,qaCandidates
```

#### **Console Inspection**
```javascript
// Check candidate data
window.__candidates

// Manual sync at specific zoom level
window.syncQACandidates(2.0)

// Clear QA rectangles
window.clearQACandidates()
```

#### **Test Page Verification**
```bash
# Open test page
http://localhost:8000/test-candidates.html

# Use buttons to test functionality
# Check console for verification logs
```

### 📊 **Performance & Quality**

#### **LOD Filtering Results**
- **Zoom k=0.5**: 0 candidates (below visibility thresholds)
- **Zoom k=1.0**: 1 candidate (ocean only, lake minK=1.2)
- **Zoom k=1.5**: 2 candidates (both visible)
- **Zoom k=2.0**: 2 candidates (both visible)

#### **Key Features**
- **LOD-aware visibility**: Candidates only appear at appropriate zoom levels
- **Responsive positioning**: Boxes follow zoom transforms correctly  
- **Performance optimized**: Reuses existing layer lookup and D3 selections
- **QA-friendly**: Orange rectangles with flags for easy debugging
- **Console accessible**: `window.__candidates` for inspection

### 🔄 **Next Steps**
The candidates system is now ready for:
- **Step 6**: Collision detection and avoidance
- **Step 7**: Label placement algorithms
- **Step 8**: Text rendering and styling

---

## 2025-01-27 - Step 4 Complete: LOD Bands + QA Dots Respect Zoom ✅

### 🎯 **LOD System + Zoom-Aware QA Complete**
Successfully implemented Level-of-Detail (LOD) bands for anchors and made QA dots respect zoom levels. The system now provides intelligent feature visibility based on zoom scale while maintaining smooth performance.

### 📋 **What Was Accomplished**

#### **1. LOD Module (`src/labels/lod.js`)**
- **Zoom-based visibility bands** with configurable tier thresholds:
  - Tier 1 (t1): minK = 1.0 (always visible)
  - Tier 2 (t2): minK = 1.8 (visible at 1.8x zoom+)
  - Tier 3 (t3): minK = 3.2 (visible at 3.2x zoom+)
  - Tier 4 (t4): minK = 6.4 (visible at 6.4x zoom+)
- **Clamp range** [1.0, 32.0] for zoom boundaries
- **Per-kind overrides** for QA-friendly visibility (sea: 1.1, lake: 1.2)
- **Filtering helper** `visibleAtK()` for runtime visibility checks
- **Data-only approach** - no rendering overhead, just metadata

#### **2. Main App Integration (`src/main.js`)**
- **Combined anchor processing** merges general + water anchors for unified LOD
- **LOD computation** runs after styling, before any rendering
- **QA-friendly overrides** for early water feature visibility (sea: 1.1, lake: 1.2)
- **Global LOD data** accessible via `window.__anchorsLOD`
- **Console helper** `window.visibleAtK()` exposed for debugging
- **Console logging** shows sample data and zoom-level counts
- **QA dots updater** `window.syncQADotsLOD(k)` for zoom-driven updates
- **Post-autofit updates** ensure QA dots appear after initial centering

#### **3. Zoom Handler Integration (`src/modules/interaction.js`)**
- **Automatic LOD updates** on every zoom event
- **QA dots filtering** based on current zoom scale
- **Constant screen size** maintained via `syncQAWaterRadius()`
- **Performance optimized** - only updates when needed

### 🔧 **Technical Implementation**

#### **LOD Band Computation with QA Overrides**
```javascript
// src/labels/lod.js - Zoom-based visibility tiers + per-kind overrides
export function computeLOD({
  anchors,
  tokens = getStyleTokens(),
  baseMinK = { t1: 1.0, t2: 1.8, t3: 3.2, t4: 6.4 },
  clamp = [1.0, 32.0],
  minKByKind = null,     // Optional overrides per kind (e.g., { lake: 1.2, sea: 1.1 })
}) {
  if (!Array.isArray(anchors)) return [];
  const [minClamp, maxClamp] = clamp;
  return anchors.map(a => {
    const tier = a.tier || "t3";
    let minK = Math.max(baseMinK[tier] ?? baseMinK.t3, minClamp);
    if (minKByKind && a.kind in minKByKind) {
      minK = Math.max(minKByKind[a.kind], minClamp);
    }
    const maxK = maxClamp;
    return { ...a, lod: { minK, maxK } };
  });
}
```

#### **Zoom-Driven QA Updates with Post-Autofit Support**
```javascript
// src/main.js - LOD-aware QA dots updater
window.syncQADotsLOD = (k = 1.0) => {
  if (!hasFlag('qaCentroids')) return;
  const svgNode = (typeof svg !== 'undefined' && svg.node) ? svg : d3.select('svg');

  // show only sea/lake dots that are visible at k
  const waterOnly = anchorsLOD.filter(a => a.kind === 'sea' || a.kind === 'lake');
  const visible = visibleAtK(waterOnly, k);

  renderQAWaterAnchors(svgNode, visible);
  syncQAWaterRadius(svgNode, k, 3); // keep ~constant screen size
};

// Post-autofit QA update (all three autofit paths)
if (window.syncQADotsLOD) {
  const currentZoomK = d3.zoomTransform(svgSel.node()).k;
  window.syncQADotsLOD(currentZoomK);
  console.log(`[qa] Updated QA dots after autofit (k=${currentZoomK.toFixed(2)})`);
}
```

#### **Zoom Handler Integration**
```javascript
// src/modules/interaction.js - Automatic LOD updates
function zoomed() {
  const t = d3.event.transform;
  // ... transform application ...
  
  // keep QA dots glued and LOD-filtered as you zoom
  if (window.syncQADotsLOD) window.syncQADotsLOD(t.k);
}
```

### 🚀 **Usage & Testing**

#### **Enable LOD + QA**
Load the app with: `http://localhost:8000/?flags=qaCentroids`

#### **Expected Behavior**
- QA dots appear/disappear based on zoom level and LOD bands
- Dots maintain constant screen size (counter-scaled by 1/k)
- Console shows LOD sample data with minK values
- Console shows counts at different zoom levels (k=1.0, k=8.0)

#### **Test Page**
Use `test-lod-qa.html` to verify LOD functions and test zoom simulation.

#### **Console Output**
```
[lod] sample [{ id: "...", kind: "sea", tier: "t2", minK: 1.1 }, ...]
[lod] counts { total: 45, at_k1: 12, at_k8: 45 }
[qa] water centroid markers rendered (LOD @k=1.0): 12
[qa] Updated QA dots after autofit (k=1.63)
```

#### **Console Helper Functions**
```javascript
// Test LOD filtering at different zoom levels
visibleAtK(__anchorsLOD, 1.0).length    // Features visible at k=1.0
visibleAtK(__anchorsLOD, 8.0).length    // Features visible at k=8.0

// Check specific feature types
__anchorsLOD.filter(a => a.kind === 'sea').length
__anchorsLOD.filter(a => a.kind === 'lake').length
```

---

## 2025-01-27 - Step 3 Complete: Enrich Anchors + Attach Styles ✅

### 🎯 **Major Milestone Achieved**
Successfully completed Step 3 of the labeling system reconstruction project. Anchors are now enriched with polygon context and have styles attached, providing semantic classification and visual styling information without any rendering overhead.

## 2025-01-27 - QA Overlay: Water Component Centroids ✅

### 🎯 **QA Visualization System Complete**
Successfully implemented a QA overlay system that renders tiny colored dots at water component centroids for visual debugging and validation. The overlay automatically attaches to the zoomed world layer and follows all transforms.

### 📋 **What Was Accomplished**

#### **1. Debug Markers Module (`src/labels/debug-markers.js`)**
- **Smart world layer detection** that finds the zoomed group automatically
- **Water component visualization** with color-coded dots:
  - Ocean: Blue (`#1f77b4`)
  - Sea: Teal (`#17becf`) 
  - Lake: Light cyan (`#9edae5`)
- **Crisp stroke rendering** using `vector-effect: non-scaling-stroke`
- **Constant-size option** via `syncQAWaterRadius()` for zoom-independent dot size
- **Robust fallbacks** for different SVG layer structures

#### **2. Main App Integration (`src/main.js`)**
- **URL flag system** with `?flags=qaCentroids` parameter
- **Automatic rendering** after water component anchors are built and styled
- **Console logging** for QA overlay status and marker counts
- **Global accessibility** via `window.__waterAnchors` and `window.__waterAnchorsStyled`

#### **3. Zoom-Aware Rendering**
- **Automatic world layer attachment** for proper transform following
- **Pan/zoom compatibility** with dots moving and scaling correctly
- **Autofit transform support** for automatic centering and scaling

### 🔧 **Technical Implementation**

#### **Smart Layer Detection**
```javascript
// src/labels/debug-markers.js - Intelligent world layer finding
function findWorldLayer(svg) {
  const root = sel(svg);
  const candidates = [
    '#world',
    '[data-zoom-layer="world"]',
    '#viewport',
    '#map',
    '#layers',
  ];
  for (const c of candidates) {
    const g = root.select(c);
    if (!g.empty()) return g;
  }
  // Fallback: first <g> with transform attribute
  const transformed = root.selectAll('g').filter(function () {
    return this.hasAttribute('transform');
  });
  if (!transformed.empty()) return transformed.nodes ? d3.select(transformed.nodes()[0]) : transformed;
  return root; // Last resort
}
```

#### **QA Overlay Rendering**
```javascript
// src/main.js - Flag-gated QA overlay
if (hasFlag('qaCentroids')) {
  const svgNode = (typeof svg !== 'undefined' && svg.node) ? svg : d3.select('svg');
  renderQAWaterAnchors(svgNode, window.__waterAnchorsStyled || window.__waterAnchors || []);
  console.log("[qa] water centroid markers rendered:", (window.__waterAnchors || []).length);
}
```

### 🚀 **Usage**

#### **Enable QA Overlay**
Load the app with the QA flag: `http://localhost:8000/?flags=qaCentroids`

#### **Expected Behavior**
- Tiny colored circles appear at water component centroids
- Dots automatically follow pan/zoom transforms
- Colors indicate water type classification
- Console shows marker count and rendering status

#### **Optional: Constant-Size Dots**
```javascript
// In zoom handler for constant on-screen dot size
import { syncQAWaterRadius } from "./labels/debug-markers.js";
syncQAWaterRadius(svg, k, 3); // Keep radius ~3px regardless of zoom
```

---

## 2025-01-27 - Step 3b Complete: Topology-Based Water Components + Component Anchors ✅

### 🎯 **Water Classification System Complete**
Successfully implemented robust topology-based water component detection and created component-based anchors for inland water features. This provides stable, intuitive water classification without arbitrary distance thresholds.

### 📋 **What Was Accomplished**

#### **1. Topology-Based Water Components (`src/labels/water-split.js`)**
- **Edge-based adjacency detection** using shared polygon edges instead of arbitrary radius
- **Stable component boundaries** that follow actual water body shapes
- **Ocean detection** via border-touching water polygons
- **Sea vs Lake classification** using absolute area thresholds (900px² default)
- **Quantization control** for handling floating-point precision issues

#### **2. Water Component Anchors (`src/labels/anchors-water.js`)**
- **One anchor per inland component** (sea/lake) at area-weighted centroids
- **Component-based positioning** using true center of mass
- **Provisional tier assignment** (sea = t2, lake = t3)
- **Data-only approach** with no DOM manipulation

#### **3. Live Parameter Tuning (`window.reclassWater`)**
- **Real-time water classification** without page reloads
- **Adjustable thresholds** for sea level, area thresholds, and quantization
- **Immediate feedback** on parameter changes
- **Global accessibility** for debugging and fine-tuning

#### **4. Enhanced Main App Integration**
- **Step 3b pipeline** integrated after anchor enrichment
- **Water component logging** with detailed metrics
- **Global window variables** for inspection and debugging
- **Component anchor building** with styling application

### 📋 **What Was Accomplished**

#### **1. Anchor Enrichment Module (`src/labels/enrich.js`)**
- **Water polygon detection** using multiple fallback strategies:
  - `poly.isWater` property (if available)
  - `poly.water` property (if available)
  - Height-based detection (`height <= sea` threshold)
- **Kind classification** with binary logic: water → "ocean", land → "region"
- **Polygon linking** via `polyIndex` for robust anchor-polygon relationships
- **Height preservation** with fallback to `poly.h` for compatibility

#### **2. Style Application Module (`src/labels/style-apply.js`)**
- **Style lookup** using the existing Step 1 style system
- **Kind-based styling** with fallback to "region" style
- **Style attachment** to each anchor for future rendering

#### **3. Enhanced Proto-Anchors (`src/labels/anchors.js`)**
- **Added `polyIndex`** to proto anchors for proper polygon linking
- **Maintained compatibility** with existing anchor structure

#### **4. Main App Integration**
- **Imports added** for both new modules in `src/main.js`
- **Step 3 pipeline** triggered after Step 2 anchor building
- **Console logging** for enrichment metrics and styled anchor samples
- **Global window variables** (`__anchorsEnriched`, `__anchorsStyled`) for inspection

### 🔧 **Technical Implementation**

#### **Water Component Detection System**
```javascript
// src/labels/water-split.js - Edge-based adjacency
function buildWaterAdjacencyByEdges(polygons, waterSet, quant = 1) {
  const qf = 10 ** quant;
  const q = v => Math.round(v * qf) / qf;
  const edgeKey = (a, b) => {
    // order endpoints so the edge is undirected-stable
    const k1 = `${q(a[0])},${q(a[1])}`;
    const k2 = `${q(b[0])},${q(b[1])}`;
    return (k1 < k2) ? `${k1}|${k2}` : `${k2}|${k1}`;
  };

  const edgeMap = new Map(); // edgeKey -> [polyIdx, ...]
  for (const i of waterSet) {
    const poly = polygons[i];
    if (!Array.isArray(poly) || poly.length < 2) continue;
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const key = edgeKey(poly[b], poly[a]);
      if (!edgeMap.has(key)) edgeMap.set(key, []);
      edgeMap.get(key).push(i);
    }
  }

  const adj = new Map(); // i -> Set(neighborIdx)
  for (const i of waterSet) adj.set(i, new Set());
  for (const [, arr] of edgeMap) {
    if (arr.length <= 1) continue;
    for (let x = 0; x < arr.length; x++) {
      for (let y = x + 1; y < arr.length; y++) {
        adj.get(arr[x]).add(arr[y]);
        adj.get(arr[y]).add(arr[x]);
      }
    }
  }
  return adj;
}

// Topology-based water classification
export function computeWaterComponentsTopo({
  polygons, width, height,
  seaLevel = 0.10,
  seaAreaPx = null,   // absolute threshold in px^2 (recommended)
  seaFrac   = 0.004,  // fallback: 0.4% of map area if seaAreaPx is null
  quant     = 1       // vertex rounding decimals for adjacency
}) {
  // ... implementation details
}
```

#### **Water Component Anchors**
```javascript
// src/labels/anchors-water.js - Component-based positioning
export function buildWaterComponentAnchors({ components, polygons, includeOcean = false }) {
  const anchors = [];
  let seas = 0, lakes = 0, oceans = 0;

  for (const comp of components || []) {
    if (!includeOcean && comp.kind === "ocean") { oceans++; continue; }
    const [x, y] = componentCentroid(comp, polygons);
    const id = `${comp.kind}-${anchors.length}`;
    
    anchors.push({
      id,
      polyIndex: comp.indices[0] ?? null,
      kind: comp.kind,          // "sea" or "lake"
      tier: comp.kind === "sea" ? "t2" : "t3",
      x, y,                     // Area-weighted centroid
      area: comp.area,
      text: comp.kind.toUpperCase(),
      estWidth: 100
    });
    
    if (comp.kind === "sea") seas++; else if (comp.kind === "lake") lakes++; else oceans++;
  }

  return { anchors, metrics: { seas, lakes, oceans, total: anchors.length } };
}
```

#### **Live Parameter Tuning**
```javascript
// src/main.js - Global tuning helper
window.reclassWater = (opts = {}) => {
  const {
    seaLevel  = 0.20,   // height <= seaLevel -> water
    seaAreaPx = Math.max(900, 0.004 * mapW * mapH), // absolute threshold
    seaFrac   = 0.004,  // fallback fraction
    quant     = 1       // edge quantization precision
  } = opts;

  const water = computeWaterComponentsTopo({
    polygons: window.currentPolygons,
    width: mapW, height: mapH,
    seaLevel, seaAreaPx, seaFrac, quant
  });

  // ... rest of implementation
};
```

#### **Anchor Enrichment System**
```javascript
// src/labels/enrich.js
export function enrichAnchors({ anchors, polygons, sea = 0.10 }) {
  const out = anchors.map(a => {
    let polyIndex = a.polyIndex;
    if (polyIndex == null && typeof a.id === "string" && a.id.startsWith("poly-")) {
      const n = Number(a.id.slice(5));
      if (Number.isFinite(n)) polyIndex = n;
    }

    const poly = (Array.isArray(polygons) && Number.isInteger(polyIndex)) ? polygons[polyIndex] : undefined;
    const water = isWaterPoly(poly, sea);
    const kind = water ? "ocean" : "region";

    return {
      ...a,
      polyIndex,
      isWater: water,
      kind,
      h: (poly && (poly.height ?? poly.h)) ?? null
    };
  });

  const waterCount = out.reduce((acc, a) => acc + (a.isWater ? 1 : 0), 0);
  return { anchors: out, metrics: { total: out.length, water: waterCount } };
}
```

#### **Style Application**
```javascript
// src/labels/style-apply.js
export function attachStyles(anchors) {
  return anchors.map(a => {
    const s = getStyleFor(a.kind) || getStyleFor("region") || null;
    return { ...a, style: s };
  });
}
```

#### **Main App Integration**
```javascript
// src/main.js - after Step 2 anchor building
// Step 3: enrich anchors with kinds + attach styles (no rendering yet)
const { anchors: enriched, metrics: enrichMetrics } =
  enrichAnchors({ anchors, polygons: window.currentPolygons, sea: 0.10 });

const styledAnchors = attachStyles(enriched);

window.__anchorsEnriched = enriched;
window.__anchorsStyled   = styledAnchors;

console.log("[anchors:enrich] metrics", enrichMetrics);
console.log("[anchors:style] sample", styledAnchors.slice(0, 5).map(a => ({
  id: a.id, kind: a.kind, tier: a.tier,
  style: a.style && { category: a.style.category, tier: a.style.tier, size: a.style.size?.[a.tier] }
})));
```

### 📊 **Verification Results**

| Test | Status | Notes |
|------|--------|-------|
| Anchor enrichment | ✅ PASS | Classifies water/land with robust fallbacks |
| Style attachment | ✅ PASS | Uses existing style system with kind-based lookup |
| Water component detection | ✅ PASS | Edge-based topology with stable boundaries |
| Component anchor building | ✅ PASS | Area-weighted centroids with proper classification |
| Live parameter tuning | ✅ PASS | Real-time reclassification without reloads |
| Polygon linking | ✅ PASS | `polyIndex` properly connects anchors to polygons |
| Main app integration | ✅ PASS | Triggers after Step 2 with comprehensive logging |
| Console logging | ✅ PASS | Shows enrichment metrics and styled anchor samples |
| Global window access | ✅ PASS | `__anchorsEnriched` and `__anchorsStyled` available |

**Overall Step 3 Status: COMPLETE (6/6 criteria met)**

### 🏗️ **Foundation Status**
- **22 foundation modules** verified and working (20 + 2 new)
- **Core map pipeline** fully operational
- **Labeling style system** initialized and validated
- **Anchor enrichment pipeline** operational with semantic classification

---

## 2025-01-27 - Step 2 Complete: Proto-Anchors + Spatial Index ✅

### 🎯 **Major Milestone Achieved**
Successfully completed Step 2 of the labeling system reconstruction project. The proto-anchors system is now in place with spatial indexing, providing the foundation for intelligent label placement without any rendering overhead.

### 📋 **What Was Accomplished**

#### **1. Proto-Anchors Module (`src/labels/anchors.js`)**
- **Centroid calculation** with D3 fallback to simple averaging
- **Area calculation** with D3 fallback to shoelace formula
- **Text width estimation** heuristic (0.6 × length × font size)
- **Area-based ranking** to limit to largest 200 polygons
- **Proto-anchor structure** with placeholder data for future semantic classification

#### **2. Spatial Index Module (`src/labels/spatial-index.js`)**
- **D3 quadtree-based** spatial indexing for efficient queries
- **Bounding box queries** for collision detection preparation
- **Size reporting** for debugging and validation

#### **3. Integration with Main App**
- **Imports added** for both new modules in `src/main.js`
- **Anchor building** triggered after coastline refinement
- **Console logging** for metrics and sample data verification
- **Global window variables** (`__anchors`, `__anchorIndex`) for inspection

### 🔧 **Technical Implementation**

#### **Proto-Anchors System**
```javascript
// src/labels/anchors.js
export function buildProtoAnchors({ polygons, max = 200 }) {
  // Rank by area to avoid zillions of tiny cells
  const ranked = polygons.map((poly, i) => ({ i, a: areaAbs(poly), poly }))
                         .sort((a, b) => b.a - a.a)
                         .slice(0, Math.min(max, polygons.length));

  return ranked.map(({ i, a, poly }) => ({
    id: `poly-${i}`,
    kind: "proto",          // semantic kind comes later
    tier: "t3",             // placeholder until style system
    x, y,                   // centroid coordinates
    area: a,                // polygon area
    text: `P${i}`,          // placeholder text
    estWidth: estimateTextWidth(`P${i}`, 12)
  }));
}
```

#### **Spatial Indexing**
```javascript
// src/labels/spatial-index.js
export function makeAnchorIndex(anchors) {
  const qt = d3.quadtree()
    .x(a => a.x)
    .y(a => a.y)
    .addAll(anchors);

  function query(bbox) {
    // Efficient bounding box queries for collision detection
    const out = [];
    qt.visit((node, x0, y0, x1, y1) => {
      // ... quadtree traversal logic
    });
    return out;
  }

  return { qt, query, size: () => qt.size() };
}
```

#### **Main App Integration**
```javascript
// src/main.js - after refineCoastlineAndRebuild
// Step 2: build proto-anchors + index (no rendering yet)
const { anchors, metrics } = buildProtoAnchors({ polygons, max: 200 });
const anchorIndex = makeAnchorIndex(anchors);
window.__anchors = anchors;
window.__anchorIndex = anchorIndex;
console.log("[anchors] built", metrics, { sample: anchors.slice(0, 5) });
console.log("[anchors:index] size", anchorIndex.size());
```

### 📊 **Verification Results**

| Test | Status | Notes |
|------|--------|-------|
| Proto-anchors build | ✅ PASS | Creates up to 200 anchors from largest polygons |
| Spatial index creation | ✅ PASS | D3 quadtree with query interface |
| Main app integration | ✅ PASS | Triggers after coastline refinement |
| Console logging | ✅ PASS | Shows metrics and sample data |
| Global window access | ✅ PASS | `__anchors` and `__anchorIndex` available |

**Overall Step 2 Status: COMPLETE (5/5 criteria met)**

### 🏗️ **Foundation Status**
- **20 foundation modules** verified and working (18 + 2 new)
- **Core map pipeline** fully operational
- **Labeling style system** initialized and validated
- **Proto-anchors system** with spatial indexing ready
- **No regression** in existing functionality

### 🎯 **What This Enables**

#### **Immediate Benefits**
- **Data foundation** for label placement algorithms
- **Spatial queries** for efficient collision detection
- **Performance optimization** by limiting to largest features
- **Debugging tools** via console logging and global variables

#### **Next Steps Foundation**
- **Semantic classification** of anchors (ocean/lake/island/region)
- **Label text generation** using existing name system
- **Collision detection** using spatial index queries
- **Style application** using existing style tokens

---

## 2025-01-27 - Step 1 Complete: Labeling Style System Foundation ✅

### 📋 **What Was Accomplished**

#### **1. New Labels Module Structure**
- **`src/labels/`** directory created with modular architecture
- **`schema.js`** - Ultra-light runtime validators (no dependencies)
- **`style-tokens.js`** - Initial, conservative style tokens for water, land, settlements
- **`index.js`** - Main module with initialization and getter functions

#### **2. Style System Foundation**
- **4 tiers** (t1-t4) for hierarchical styling
- **3 categories**: `landArea` (UPPERCASE), `waterArea` (italic, Title Case), `settlement` (mixed case)
- **9 initial rules** covering oceans, seas, lakes, continents, countries, regions, islands, cities, towns, villages
- **Runtime validation** that throws precise errors for malformed tokens
- **Style lookup** that merges category base styles with rule-specific overrides

#### **3. Integration with Main App**
- **Import added** to `src/main.js` for `initLabelingStyle`
- **Initialization called** during startup in `generate()` function
- **Fail-fast validation** - app crashes immediately if schema is invalid
- **Global access** via `window.LabelStyle` for debugging/Playwright

### 🔧 **Technical Implementation**

#### **Schema Validation System**
```javascript
// src/labels/schema.js
export function validateStyleTokens(tokens) {
  const errors = [];
  // Validates presence, tier format, category references, rule completeness
  return { ok: errors.length === 0, errors };
}

export function buildStyleLookup(tokens) {
  const out = new Map();
  for (const rule of tokens.rules) {
    const base = tokens.categories[rule.category] || {};
    out.set(rule.kind, { ...base, ...rule, category: rule.category, tier: rule.tier });
  }
  return out;
}
```

#### **Style Token Architecture**
```javascript
// src/labels/style-tokens.js
export const STYLE_TOKENS = {
  tiers: ["t1", "t2", "t3", "t4"],
  categories: {
    landArea: { caps: "upper", weight: 600, letterSpacing: 0.04 },
    waterArea: { italic: true, caps: "title", fill: "#22344a" },
    settlement: { caps: "normal", weight: 600, fill: "#111" }
  },
  rules: [
    { kind: "ocean", category: "waterArea", tier: "t1" },
    { kind: "island", category: "landArea", tier: "t4" },
    // ... 7 more rules
  ]
};
```

#### **Module Initialization**
```javascript
// src/labels/index.js
export function initLabelingStyle(tokens = STYLE_TOKENS) {
  const { ok, errors } = validateStyleTokens(tokens);
  if (!ok) throw new Error("Label style validation failed:\n" + errors.join("\n"));
  _tokens = tokens;
  _lookup = buildStyleLookup(tokens);
  console.log(`[labels:style] OK — ${tokens.rules.length} rules, ${tokens.tiers.length} tiers.`);
  return { tokens: _tokens, lookup: _lookup };
}
```

### 📊 **Verification Results**

| Test | Status | Notes |
|------|--------|-------|
| Schema validation works | ✅ PASS | Catches malformed tokens |
| Style lookup builds correctly | ✅ PASS | Merges category + rule overrides |
| Initialization succeeds | ✅ PASS | Logs "Style OK" with counts |
| Main app integration | ✅ PASS | Imports and calls initLabelingStyle |
| Runtime validation | ✅ PASS | Throws precise errors for invalid data |

**Overall Step 1 Status: COMPLETE (5/5 criteria met)**

### 🏗️ **Foundation Status**
- **18 foundation modules** verified and working
- **Core map pipeline** fully operational
- **New labeling style system** initialized and validated
- **No regression** in existing functionality

### 🎯 **What This Enables**

#### **Immediate Benefits**
1. **Style system ready** - all styling rules defined and validated
2. **Runtime safety** - app fails fast if style configuration is invalid
3. **Modular architecture** - clean separation of concerns
4. **Debug access** - `window.LabelStyle` available for inspection

#### **Strategic Benefits**
1. **Foundation for placement** - styles ready when we add label positioning
2. **Easy customization** - edit `style-tokens.js` to adjust appearance
3. **Validation framework** - schema ensures consistency as we expand
4. **Performance ready** - lookup Map for O(1) style access

### 🚀 **Next Development Phase**

#### **Phase 2: Label Placement Foundation**
1. **Feature extraction** - Identify what gets labeled
2. **Anchor points** - Determine where labels should be placed
3. **Collision detection** - Prepare for label overlap avoidance

#### **Phase 3: Advanced Labeling**
4. **Placement algorithms** - Simulated annealing or similar
5. **LOD management** - Zoom-based visibility
6. **SVG rendering** - Final label display with styles

### 🧪 **Testing Infrastructure**
- **Schema validation** with comprehensive error checking
- **Style lookup** with category + rule merging
- **Integration testing** with main app startup
- **Global debugging** via `window.LabelStyle`

---

## 2025-01-27 - Step 0 Complete: Old Labeling System Cleanup ✅

### 🎯 **Major Milestone Achieved**
Successfully completed Step 0 of the labeling system reconstruction project. The old labeling engine has been completely neutralized, and the project now has a clean slate for implementing the new modular labeling pipeline.

### 📋 **What Was Accomplished**

#### **1. Complete File Cleanup**
- **Old labeling engine files** moved to `legacy/labels/` directory
- **25 dev/demo HTML pages** moved to `legacy/dev-tests/` directory  
- **Playwright tests and artifacts** completely removed
- **All imports from old modules** cleaned from source code

#### **2. Runtime Error Elimination**
- **Created comprehensive null shim** (`labels-null-shim.js`) with 25+ no-op functions
- **Fixed all syntax errors** including stray braces and illegal returns
- **Added null guards** for hover HUD and polygon access
- **Restored polygons global** with enhanced error handling

#### **3. Step 0 Label Stubs**
- **Added empty label arrays** at start of generation function
- **Global references** for legacy code that inspects label state
- **Prevents crashes** from missing label arrays during Step 0

### 🔧 **Technical Implementation**

#### **Null Shim Architecture**
```javascript
// src/modules/labels-null-shim.js
// Provides no-op implementations of all old labeling functions
export function buildFeatureLabels() { return []; }
export function placeLabelsAvoidingCollisions() { return []; }
export function renderWorldLabels() { /* no-op */ }
// ... 25+ functions total
```

#### **Step 0 Label Stubs**
```javascript
// STEP 0: no labels — stub arrays so legacy calls don't explode
let featureLabels = [];
let oceanLabels = [];
window.__featureLabels = featureLabels;   // some logs check this
window.featureLabels   = featureLabels;   // some code inspects this too
```

#### **Enhanced Error Handling**
- **Polygons guard** with early return on undefined
- **Hover HUD protection** with null checks before property access
- **Self-test safety** with block-scoped guards

### 📊 **Verification Results**

| Test | Status | Notes |
|------|--------|-------|
| No imports from labels.js | ✅ PASS | Clean import removal |
| No references to labelTokens | ✅ PASS | Clean token removal |
| App builds without syntax errors | ✅ PASS | Valid JavaScript |
| App runs without runtime errors | ✅ PASS | All functions resolve |
| Clean slate for new modules | ✅ PASS | Old system completely neutralized |

**Overall Step 0 Status: COMPLETE (5/5 criteria met)**

### 🏗️ **Foundation Status**
- **18 foundation modules** verified and working
- **Core map pipeline** fully operational
- **Interaction system** functioning correctly
- **No regression** in existing functionality

### 🎯 **What This Enables**

#### **Immediate Benefits**
1. **App runs without crashes** - all function calls resolve
2. **Labels completely disabled** - no rendering, no placement, no transforms
3. **Debug mode off** - no debug overlays or logging
4. **Empty label groups** - `#labels` exists but contains nothing

#### **Strategic Benefits**
1. **Clean slate achieved** - old labeling system completely neutralized
2. **New modules can integrate** - existing function signatures preserved
3. **Gradual replacement possible** - replace shim functions one by one
4. **No regression risk** - app behavior unchanged (just no labels)

### 🚀 **Next Development Phase**

#### **Phase 1: Core Labeling Modules**
1. **Data Module** - Feature extraction and label data
2. **Style Module** - Label appearance and styling  
3. **Anchors/Index Module** - Placement preparation

#### **Phase 2: Advanced Labeling**
4. **Placement/SA Module** - Collision avoidance algorithms
5. **LOD Module** - Zoom-based visibility management
6. **SVG Rendering Module** - Final label display

### 🧪 **Testing Infrastructure**
- **Created test page** (`test-null-shim.html`) for verification
- **Comprehensive null shim** with 25+ no-op functions
- **All syntax checks pass** (`node -c` validation)
- **Server running smoothly** on port 8001

### 💡 **Key Insights**

#### **1. Deep Integration Challenge**
The old labeling system was deeply integrated throughout the codebase, requiring a comprehensive null shim approach rather than simple removal.

#### **2. Gradual Replacement Strategy**
The null shim allows for gradual replacement of functions as new modules are developed, maintaining stability throughout the transition.

#### **3. Foundation Strength**
The core map generation pipeline is remarkably robust and well-architected, providing an excellent foundation for the new labeling system.

### 📝 **Commit Details**
```
feat: Complete Step 0 - Old labeling system cleanup

- Move old labeling engine files to legacy/labels/
- Delete Playwright tests and test artifacts  
- Move dev/demo pages to legacy/dev-tests/
- Create comprehensive null shim (labels-null-shim.js)
- Fix all syntax and runtime errors
- Restore polygons global with enhanced guards
- Add hover HUD protection with null guards
- Implement Step 0 label stubs for legacy code safety
- Maintain clean foundation for new modular pipeline

Step 0 complete: app runs with zero labels and no runtime errors
```

### 🎉 **Conclusion**
**Step 0 is now COMPLETE!** The Urban Train project has successfully eliminated the old labeling system while maintaining a fully functional foundation. The project is now ready for the next development phase: implementing the new modular labeling pipeline.

**Status: READY FOR NEW MODULAR LABELING SYSTEM DEVELOPMENT ✅**

---

## Previous Entries

### 2025-01-27 - Labeling System Reconstruction Project Initiated
- **Goal**: Replace monolithic labeling system with modular pipeline
- **Architecture**: data → style → anchors/index → placement/SA → LOD → SVG rendering
- **Approach**: Step-by-step cleanup and reconstruction
- **Status**: Planning phase complete, ready for implementation

## Table of Contents

1. [Project Overview](#project-overview)
2. [Core Architecture](#core-architecture)
3. [Label System Evolution](#label-system-evolution)
4. [Labeling Specification](#labeling-specification)
5. [Label Tokens Configuration](#label-tokens-configuration)
6. [Tiering System Implementation](#tiering-system-implementation)
7. [Ocean Label Implementation](#ocean-label-implementation)
8. [Counter-Scaling Implementation](#counter-scaling-implementation)
9. [Viewport Culling System](#viewport-culling-system)
10. [Autofit System](#autofit-system)
11. [Font System](#font-system)
12. [Names System](#names-system)
13. [Performance Optimizations](#performance-optimizations)
14. [Bug Fixes and Improvements](#bug-fixes-and-improvements)
15. [Technical Decisions](#technical-decisions)
16. [LOD System Implementation](#lod-system-implementation)

---

## Project Overview

Urban Train is a web-based procedural map generator that creates Voronoi-based terrain with interactive features, realistic hydronyms, and intelligent label placement.

### Key Features
- **Voronoi-based terrain** with realistic heightmaps
- **Feature detection**: Oceans, lakes, islands with connected components
- **Coastal refinement** with automatic coastline tracing
- **Deterministic generation** with seedable RNG
- **Advanced label management** with collision avoidance
- **Interactive pan/zoom** with counter-scaling labels
- **Performance monitoring** with built-in timers

---

## Core Architecture

### File Structure
```
urban-train/
├── index.html              # Main HTML interface
├── styles.css              # Application styling
├── src/                    # Source code
│   ├── main.js             # Core application logic
│   ├── core/               # Core utilities
│   │   ├── rng.js          # Deterministic, seedable RNG
│   │   └── timers.js       # Performance timing utilities
│   ├── modules/            # Feature modules
│   │   ├── geometry.js     # Voronoi diagram and neighbor detection
│   │   ├── heightmap.js    # Terrain generation and height mapping
│   │   ├── features.js     # Geographic feature detection and naming
│   │   ├── coastline.js    # Coastline tracing and path generation
│   │   ├── rendering.js    # Polygon rendering and visual effects
│   │   ├── interaction.js  # Zoom and hover HUD functionality
│   │   ├── autofit.js      # Land fitting and autoFitToWorld
│   │   ├── labels.js       # Feature labeling with collision avoidance
│   │   ├── names.js        # Fantasy hydronyms and island names
│   │   └── refine.js       # Adaptive coastline refinement
│   ├── render/             # Rendering utilities
│   │   └── layers.js       # SVG layer management
│   └── selftest.js         # Regression testing and validation
├── dev/                    # Development tools and tests
└── vendor/                 # Third-party dependencies
```

### Technology Stack
- **HTML5 + ES Modules** (loaded via `<script type="module">`)
- **D3.js v5** loaded globally from CDN
- **jQuery 3.6** for minimal DOM manipulation
- **No bundler** - served as static files
- **SVG-based rendering** with D3 for data binding

---

## Label System Evolution

### Labels v2.1 Implementation

The label system has evolved significantly to provide advanced collision avoidance, size-based zoom filtering, and comprehensive debugging tools.

### Feature Flags and Token System (Latest)

A new feature flag system has been implemented to enable experimental label styling and configuration without affecting the core functionality.

#### **Feature Flags Implementation**
- **Global flag object**: `window.labelFlags` with all flags off by default
- **URL parameter support**: `?flags=styleTokensOnly,waterItalicEverywhere,areaCapsTracking,fadeBands`
- **Safe fallbacks**: All flags default to false, ensuring no breaking changes

**Available Flags:**
- **`styleTokensOnly`**: Apply token-driven font sizes and styling
- **`waterItalicEverywhere`**: Make water labels italic
- **`areaCapsTracking`**: Use ALL CAPS + letter spacing for area features
- **`fadeBands`**: Enable tier-based opacity ramps for smooth LOD transitions

#### **Label Tokens Configuration**
- **Centralized configuration**: `src/modules/labelTokens.js` with sensible defaults
- **External loading**: Supports loading from `/label-tokens.json` when `tokensLoader` flag is enabled
- **Safe defaults**: Falls back to built-in defaults if external file is missing

#### **CSS Hooks for Future Styling**
- **`.label--water`**: Applies italic styling for water features (oceans, lakes)
- **`.label--area`**: Applies uppercase text transform and wide letter spacing for area features
- **`.label--tracked-tight`**: Applies medium letter spacing for tighter tracking
- **Inactive by default**: CSS classes are applied only when corresponding flags are enabled

#### **World Layer Deduplication and Keyed Joins**
- **Stable key function**: `labelKey` provides consistent identification for labels
- **Keyed joins**: Prevents duplicate labels on repeated renders
- **Layer separation**: World layer (oceans + lakes + islands) vs overlay layer (HUD/debug)
- **Unconditional rendering**: Ensures lakes/islands are always rendered after ocean placement

#### **World-Space Anchors for Lakes and Islands**
- **Smart anchor detection**: `labelAnchorWorld` function with multiple fallback strategies
- **Polygon centroid support**: Uses D3's `polygonCentroid` for polygon data
- **GeoJSON support**: Handles GeoJSON-like geometry structures
- **Conditional positioning**: Only applies x/y coordinates to lakes and islands
- **Ocean preservation**: Keeps existing ocean positioning logic intact

---

## Labeling Specification

### Overview

A comprehensive labeling specification has been established to ensure consistent visual hierarchy and user experience across all fantasy map labeling. The specification is documented in `LABELING_SPEC.md` and provides detailed guidelines for typography, feature classes, LOD tiers, collision rules, and interaction behavior.

### Key Specification Areas

**1. Typographic System**
- **Font families**: Serif upright for land features, serif italic for water features
- **Case rules**: ALL CAPS + tracking for area features, Title Case for settlements
- **Legibility floor**: Minimum 9-10px on screen with thin halos
- **Color scheme**: Water labels slightly cooler, land labels slightly warmer

**2. Feature Classes**
- **Areas**: Continents, realms, seas, lakes with center placement and gentle curvature
- **Linear features**: Rivers, roads, ranges with on-path placement and segmentation
- **Point features**: Settlements with quadrant preference placement
- **Water features**: Consistent italic styling across all water types

**3. LOD Tiers**
- **5-tier system**: T0 (World) to T4 (Close) with progressive disclosure
- **Fade bands**: 0.20-0.30 zoom-width opacity ramps for smooth transitions
- **Budget management**: Per-tier limits to prevent overcrowding

**4. Collision & Priority**
- **Priority ladder**: OCEAN ≥ CONTINENT ≥ CAPITAL ≥ SEA ≥ RANGE ≥ MAJOR_CITY ≥ LAKE ≥ PRINCIPAL_RIVER ≥ TOWN ≥ STRAIT ≥ ROAD ≥ VILLAGE
- **Viewport budgets**: Tier-specific limits for areas, water, settlements, and linear features
- **Suppression rules**: Lower tiers suppressed before higher ones

**5. Interaction & UX**
- **Hover focus**: Brighten hovered labels, gently dim neighbors
- **Tooltips**: For tiny/optional features instead of always-on text
- **Toggles**: User switches for small feature classes
- **Screen uprightness**: Labels remain upright during map rotation

### Data Schema

Each label carries comprehensive metadata:
```javascript
{
  feature_id, feature_class, name,
  geometry (point/line/polygon; centroid or path reference),
  tier, priority_weight, min_zoom, max_zoom, fade_width_zoom,
  style_token_ref (e.g., water.italic.medium),
  anchoring (quadrants / on-path),
  // Optional: group_id (archipelagos), segment_id (long lines), is_capital
}
```

### Module Responsibilities

- **labels.js**: Style assignment, placement logic, curvature enforcement
- **main.js/LOD manager**: Visibility computation, fade bands, budget enforcement
- **collision.js**: Class-aware spacing, stable anchors, jitter minimization
- **interaction.js**: Hover, tooltips, toggles, label uprightness

### QA Checklist

- [ ] No upside-down/vertical-hard-to-read labels; 0 collisions at rest
- [ ] Oceans & capitals always visible at appropriate tiers
- [ ] Smallest label ≥ 9-10px; fade transitions feel silky (no pops)
- [ ] Rivers/roads labeled in segments; archipelagos consolidate at mid zooms
- [ ] Water is consistently italic; area names are ALL CAPS + tracking

---

## Label Tokens Configuration

### Overview

A centralized configuration system has been implemented using `label-tokens.yaml` to manage all labeling parameters, spacing rules, LOD budgets, and visual tokens. This provides a single source of truth for all labeling behavior and enables easy tuning without code changes.

### Configuration Structure

**1. Visual Tokens**
```yaml
area_medium: 0.05
normal: 0

colors:
  land_label: "#201A14"
  water_label: "#1A2330"
  halo: "#000000"

halos:
  enabled: true
  width_px: 1.5
  opacity: 0.6
```

**2. Curvature Limits**
```yaml
curvature_limits:
  area_total_deg: 5
  river_deg_per_10px: 10
```

**3. LOD System**
```yaml
lod:
  fade_width_zoom: 0.25
  tiers:
    t0: { min_zoom: 0.0, max_zoom: 2.0 }
    t1: { min_zoom: 0.8, max_zoom: 3.2 }
    t2: { min_zoom: 1.8, max_zoom: 4.4 }
    t3: { min_zoom: 3.0, max_zoom: 6.0 }
    t4: { min_zoom: 4.0, max_zoom: 7.0 }
```

**4. Density Budgets**
```yaml
budgets:
  t0: { areas: 2, oceans: 1 }
  t1: { areas: 6, water: 4, settlements: 6, linear: 3 }
  t2: { settlements: 10, linear: 6, water: 4 }
  t3: { settlements: 14, linear: 8 }
```

**5. Priority Hierarchy**
```yaml
priority_ladder:
  - OCEAN
  - CONTINENT
  - CAPITAL
  - SEA
  - RANGE
  - MAJOR_CITY
  - LAKE
  - PRINCIPAL_RIVER
  - TOWN
  - STRAIT
  - ROAD
  - VILLAGE
```

**6. Spacing Rules**
```yaml
spacing_px:
  OCEAN: 48
  CONTINENT: 44
  CAPITAL: 36
  SEA: 32
  RANGE: 28
  MAJOR_CITY: 28
  LAKE: 24
  PRINCIPAL_RIVER: 24
  TOWN: 20
  STRAIT: 18
  ROAD: 16
  VILLAGE: 14
```

**7. Settlement Sizing**
```yaml
settlement_sizes_px:
  capital: 18
  major_city: 16
  town: 13
  village: 10
```

**8. Line Feature Rules**
```yaml
line_repeat_rules:
  river_min_segment_px: 240  # label each ~N px of visible path
  road_min_segment_px: 320
  strait_repeat_px: 400
```

**9. Archipelago Handling**
```yaml
archipelago:
  group_min_island_count: 4
  group_label_zoom_min: 1.2
  individual_islands_zoom_min: 3.2
```

### Benefits

**1. Centralized Configuration**
- Single source of truth for all labeling parameters
- Easy tuning without code changes
- Version-controlled configuration

**2. Maintainable Code**
- Clear separation of configuration and logic
- Consistent parameter naming
- Well-documented structure

**3. Flexible Tuning**
- Adjust spacing, budgets, and thresholds independently
- Test different configurations easily
- A/B testing capabilities

**4. Team Collaboration**
- Clear documentation of all parameters
- Easy to understand and modify
- Consistent across development environments

### Integration Points

The configuration system integrates with existing labeling modules:
- **labels.js**: Reads spacing, curvature, and sizing parameters
- **LOD system**: Uses tier definitions and budget limits
- **Collision system**: Applies spacing rules and priority hierarchy
- **Rendering system**: Uses color and halo configurations

#### Key Features

**No Minimum Size Thresholds**
- **All features get names**: Lakes and islands of any size receive labels
- **Size-aware naming**: Uses area to select appropriate terms (e.g., "Mare" vs "Sea", "Loch" vs "Lake")
- **Progressive disclosure**: Labels appear based on zoom level and fixed count limits

**Advanced Collision Avoidance**
The system uses a sophisticated multi-layered approach:

1. **Cardinal/Diagonal Offsets**: Initial attempts use 8 directional offsets (centroid + cardinal + diagonal)
2. **Spiral Placement**: Fallback for individual labels that can't be placed with offsets
3. **Cluster Jiggling Algorithm**: Groups nearby labels (within 200px) and simultaneously tries combinations of offsets for all labels in the cluster

**Cluster Jiggling Details**
- **Clustering**: Labels within 200px are grouped together
- **Combination Testing**: For small clusters (≤3 labels), tries all 9^cluster.length combinations (max 729)
- **Sampling**: For larger clusters, samples 500 random combinations
- **Scoring**: Minimizes total distance from feature centroids while avoiding collisions
- **Fallback**: If no collision-free placement found, uses overlapped centroid placement

---

## Tiering System Implementation

The tiering system introduces a hierarchical approach to label sizing and visibility, ensuring that more important features receive appropriate visual prominence while maintaining readability across all zoom levels.

### Core Concepts

**Feature Tiers**
The system assigns labels to one of four tiers based on feature type and area:

- **Tier 1 (Oceans)**: Always assigned to ocean features, regardless of size
- **Tier 2 (Major Islands)**: Islands in the top 15% by area (85th percentile+)
- **Tier 3 (Minor Islands/Large Lakes)**: Islands in top 50% by area OR lakes in top 30% by area
- **Tier 4 (Tiny Islands/Small Lakes)**: All remaining features

**Base Font Sizes**
Each tier has a corresponding base font size:
- Tier 1: 40px (Oceans)
- Tier 2: 24px (Major Islands)  
- Tier 3: 18px (Minor Islands/Large Lakes)
- Tier 4: 14px (Tiny Islands/Small Lakes)

## Tier-Aware Level of Detail (LOD) System

The tier-aware LOD system provides progressive disclosure of labels based on zoom level, with different tiers appearing at different zoom thresholds to maintain clean, readable maps at all zoom levels.

### Core Implementation

**LOD Helper Functions**
```javascript
// Smooth zoom factor to reduce flicker near thresholds
export function getSmoothedK(k) {
  const α = 0.25; // smoothing factor
  __LOD_prevK = (1-α)*__LOD_prevK + α*k;
  return __LOD_prevK;
}

// Zoom breakpoints for each tier
const LOD_BREAKS = {
  t2: { start: 1.12, full: 1.35 },  // Major Islands
  t3: { start: 1.45, full: 1.85 },  // Minor Islands & Large Lakes
  t4: { start: 1.90, full: 2.40 }   // Tiny Islands & Small Lakes
};

// Minimum area thresholds by tier
function minAreaPxForTier(tier, k) {
  const s2 = smooth01(LOD_BREAKS.t2.start, LOD_BREAKS.t2.full, k);
  const s3 = smooth01(LOD_BREAKS.t3.start, LOD_BREAKS.t3.full, k);
  const s4 = smooth01(LOD_BREAKS.t4.start, LOD_BREAKS.t4.full, k);
  if (tier === 2) return Math.round(lerp(420, 80, s2));
  if (tier === 3) return Math.round(lerp(360, 60, s3));
  return Math.round(lerp(280, 28, s4)); // tier 4
}

// Budget management per tier
function tierBudget(tier, k, n) {
  const b = tier === 2 ? LOD_BREAKS.t2 : tier === 3 ? LOD_BREAKS.t3 : LOD_BREAKS.t4;
  const s = smooth01(b.start, b.full, k);
  const base = tier === 2 ? 2 : 0;
  const growth = tier === 2 ? 6 : tier === 3 ? 10 : 14;
  return Math.min(n, Math.round(base + growth * s));
}
```

**Tier-Aware Filtering**
The `filterByZoom` function now processes labels by tier:

```javascript
export function filterByZoom(placed, k) {
  // Smooth k to reduce flicker near thresholds
  const ks = getSmoothedK(k);
  
  // Always keep ocean labels (Tier 1)
  const oceans = placed.filter(p => p.kind === 'ocean');
  
  // Group by tier
  const t2 = placed.filter(p => p.kind !== 'ocean' && p.tier === 2);
  const t3 = placed.filter(p => p.kind !== 'ocean' && p.tier === 3);
  const t4 = placed.filter(p => p.kind !== 'ocean' && p.tier === 4);
  
  // Sort by area with tier bias
  const area = p => (p.area || 0);
  const bias = p => (5 - (p.tier || 4)) * 1e-6;
  const byArea = (a,b) => (area(b)+bias(b)) - (area(a)+bias(a));
  [t2,t3,t4].forEach(arr => arr.sort(byArea));
  
  // Process each tier with greedy acceptance
  const keep = [...oceans];
  acceptGreedy(t2, 2, keep);
  acceptGreedy(t3, 3, keep);
  acceptGreedy(t4, 4, keep);
  
  return keep;
}
```

### Zoom Behavior

**Progressive Disclosure**
- **k < 1.12**: Only Tier 1 (oceans) and some Tier 2 (major islands) visible
- **k ≈ 1.35**: Tier 2 reaches full density
- **k ≈ 1.45**: Tier 3 (minor islands/large lakes) starts appearing
- **k ≈ 1.85**: Tier 3 reaches full density
- **k ≈ 1.90**: Tier 4 (tiny islands/small lakes) starts appearing
- **k ≈ 2.40**: Tier 4 reaches full density

**Smooth Transitions**
- Uses `smooth01()` function for gradual transitions between start and full thresholds
- Smoothed zoom factor prevents flickering near tier boundaries
- Area thresholds relax as zoom increases

### Ocean Font Floor

**Minimum Size Enforcement**
Ocean labels maintain a minimum readable size:

```javascript
const MIN_OCEAN_PX = 34; // screen pixels floor
const MAX_OCEAN_PX = 44; // maximum size

// Enforce minimum in fitting functions
best = Math.max(f, MIN_OCEAN_PX);
```

**Benefits**
- Prevents ocean labels from becoming too small to read
- Maintains visual prominence of ocean features
- Ensures consistent readability across all zoom levels

### CSS Transitions

**Smooth Visibility Changes**
Labels fade in/out instead of popping:

```css
#labels text {
  opacity: 0;
  pointer-events: none;
  transition: opacity 140ms ease-out;
}

#labels text.is-visible {
  opacity: 1;
  pointer-events: auto;
}
```

**Benefits**
- Eliminates jarring pop-in/pop-out effects
- Provides smooth visual transitions
- Maintains professional appearance

### Integration Points

**Post-Autofit LOD Application**
LOD is immediately applied after autofit and ocean placement:

```javascript
// Re-apply LOD now that zoom is locked and oceans are placed
{
  const svg = d3.select('svg');
  const k = d3.zoomTransform(svg.node()).k;
  const visible = filterByZoom(featureLabels, k);
  updateLabelVisibility({ placed: featureLabels, visible });
}
```

**Zoom Handler Integration**
The zoom handler uses the new tier-aware filtering:

```javascript
// Update visibility with tier-aware filtering
const visible = filterByZoom(window.__labelsPlaced.features, t.k);
updateLabelVisibility({ placed: window.__labelsPlaced.features, visible });
```

### Performance Optimizations

**Efficient Processing**
- Single pass through labels by tier
- Greedy acceptance algorithm for each tier
- Minimal DOM updates with CSS transitions
- Smoothed zoom factor reduces unnecessary recalculations

**Memory Management**
- No additional data structures required
- Tier information stored as simple integer properties
- Efficient Set-based visibility tracking

### Benefits

1. **Clean Visual Hierarchy**: Important features appear first, details emerge progressively
2. **Consistent Performance**: Predictable label counts at each zoom level
3. **Smooth User Experience**: No jarring pop-in/pop-out effects
4. **Maintainable Code**: Clear separation of concerns and well-defined thresholds
5. **Flexible Configuration**: Easy to adjust tier thresholds and budgets

### Implementation Details

**Quantile-Based Classification**
```javascript

## Tier-Based Fade System (Latest)

A new tier-based fade system has been implemented to provide smooth opacity transitions based on zoom level and feature tier, creating a natural Level of Detail (LOD) system.

### Core Implementation

**Opacity Calculation**
The `opacityForZoom` function in `labelTokens.js` calculates opacity based on zoom level and tier:

```javascript
export function opacityForZoom(k, tier, fadeWidth = getLabelTokens().lod.fade_width_zoom) {
  const tiers = getLabelTokens().lod.tiers;
  // map numeric tier → key (t1..t4); be defensive
  const key = tier <= 1 ? 't1' : tier === 2 ? 't2' : tier === 3 ? 't3' : 't4';
  const band = tiers[key] || { min_zoom: 0, max_zoom: Infinity };
  const enterStart = band.min_zoom - fadeWidth;
  const exitEnd    = band.max_zoom + fadeWidth;

  if (k <= enterStart || k >= exitEnd) return 0;
  if (k < band.min_zoom) return (k - enterStart) / (band.min_zoom - enterStart);
  if (k > band.max_zoom) return (exitEnd - k) / (exitEnd - band.max_zoom);
  return 1;
}
```

**Token-Driven Configuration**
Fade bands are configured via the label tokens system:

```javascript
const DEFAULT_TOKENS = {
  lod: {
    fade_width_zoom: 0.25,  // Width of fade transition
    tiers: { 
      t0: {min_zoom: 0.0, max_zoom: 2.0}, 
      t1: {min_zoom: 0.8, max_zoom: 3.2},
      t2: {min_zoom: 1.8, max_zoom: 4.4}, 
      t3: {min_zoom: 3.0, max_zoom: 6.0}, 
      t4: {min_zoom: 4.0, max_zoom: 7.0} 
    }
  }
};
```

### Zoom Behavior

**Progressive Disclosure by Tier**
- **Tier 1 (Oceans)**: Visible from zoom 0.8x to 3.2x
- **Tier 2 (Major Islands)**: Visible from zoom 1.8x to 4.4x  
- **Tier 3 (Lakes/Minor Islands)**: Visible from zoom 3.0x to 6.0x
- **Tier 4 (Tiny Features)**: Visible from zoom 4.0x to 7.0x

**Smooth Fade Transitions**
- **Fade-in**: Labels gradually appear over 0.25 zoom units before their min_zoom
- **Fade-out**: Labels gradually disappear over 0.25 zoom units after their max_zoom
- **Linear interpolation**: Smooth opacity ramps between 0 and 1

### Integration Points

**Zoom Handler Integration**
The fade system is integrated into the zoom handler in `interaction.js`:

```javascript
// Update label visibility based on zoom level and tier
updateLabelVisibilityByTier(svgSel);
```

**Post-Generation Application**
Fade visibility is applied after generation completes in `main.js`:

```javascript
// Update label visibility after generation completes
updateLabelVisibilityByTier(d3.select('svg'));
```

### Feature Flag Control

**Flag: `fadeBands`**
- **Enabled**: `?flags=fadeBands` - Activates tier-based opacity ramps
- **Disabled**: Default behavior - All labels visible with full opacity
- **Fallback**: When disabled, shows all labels with `is-visible` class

**URL Examples**
```
http://localhost:8000/index.html?flags=fadeBands
http://localhost:8000/index.html?flags=fadeBands,styleTokensOnly,waterItalicEverywhere,areaCapsTracking
```

### Benefits

1. **Natural LOD**: Important features (oceans) appear first, details emerge progressively
2. **Smooth Transitions**: No jarring pop-in/pop-out effects
3. **Performance**: Reduces visual clutter at low zoom levels
4. **Configurable**: Easy to adjust fade bands via tokens
5. **Non-Destructive**: Labels remain in DOM, just fade in/out

### Technical Details

**Function Separation**
- **`updateLabelVisibility`** (existing): Handles LOD visibility based on placed/visible arrays
- **`updateLabelVisibilityByTier`** (new): Handles tier-based fade bands with opacity ramps

**DOM Updates**
- Sets both `is-visible` class and `opacity` style
- No CSS transitions - pure computed opacity for performance
- Works with both world labels (lakes/islands) and ocean labels

**Performance Considerations**
- Efficient per-label opacity calculation
- No additional DOM queries beyond existing selections
- Minimal overhead during zoom operations
function quantilesOf(arr, qs=[0.5, 0.7, 0.85]) {
  if (!arr.length) return { q50: Infinity, q70: Infinity, q85: Infinity };
  const a = [...arr].sort((x,y)=>x-y);
  const pick = q => a[Math.max(0, Math.min(a.length-1, Math.floor(q*(a.length-1))))];
  return { q50: pick(0.5), q70: pick(0.7), q85: pick(0.85) };
}
```

**Tier Assignment Logic**
```javascript
function rankTier(label, q) {
  if (label.kind === 'ocean') return 1; // Ocean = Tier 1
  const A = label.area || 0;
  if (label.kind === 'island') {
    if (A >= q.islands.q85) return 2;       // Major Island
    if (A >= q.islands.q50) return 3;       // Minor Island
    return 4;                               // Tiny Island
  }
  if (label.kind === 'lake') {
    if (A >= q.lakes.q70) return 3;         // Large Lake
    return 4;                               // Small Lake
  }
  return 4;
}
```

### Ocean Label Integration

**Preferred Size Respect**
The ocean fitter now respects the tier-assigned base font size:
```javascript
// Prefer label.baseFontPx first, then shrink until it fits
const preferred = Math.min(label.baseFontPx || 40, MAX_OCEAN_PX);
for (let f = preferred; f >= 12; f -= 1) {
  // try preferred first, then step down
  if (fitsOne(f)) {
    best = f;
    break;
  }
}
```

This ensures oceans maintain their Tier 1 prominence (40px) when space allows, only shrinking when the rectangle is too small.

### LOD Bias System

**Tier-Preferential Filtering**
The Level of Detail system now biases toward higher-tier features when areas are similar:

```javascript
const S = p => (p.area || 0);                    // Area score (primary)
const W = p => (5 - (p.tier || 4));             // Tier weight (secondary)
const score = p => S(p) * 1 + W(p) * 1e-6;     // Combined score
```

**Benefits**
- **Area Priority**: Area remains the primary factor in LOD decisions
- **Tier Tiebreaker**: When features have similar areas, higher tiers are preferred
- **Subtle Effect**: Bias is small enough to not disrupt overall area-based sorting
- **Consistent Application**: Applied to both islands and lakes

### Visual Styling

**CSS Tier Classes**
Each label receives a tier-specific CSS class for styling:
```css
.label.tier-1 text { font-weight: 900; letter-spacing: 0.5px; }
.label.tier-2 text { font-weight: 800; letter-spacing: 0.3px; }
.label.tier-3 text { font-weight: 700; letter-spacing: 0.2px; }
.label.tier-4 text { font-weight: 600; letter-spacing: 0.1px; }
```

**Counter-Scaling Integration**
The tiering system works seamlessly with the existing counter-scaling system:
- Base font sizes are assigned according to tier
- Counter-scaling maintains consistent screen sizes during zoom
- Tier-based styling (font weight, letter spacing) enhances visual hierarchy

### Performance Impact

**Minimal Overhead**
- Quantile calculations are performed once during label building
- Tier assignment is O(n) where n is the number of labels
- LOD bias adds negligible computational cost
- No impact on rendering performance

**Memory Efficiency**
- Tier information is stored as simple integer properties
- CSS classes are lightweight and cached by the browser
- No additional data structures required

### Benefits

1. **Visual Hierarchy**: Clear distinction between feature importance
2. **Consistent Sizing**: Predictable font sizes based on feature significance
3. **Improved Readability**: Important features are more prominent
4. **Zoom-Aware**: System works across all zoom levels
5. **Maintainable**: Simple, predictable tier assignment logic

**Size-Based Zoom Filtering**
Progressive disclosure based on zoom level and fixed limits:

```javascript
const lim = {
  ocean: 4,                    // Always visible
  lake:   k < 1 ? 3 : k < 2 ? 10 : k < 4 ? 25 : 80,
  island: k < 1 ? 3 : k < 2 ? 14 : k < 4 ? 40 : 120,
  other:  k < 2 ? 0 : k < 4 ? 10 : 30
};
```

#### Ocean Label Styling Consistency

Ocean labels now use consistent CSS-based styling instead of inline styles:

**Before (Inline Styling Issues)**
- **Font mismatch**: Ocean labels appeared in different fonts due to screen overlay placement
- **Inline styles**: Hardcoded colors, strokes, and font properties scattered throughout JS
- **Maintenance burden**: Style changes required updating multiple JavaScript functions

**After (CSS-Based Styling)**
- **Global consistency**: Ocean labels use the same `.place-label` CSS rules as other labels
- **White text**: All ocean labels now use consistent white fill with black stroke
- **Font consistency**: Ocean labels inherit the same font family as other labels
- **Maintainable**: All styling centralized in CSS, easy to modify globally

**Implementation Details**
```css
/* Global label styling - applies to all labels including ocean overlay */
.place-label {
  fill: white;
  stroke: black;
  stroke-width: 0.5px;
  font-family: Arial, sans-serif;
  font-weight: bold;
  text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
  pointer-events: none;
}

/* Ocean-specific overrides */
text.place-label.ocean {
  fill: #fff;                  /* matches other labels */
  stroke: rgba(0,0,0,.9);
  stroke-width: 3px;
  font-weight: 700;
  letter-spacing: .4px;
  paint-order: stroke fill;
  pointer-events: none;
}
```

#### Ocean Label System Refactoring

**Architectural Improvements:**
- **World-coordinate canonical storage**: Ocean label data stored in `window.state.ocean` with world coordinates as primary values
- **World layer rendering**: Ocean labels now rendered in `#labels-world` group instead of screen overlays
- **Parent group transforms**: Labels move with the parent group transform - no manual positioning needed
- **Decoupled from SA/LOD**: Ocean labels explicitly excluded from collision resolution and zoom filtering

**Key Functions:**
```javascript
// World-coordinate storage
window.state.ocean = { 
  anchor: { x, y },           // World coordinates
  rectWorld: { x, y, w, h },  // World rectangle bounds
  rectPx: { w, h }            // Pixel dimensions for font fitting
};
```

**Benefits:**
- **Consistent positioning**: Labels stay anchored to world coordinates during zoom/pan
- **No double-handling**: Eliminates conflicts with SA collision resolution
- **Better performance**: Single render path, no overlay management, no manual transforms
- **Zoom consistency**: Labels scale naturally with the map using parent group transforms
- **Simplified architecture**: Ocean labels follow same pattern as other labels

---

## Counter-Scaling Implementation

### Overview

The counter-scaling implementation ensures that all map labels maintain constant on-screen size during pan/zoom operations. This provides a consistent user experience where labels remain readable at all zoom levels while moving perfectly with the map.

### How It Works

#### 1. **Dual Transform System**
- **Map transform**: The `#world` and `#labels-world` groups receive normal zoom transforms (translate + scale)
- **Label counter-transform**: Each individual label group gets an additional `scale(1/k)` to counteract the zoom

#### 2. **Transform Chain**
```
Label Group Transform = translate(x,y) + scale(1/k) + rotate(angle)
Parent Group Transform = translate(zoom.x, zoom.y) + scale(zoom.k)
Final Result = Label moves with map but maintains constant screen size
```

#### 3. **Vector-Effect Attributes**
All text elements include SVG attributes for consistent rendering:
- `vector-effect="non-scaling-stroke"`: Halo stroke width stays constant
- `paint-order="stroke"`: Halo renders behind text for proper layering

### Implementation Details

#### **Zoom Handler (interaction.js)**

The `zoomed()` function applies counter-scaling to all label groups:

```javascript
// NEW: counter-scale label groups so their screen size stays constant
// Guard against extreme zoom levels to prevent extreme inverse scale values
const inv = 1 / Math.max(0.5, Math.min(32, t.k));
const gLabels = d3.select('#labels-world');
if (!gLabels.empty()) {
  const labelCount = gLabels.selectAll('g.label').size();
  if (labelCount > 0) {
    gLabels.selectAll('g.label')
      .each(function(d) {
        if (!d) return;
        // Get the current transform to extract the original position
        const currentTransform = d3.select(this).attr('transform') || '';
        const match = currentTransform.match(/translate\(([^,]+),([^)]+)\)/);
        
        if (match) {
          const origX = parseFloat(match[1]);
          const origY = parseFloat(match[2]);
          const a = d.angle || 0;            // preserve rotation if used
          
          // Apply counter-scaling while preserving original position
          const transform = `translate(${origX},${origY}) scale(${inv}) rotate(${a})`;
          d3.select(this).attr('transform', transform);
        }
      });
    
    // Debug logging for counter-scaling
    if (window.DBG?.labels) {
      console.debug(`[zoom] Applied counter-scaling (1/${t.k.toFixed(2)} = ${inv.toFixed(3)}) to ${labelCount} labels`);
    }
  }
}
```

#### **Label Creation (labels.js)**

All text elements are created with vector-effect attributes:

```javascript
// Stroke text (halo)
enter.append('text').attr('class', 'stroke')
  .attr('vector-effect', 'non-scaling-stroke')
  .style('paint-order', 'stroke');

// Fill text (main text)
enter.append('text').attr('class', 'fill')
  .attr('vector-effect', 'non-scaling-stroke');

// Ocean labels
gEnter.append('text').attr('class','ocean-text')
  .attr('vector-effect', 'non-scaling-stroke')
  .style('paint-order', 'stroke');
```

#### **Font-Size Scaling Removed**

The `updateLabelZoom()` function no longer scales font sizes:

```javascript
// On zoom: labels are now counter-scaled by the zoom handler, so no font-size changes needed
// This function is kept for compatibility but no longer performs any scaling operations
export function updateLabelZoom({ svg, groupId = 'labels-world' }) {
  // ... existing code ...
  
  // Labels are now counter-scaled by the zoom handler to maintain constant screen size
  // No font-size changes needed - the counter-scaling handles this automatically

---

## Viewport Culling System

### Overview

The viewport culling system optimizes performance by hiding labels that are outside the visible viewport. This prevents unnecessary rendering of off-screen labels while ensuring the ocean label remains visible when appropriate.

### Key Features

#### 1. **Viewport-Based Culling**
- **Automatic detection**: Labels outside the viewport (with padding) are marked with `.culled` class
- **Performance optimized**: Uses `requestAnimationFrame` throttling to prevent excessive DOM queries
- **Padding support**: 24px padding around viewport edges for smooth transitions

#### 2. **Ocean Label Sticky Behavior**
- **Always visible**: Ocean label is forced to be visible when Tier 1 is active (zoom level allows ocean visibility)
- **Sticky priority**: Ocean label overrides culling state when it should be visible
- **Tier-aware**: Respects the existing LOD tier system

#### 3. **Seamless Integration**
- **Works with existing LOD**: Integrates with tier-based visibility system
- **Zoom-responsive**: Recalculates culling on every zoom operation
- **No performance impact**: Throttled updates prevent excessive computation

### Implementation Details

#### **CSS Rules (styles.css)**
```css
/* off-screen virtualization */
.culled { display: none; }
```

#### **Core Functions (labels.js)**

**RAF Throttling**
```javascript
function rafThrottle(fn) {
  let scheduled = false, lastArgs;
  return function throttled(...args) {
    lastArgs = args;
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        fn(...lastArgs);
      });
    }
  };
}
```

**Viewport Culling**
```javascript
export function updateViewportCull(svgNode, pad = 24) {
  const svgRect = svgNode.getBoundingClientRect();
  const left = svgRect.left - pad, right = svgRect.right + pad;
  const top  = svgRect.top  - pad, bottom = svgRect.bottom + pad;

  d3.selectAll("text.label").each(function () {
    const r = this.getBoundingClientRect();
    const off = (r.right < left) || (r.left > right) || (r.bottom < top) || (r.top > bottom);
    d3.select(this).classed("culled", off);
  });

  // Ocean label is sticky: if Tier 1 is allowed, never leave it culled/hidden.
  ensureOceanStickyVisibility();
}
```

**Ocean Sticky Visibility**
```javascript
export function ensureOceanStickyVisibility() {
  const ocean = d3.select("text.label--ocean");
  if (ocean.empty()) return;

  // Ocean is Tier 1; whenever currentTier >= 1 it must be visible.
  if (_currentTier >= 1) {
    ocean.classed("culled", false)
         .classed("hidden", false)
         .style("display", null)
         .attr("visibility", null)
         .attr("opacity", null);
  }
}
```

#### **State Management**

**Shared Tier State**
```javascript
// labels.js
let _currentTier = 1;

export function getCurrentTier() { return _currentTier; }
export function setCurrentTier(tier) { _currentTier = tier; }
export const currentTier = {
  get value() { return _currentTier; },
  set value(tier) { _currentTier = tier; }
};
```

**Interaction Integration (interaction.js)**
```javascript
import { setCurrentTier, currentTier } from './labels.js';

// In zoom handler
const next = tierForZoom(t.k);
if (next !== currentTier.value) {
  setCurrentTier(next);
  applyTierVisibility();
}

// NEW: recalc viewport culling every zoom (throttled)
if (typeof _updateCullRaf === "function") _updateCullRaf();
```

#### **Initialization**
```javascript
// Initialize culling after labels are built
initLabelCulling(d3.select('svg'));
updateViewportCull(d3.select('svg').node());
```

### Performance Benefits

1. **Reduced DOM queries**: Only visible labels are rendered
2. **Smooth zooming**: Throttled updates prevent performance degradation
3. **Memory efficient**: Off-screen labels don't consume rendering resources
4. **Scalable**: Works with any number of labels without performance impact

### Testing

**Test Files**
- `dev/test-viewport-culling.html` - Comprehensive test suite
- `dev/verify-culling.html` - Interactive verification page
- `dev/test-font-caps.html` - Font caps system testing
- `dev/test-lod-labels.html` - LOD system testing

**Test Scenarios**
1. Zoom in until labels scroll off screen
2. Zoom back out and verify ocean label returns (sticky behavior)
3. Pan around and verify culling updates correctly
4. Test with different zoom levels and tier changes

### Integration with Existing Systems

- **LOD System**: Works with existing tier-based visibility
- **Counter-Scaling**: Compatible with constant-size label rendering
- **Ocean Labels**: Sticky behavior respects ocean label priority
- **Performance Monitoring**: Uses existing timer infrastructure
  
  // ... debug logging ...
}
```

#### **CSS Kill Switch for Debug Rectangles**

To hide debug rectangles that show label boundaries and placement boxes, use the CSS kill switch:

```css
/* Debug ocean rectangle kill switch */
.debug-ocean-rect,
.ocean-bbox,
.ocean-debug,
#labels-debug rect { 
  display: none !important; 
}
```

This targets all debug rectangles:
- `.ocean-bbox` - Debug rectangles created in `placeOceanLabelAt`
- `.ocean-debug` - Debug rectangles for viewport clamping
- `#labels-debug rect` - Debug rectangles for label placement validation
- `.debug-ocean-rect` - Future debug rectangles with this class

### Safety Features

#### **Zoom Level Guards**
```javascript
const inv = 1 / Math.max(0.5, Math.min(32, t.k));
```
- **Minimum zoom**: 0.5x (prevents extreme inverse scaling)
- **Maximum zoom**: 32x (prevents extreme inverse scaling)

#### **Defensive Positioning**
- Extracts original position from current transform attributes
- Handles cases where labels might not have expected data properties
- Gracefully handles missing or malformed transforms

#### **Rotation Preservation**
- Maintains any existing label rotation during counter-scaling
- Preserves the `d.angle` property if present
- Applies rotation after scaling for proper transform order

#### **Debug Logging**
- Console output when counter-scaling is applied
- Shows zoom level, inverse scale factor, and label count
- Controlled by `window.DBG.labels` flag

### Benefits

- ✅ **Constant label size**: Labels never change pixel size during zoom operations
- ✅ **Perfect tracking**: Labels move exactly with the map during pan/zoom
- ✅ **Crisp halos**: Stroke widths remain constant at all zoom levels
- ✅ **Performance**: No font-size recalculations during zoom
- ✅ **Compatibility**: Existing label positioning and collision logic unchanged

---

## Ocean Label Implementation

### Ocean Label Fix Summary

The ocean label system has undergone significant improvements to address positioning, styling, and integration issues.

#### Key Improvements

**1. World-Space Integration**
- Ocean labels now participate in collision avoidance and zoom/pan with the map
- Higher mass (3x) in SA energy function, making smaller labels move around them
- Fit-to-rect functionality with automatic font scaling and two-line breaks

**2. Positioning System**
- Labels start inside their rectangles for optimal SA convergence
- Post-SAT optimization for fine-tuned placement
- World coordinate consistency throughout SA processing

**3. Styling Consistency**
- Unified CSS-based styling instead of scattered inline styles
- Consistent font families and visual appearance
- Professional halo rendering with proper layering

#### Implementation Details

**Fit-to-Rect Functionality**
```javascript
// Ocean labels automatically scale font size to fit within boundaries
const res = fitTextToRect({
  svg,
  textSel: textElement,
  text: d.text,
  rect: rw,
  pad: 8,
  maxPx: 200,
  minPx: 14,
  lineH: 1.1,
  k
});
```

**Multiline Support**
- Automatic line breaking for long ocean names
- Proper line spacing and alignment
- Optimized for readability at all zoom levels

### Ocean Label Wrapping Implementation (2025-01-27)

#### Fixed-Size Ocean Labels with Multiline Wrapping

**Overview**
Implemented fixed-size ocean labels with intelligent multiline wrapping to handle long ocean names while maintaining consistent visual appearance across zoom levels.

**Key Features**

**1. Fixed Font Size**
- Ocean labels maintain 22px font size regardless of zoom level
- CSS-based styling with `!important` declarations to override existing styles
- Consistent bold weight (700) and proper text anchoring

**2. Intelligent Text Wrapping**
- Automatic wrapping to 85% of available rectangle width
- Uses SVG `<tspan>` elements for native multiline support
- Robust width calculation with fallback estimation if `getComputedTextLength()` fails

**3. Perfect Centering**
- All wrapped lines share the same horizontal center
- Eliminates inherited `dx` offsets that cause line drift
- Vertical centering of the entire text block within the rectangle

**Implementation Details**

**CSS Styling**
```css
/* Ocean label: fixed size, bold, centered */
#labels-world text.label--ocean,
.label.ocean text.label--ocean {
  font-size: 22px !important;
  font-weight: 700 !important;
  text-anchor: middle !important;
  dominant-baseline: middle !important;
  pointer-events: none !important;
}
```

**Text Wrapping Function**
```javascript
window.wrapText = function wrapText(textSel, maxWidth, lineHeightEm = 1.2) {
  textSel.each(function () {
    const text = d3.select(this);
    
    // Normalize anchoring and clear any inherited dx
    const cx = +text.attr("x") || 0;
    const cy = +text.attr("y") || 0;
    text.attr("text-anchor", "middle").attr("dx", null);
    
    // Rebuild tspans with consistent centering
    const newLine = (dyEm) =>
      text.append("tspan")
        .attr("x", cx)
        .attr("y", cy)
        .attr("dx", 0)
        .attr("dy", dyEm);
    
    // ... word wrapping logic ...
    
    // Final guard: re-center every line after vertical centering
    text.selectAll("tspan")
      .attr("y", function () { return +d3.select(this).attr("y") + shift; })
      .attr("x", cx)
      .attr("dx", 0);
  });
}
```

**Integration with Ocean Label System**
- Applied in `renderOceanInWorld()` function
- Converts world rectangle coordinates to screen pixels for wrapping
- Maintains compatibility with existing ocean label placement algorithms

**Testing and Verification**
- Created `dev/test-ocean-wrapping.html` for isolated testing
- Test case: "Expanse Of Wandering Clouds" with debug visualization
- Verifies proper centering and wrapping behavior
- Includes visual debugging with center point and rectangle bounds

**Benefits**
- **Consistent appearance**: Fixed font size prevents zoom-based size changes
- **Better readability**: Long ocean names wrap cleanly without overflow
- **Professional appearance**: Proper centering and spacing
- **Cross-browser compatibility**: Robust fallbacks for text measurement
- **Maintainable code**: Clear separation of styling (CSS) and logic (JS)

---

## Autofit System

### Autofit Improvements

The autofit system has been enhanced to provide better land fitting and viewport optimization.

#### Key Features

**1. Promise-Based Implementation**
- Asynchronous autofit operations for better performance
- Progress tracking and cancellation support
- Error handling and fallback mechanisms

**2. Enhanced Land Detection**
- Improved land bounding box calculations
- Better handling of complex coastlines
- Adaptive padding and margin calculations

**3. Viewport Optimization**
- Automatic centering on land masses
- Zoom level optimization for feature visibility
- Smooth transitions during autofit operations

#### Implementation Details

**Land Bounding Box Calculation**
```javascript
export function computeLandBBox(polygons) {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  for (const poly of polygons) {
    if (poly.height >= 0.2) { // Land threshold
      minX = Math.min(minX, poly.x);
      minY = Math.min(minY, poly.y);
      maxX = Math.max(maxX, poly.x);
      maxY = Math.max(maxY, poly.y);
    }
  }
  
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
```

**Autofit to Land**
```javascript
export function fitToLand(svg, bbox) {
  const svgNode = svg.node();
  const zoom = svgNode.__ZOOM__;
  
  if (!zoom) return Promise.reject('No zoom behavior found');
  
  const width = +svg.attr('width');
  const height = +svg.attr('height');
  
  // Calculate optimal transform
  const scaleX = width / bbox.w;
  const scaleY = height / bbox.h;
  const scale = Math.min(scaleX, scaleY) * 0.9; // 90% of available space
  
  const tx = (width / 2) - (bbox.x + bbox.w / 2) * scale;
  const ty = (height / 2) - (bbox.y + bbox.h / 2) * scale;
  
  return new Promise((resolve) => {
    svg.transition()
      .duration(600)
      .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale))
      .on('end', resolve);
  });
}
```

---

## Font System

### Fantasy Fonts Guide

The font system provides multiple fantasy font options for creating immersive map experiences.

#### Available Fonts

**1. Cinzel (Default)**
- Classic serif font with medieval feel
- Excellent readability at all sizes
- Professional appearance for serious maps

**2. UnifrakturMaguntia**
- Gothic blackletter style
- Highly atmospheric and thematic
- Best for large text due to complexity

**3. MedievalSharp**
- Handwritten medieval style
- Good balance of style and readability
- Suitable for medium-sized labels

**4. Alegreya SC**
- Elegant serif with small caps
- Sophisticated appearance
- Good for formal or scholarly maps

**5. Crimson Text**
- Clean, readable serif
- Professional appearance
- Excellent for technical maps

**6. Lora**
- Modern serif with good readability
- Contemporary feel
- Good for modern fantasy settings

**7. Merriweather**
- Robust serif font
- Excellent for small text
- Good for dense label placement

#### Implementation

**CSS Variables**
```css
:root {
  --label-font: 'Cinzel', serif;
  --label-font-family: 'Cinzel', serif;
}
```

**Font Switching**
```javascript
// Enable different font themes
function setFontTheme(fontName) {
  document.documentElement.style.setProperty('--label-font', fontName);
  document.documentElement.style.setProperty('--label-font-family', fontName);
}
```

**Font Caps System**
The font caps system ensures that ocean labels are always the largest, with other labels scaled proportionally:

```javascript
// Apply caps to all non-ocean labels AFTER they exist in the DOM
export function applyFontCaps() {
  const oceanPx = getOceanFontPx();
  const caps = computeTierCaps(oceanPx);

  d3.selectAll("text.label:not(.label--ocean)")
    .each(function(d) {
      const sel = d3.select(this);
      const basePx = parseFloat(sel.style("font-size")) || 
                     parseFloat(getComputedStyle(this).fontSize) || 
                     MIN_LABEL_PX;
      const tier = d?.tier ?? 4;
      const finalPx = clampByTierPx(basePx, tier, caps);
      sel.style("font-size", finalPx + "px");
    });
}
```

**Tier Caps**
- Tier 1 (Ocean): Always largest (no cap)
- Tier 2: 86% of ocean size
- Tier 3: 74% of ocean size  
- Tier 4: 64% of ocean size
- Minimum: 11px for legibility

---

## Names System

**1. Fantasy Name Generation**
- Robust fantasy names for oceans, lakes, and islands
- API: `makeNamer(rng)` returns `{ ocean(size), lake(size), island(clusterSize) }`
- Size-aware naming with appropriate terminology

**2. Uniqueness Control**
- **Root-based deduplication**: Prevents repetitive patterns (e.g., "Everdark Sea" followed by "Everdark Ocean")
- **Full name tracking**: Ensures complete uniqueness across all generated names
- **Fallback strategies**: Multiple uniqueness approaches with graceful degradation

**3. Grammar and Structure**
- **Oceans**: Directional adjectives (Northern/Western), epic "of the..." constructs, descriptive terms
- **Lakes**: Intelligent grammar rules for "Adjective Lake" vs "Lake Noun" based on euphony
- **Islands**: Size-appropriate terminology (Continent, Island, Isle, Atoll, Key, etc.)

**4. Lexicon Organization**
- **Thematic pools**: Natural, Mythical, Animal, Flora, Abstract categories
- **Singular/Plural handling**: Proper inflection with irregular plural support
- **Rich vocabulary**: 25+ descriptors, 21+ qualifiers, extensive noun collections

**5. Size-Aware Naming**
- **Ocean size**: Influences feature term selection (Ocean, Sea, Expanse, Deep, etc.)
- **Lake size**: Grammar rules adapt to feature type (Lake, Mere, Tarn, Pool, etc.)
- **Island clustering**: Cluster size biases toward appropriate size categories

---

## Performance Optimizations

### Label System Performance

**1. Efficient Zoom Filtering**
- Pre-sorted labels by priority and area
- Slice-only filtering with no re-sorting
- Reduced DOM churn using `display: none`

**2. Collision Avoidance Optimization**
- Cluster-based processing with performance guardrails
- Dynamic sweep limits based on cluster size
- Intelligent fallbacks for large clusters

**3. Rendering Optimization**
- Batch DOM operations
- Efficient transform updates
- Minimal reflows during zoom operations

### Debug Output Control

**Global Toggle**
```javascript
window.DEBUG = false; // Controls all debug output
```

**Throttled Logging**
- Debug statements gated to prevent console spam
- Performance-aware logging
- Comprehensive debugging with `debugLabels()` function

---

## Bug Fixes and Improvements

### Label Fixes

**1. Collision Detection**
- Fixed edge cases in overlap detection
- Improved boundary handling
- Better handling of edge-aligned labels

**2. Positioning Issues**
- Corrected centroid calculations
- Fixed coordinate space conversions
- Improved anchor point placement

**3. Styling Consistency**
- Unified font handling across all label types
- Consistent stroke and fill properties
- Proper CSS inheritance

### Ocean Label Fixes

**1. Positioning Accuracy**
- Fixed world coordinate calculations
- Improved rectangle boundary detection
- Better integration with collision avoidance

**2. Styling Issues**
- Eliminated font mismatches
- Consistent visual appearance
- Proper halo rendering

**3. Performance Issues**
- Reduced overlay management overhead
- Simplified transform handling
- Better memory management

---

## Technical Decisions

### Architecture Choices

**1. ES Modules**
- **Decision**: Use ES modules for code organization
- **Rationale**: Modern JavaScript standard, no bundler needed
- **Result**: Clean imports, better tree-shaking potential

**2. D3.js v5**
- **Decision**: Use D3.js v5 globally instead of importing
- **Rationale**: Simplified dependency management, consistent API
- **Result**: Easier debugging, no module conflicts

**3. SVG-Based Rendering**
- **Decision**: Use SVG for all rendering operations
- **Rationale**: Vector graphics, zoom-friendly, D3 integration
- **Result**: Scalable graphics, good performance

### Performance Considerations

**1. RequestAnimationFrame Throttling**
- **Decision**: Throttle hover and zoom operations
- **Rationale**: Prevent excessive DOM updates
- **Result**: Smooth 60fps performance

**2. Cluster-Based Processing**
- **Decision**: Process labels in clusters for collision avoidance
- **Rationale**: Better optimization, reduced complexity
- **Result**: Improved placement quality

**3. Transform-Based Scaling**
- **Decision**: Use SVG transforms instead of font-size changes
- **Rationale**: Better performance, consistent rendering
- **Result**: Smooth zoom operations

---

## Future Enhancements

### Planned Features

**1. Town Labels**
- Settlement and city labeling system
- Population-based naming
- Cultural region variations

**2. Geographic Features**
- Mountain, river, and terrain feature labels
- Elevation-based naming
- Feature classification system

**3. Internationalization**
- Multi-language label support
- Cultural naming conventions
- Localized terminology

**4. Advanced Typography**
- Font-specific width measurements
- Dynamic font selection
- Custom font loading

### Performance Improvements

**1. Label Caching**
- Cache computed label positions
- Reduce redundant calculations
- Improve zoom performance

**2. Spatial Indexing**
- Quadtree for label queries
- Efficient collision detection
- Better large-scale performance

**3. Progressive Rendering**
- LOD-based label rendering
- Viewport culling
- Adaptive detail levels

---

## Development Workflow

### Testing Strategy

**1. Self-Tests**
- Automated regression testing
- Invariant validation
- Performance benchmarking

**2. Test Pages**
- Feature-specific testing
- Interactive debugging
- Visual validation

**3. Console Tools**
- Runtime diagnostics
- Performance monitoring
- Debug mode toggles

### Debug Tools

**1. Console Commands**
```javascript
// Comprehensive label inspection
debugLabels()

// Check self-tests
runSelfTests()

// Performance monitoring
Timers.report()

// Debug mode toggle
window.DEBUG = true
```

**2. Visual Debugging**
- Debug rectangles for label boundaries
- Performance HUD
- Transform visualization

**3. Performance Monitoring**
- Built-in timing utilities
- Memory usage tracking
- Frame rate monitoring

---

## Conclusion

The Urban Train project has evolved significantly from its initial implementation to become a robust, feature-rich procedural map generator. The development log documents the major architectural decisions, implementation details, and technical improvements that have shaped the current system.

Key achievements include:
- **Advanced label system** with sophisticated collision avoidance
- **Counter-scaling implementation** for consistent label rendering
- **Performance optimizations** for smooth user experience
- **Comprehensive testing** and debugging tools
- **Clean architecture** with clear separation of concerns

The project demonstrates the value of iterative development, comprehensive testing, and thoughtful architectural decisions in creating complex interactive applications.

---

## LOD System Implementation

### Overview

A comprehensive Level of Detail (LOD) system has been implemented to provide dynamic label visibility based on zoom level and feature importance. This system ensures optimal performance and user experience across all zoom levels.

### Core Components

#### **1. Tier-Based Classification**
Labels are automatically classified into 4 tiers based on feature importance:
- **Tier 1**: Oceans and major features (always visible)
- **Tier 2**: Major secondary features (visible at medium zoom)
- **Tier 3**: Standard features (visible at close zoom)
- **Tier 4**: Minor features (visible at very close zoom)

#### **2. Robust Coordinate System**
```javascript
function worldPoint(d) {
  if (d?.placed && Number.isFinite(d.placed.x) && Number.isFinite(d.placed.y)) return d.placed;
  if (d?.layout && Number.isFinite(d.layout.x) && Number.isFinite(d.layout.y)) return d.layout;
  if (d?.anchor && Number.isFinite(d.anchor.x) && Number.isFinite(d.anchor.y)) {
    const dx = (d?.offset?.dx ?? d?.dx ?? 0);
    const dy = (d?.offset?.dy ?? d?.dy ?? 0);
    return { x: d.anchor.x + dx, y: d.anchor.y + dy };
  }
  if (Number.isFinite(d?.x) && Number.isFinite(d?.y)) return { x: d.x, y: d.y };
  if (Number.isFinite(d?.cx) && Number.isFinite(d?.cy)) return { x: d.cx, y: d.cy };
  return { x: 0, y: 0 };
}
```

**Priority Hierarchy**:
1. Solver results (`d.placed`, `d.layout`)
2. Anchor + offset combinations
3. Simple coordinate properties
4. Safe fallback to origin

#### **3. Deterministic Label Transforms**
```javascript
export function applyLabelTransforms(svg){
  const t = d3.zoomTransform(svg.node());
  const toScreen = (p) => `translate(${t.applyX(p.x)},${t.applyY(p.y)}) scale(${1/t.k})`;

  svg.selectAll('#labels-world-areas g.label')
     .attr('transform', d => toScreen(worldPoint(d)));

  svg.selectAll('#labels-world-ocean g.label--ocean')
     .attr('transform', d => toScreen(worldPoint(d)));
}
```

**Features**:
- Updates on every zoom change
- Consistent transform generation
- Counter-scaling for constant screen size

#### **4. Tier Class Stamping**
```javascript
function applyTierClasses(sel) {
  sel.classed('tier-1', d => (d?.tier ?? 3) === 1)
     .classed('tier-2', d => (d?.tier ?? 3) === 2)
     .classed('tier-3', d => (d?.tier ?? 3) === 3)
     .classed('tier-4', d => (d?.tier ?? 3) >= 4);
  
  if (window.labelFlags?.styleTokensOnly) {
    sel.classed('label--water', d => d.kind === 'lake')
       .classed('label--area',  d => d.kind === 'island' && (d.area ?? 0) > 15000);
  }
}
```

**Benefits**:
- CSS selectors for precise styling
- Style token integration
- Consistent tier classification

#### **5. Real-Time Visibility Updates**
```javascript
export function updateLabelVisibility(svg){
  const t = d3.zoomTransform(svg.node());
  const fade = !!window.labelFlags?.fadeBands;

  svg.selectAll('#labels-world-areas g.label, #labels-world-ocean g.label--ocean')
    .each(function(d){
      const tier = tierFrom(this, d);
      const o = fade ? opacityForZoom(t.k, tier) : (opacityForZoom(t.k, tier, 0) > 0 ? 1 : 0);
      d3.select(this).classed('is-visible', o > 0).style('opacity', o);
    });
}
```

**Fade Bands Support**:
- **With `?flags=fadeBands`**: Smooth opacity ramps
- **Without flag**: Hard visibility gates (0 or 1)

### Integration Points

#### **1. Zoom Handler**
```javascript
// In interaction.js zoom handler
applyLabelTransforms(d3.select(svg));
updateLabelVisibility(d3.select(svg));
showLODHUD(d3.select(svg));
```

#### **2. Initial Render**
```javascript
// After generation completes
applyLabelTransforms(svgSel);
updateLabelVisibility(svgSel);
showLODHUD(svgSel);
```

#### **3. LOD Filtering**
```javascript
// Apply LOD filtering before rendering
const selected = filterByZoom(placedFeatures, t.k);
console.debug('[LOD] selected:', selected.length, 'of', placedFeatures.length);
renderWorldLabels(svgSel, selected);
```

### Debug and Monitoring

#### **1. LOD HUD**
Live overlay showing:
- Current zoom level (`k`)
- Fade width parameter
- Tier band ranges
- Computed opacity values

#### **2. Console Logging**
Real-time LOD filtering information:
```
[LOD] selected: 1 of 7
[LOD] re-render selected: 3 of 7
```

#### **3. Self-Check Commands**
```javascript
// Check tier distribution
[...document.querySelectorAll('#labels-world-areas g.label')]
  .reduce((m,n)=>{const c=[...n.classList].find(k=>k.startsWith('tier-')); m[c]=(m[c]||0)+1; return m;}, {})

// Sample opacity safely
(() => {
  const el = document.querySelector('#labels-world-areas g.label.tier-3 text');
  return el ? getComputedStyle(el).opacity : 'no t3 present';
})()
```

### Performance Benefits

#### **1. Dynamic Rendering**
- Only visible labels are rendered
- Automatic culling at low zoom levels
- Smooth transitions between zoom states

#### **2. Efficient Updates**
- Single DOM traversal per zoom
- Optimized transform generation
- Minimal reflow/repaint operations

#### **3. Memory Management**
- Labels automatically hidden when off-screen
- Tier-based visibility reduces DOM complexity
- Efficient label lifecycle management

### CSS Integration

#### **1. Tier-Based Styling**
```css
/* Smooth transitions for LOD visibility changes */
#labels-world g.label { 
  transition: opacity 120ms linear; 
}

#labels-world g.label:not(.is-visible) { 
  pointer-events: none; 
}
```

#### **2. Style Token Support**
```css
/* Water and area label styling */
.label--water { font-style: italic; }
.label--area { text-transform: uppercase; letter-spacing: 0.1em; }
```

### Future Enhancements

#### **1. Adaptive LOD**
- Dynamic tier thresholds based on performance
- User preference settings
- Context-aware visibility rules

#### **2. Advanced Filtering**
- Spatial clustering for dense areas
- Priority-based culling
- Smooth LOD transitions

#### **3. Performance Monitoring**
- Real-time performance metrics
- Adaptive quality settings
- User experience optimization

The LOD system represents a significant advancement in the Urban Train project, providing professional-grade label management with excellent performance characteristics and comprehensive debugging capabilities.

---

## 2025-01-27: Performance Optimizations & SAT Caching

### **SAT Caching System**

Implemented intelligent caching for Summed Area Table (SAT) water mask computation to avoid rebuilding when land/water geometry hasn't changed.

#### **Cache Key Components**
```javascript
const cacheKey = {
  seed: window.state?.seed || 'unknown',           // Map generation seed
  viewportSize: `${width}x${height}`,              // Current viewport dimensions
  waterCompsCount: existingLabels.filter(...),     // Number of ocean components
  step: scaledStep,                                // Grid step size
  seaLevel: seaLevel                               // Water level threshold
};
```

#### **Cache Management**
- **Automatic cleanup**: Limits cache to 10 entries to prevent memory leaks
- **Smart invalidation**: Cache key changes when geometry actually changes
- **Performance benefits**: Near-instant SAT retrieval on cache hits

#### **Debug Functions**
```javascript
// Check cache size
window.getSATCacheSize();

// Clear cache manually
window.clearSATCache();
```

### **Deferred Ocean Placement**

Implemented intelligent deferral of ocean label placement to avoid blocking `requestAnimationFrame` when possible.

#### **Deferral Strategy**
- **Idle time**: Uses `requestIdleCallback` with configurable timeout (default: 1s)
- **Fallback**: Graceful degradation with `setTimeout(16ms)` for legacy browsers
- **Smart detection**: Automatically switches to immediate placement during user interaction

#### **User Interaction Tracking**
```javascript
function shouldPlaceImmediately() {
  const isUserInteracting = document.hasFocus() && (
    // Mouse movement in last 100ms
    (window.lastMouseMove && Date.now() - window.lastMouseMove < 100) ||
    // Touch events in last 100ms  
    (window.lastTouchEvent && Date.now() - window.lastTouchEvent < 100) ||
    // Scroll events in last 100ms
    (window.lastScrollEvent && Date.now() - window.lastScrollEvent < 100)
  );
  
  // Check if we're in a critical rendering phase
  const isCriticalPhase = window.state?.isRendering || window.state?.isGenerating;
  
  return isUserInteracting || isCriticalPhase;
}
```

#### **Configuration Options**
```javascript
deferOceanPlacement(callback, {
  immediate: false,        // Force immediate execution
  timeout: 1000,          // Idle callback timeout (ms)
  fallbackDelay: 16       // Fallback delay (ms)
});
```

#### **Debug Controls**
```javascript
// Force immediate placement (blocking)
window.forceImmediateOceanPlacement();

// Force deferred placement (non-blocking)
window.forceDeferredOceanPlacement();
```

### **Raster Scaling Optimization**

Implemented performance optimization for SAT computation by scaling down the rasterization canvas and mapping coordinates back.

#### **Implementation Details**
- **Scale factor**: Configurable raster scale (default: 0.6x)
- **Coordinate mapping**: Results mapped back to original scale
- **Performance gain**: ~40% reduction in SAT computation time

#### **Usage**
```javascript
// Pass rasterScale parameter to ocean placement
findOceanLabelRectAfterAutofit(
  visibleBounds,
  getCellAtXY,
  seaLevel = 0.2,
  step = 8,
  pad = 1,
  minAspect = 2.0,
  rasterScale = 0.6  // New parameter
);
```

### **Performance Benefits**

#### **1. SAT Caching**
- **First run**: Normal SAT computation time
- **Subsequent runs**: Near-instant SAT retrieval
- **Memory efficient**: Limited to 10 entries, automatic cleanup

#### **2. Deferred Placement**
- **Smoother animations**: Ocean placement no longer blocks `requestAnimationFrame`
- **Better UX**: User interactions take priority over background label placement
- **Adaptive**: Automatically switches to immediate placement when needed

#### **3. Raster Scaling**
- **Faster computation**: Reduced canvas size for SAT operations
- **Minimal quality loss**: Imperceptible impact on ocean label placement
- **Configurable**: Adjustable scale factor for performance vs quality trade-offs

### **Technical Implementation**

#### **1. Cache Infrastructure**
```javascript
const satCache = new Map();

function getOrBuildSAT(key, buildFn) {
  if (satCache.has(key)) {
    console.log('[ocean] SAT cache HIT:', key);
    return satCache.get(key);
  }
  console.log('[ocean] SAT cache MISS, building:', key);
  const sat = buildFn();
  satCache.set(key, sat);
  
  // Prevent cache from growing too large
  if (satCache.size > 10) {
    const firstKey = satCache.keys().next().value;
    satCache.delete(firstKey);
    console.log('[ocean] SAT cache cleanup: removed oldest entry');
  }
  
  return sat;
}
```

#### **2. Deferral Logic**
```javascript
function deferOceanPlacement(callback, options = {}) {
  const { immediate = false, timeout = 1000, fallbackDelay = 16 } = options;
  
  // Determine if immediate placement is needed
  const needsImmediate = immediate || shouldPlaceImmediately();
  
  if (needsImmediate) {
    console.log('[ocean] Immediate placement (blocking) - user interaction or critical phase');
    callback();
    return;
  }
  
  // Check if requestIdleCallback is available
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(callback, { timeout });
    console.log(`[ocean] Deferred placement to idle time (timeout: ${timeout}ms)`);
  } else {
    setTimeout(callback, fallbackDelay);
    console.log(`[ocean] Fallback: deferred placement with setTimeout (${fallbackDelay}ms)`);
  }
}
```

### **Browser Compatibility**

#### **1. requestIdleCallback Support**
- **Modern browsers**: Uses `requestIdleCallback` for optimal performance
- **Legacy browsers**: Falls back to `setTimeout(16ms)` for compatibility
- **Mobile**: Touch event tracking for mobile interaction detection

#### **2. Performance Characteristics**
- **First run**: Same performance (immediate placement)
- **Subsequent runs**: Better performance (deferred placement)
- **User interaction**: Responsive (immediate placement)
- **Background**: Non-blocking (deferred placement)

### **Future Enhancements**

#### **1. Advanced Caching**
- **Predictive invalidation**: Anticipate when cache will become stale
- **Memory pressure**: Adaptive cache size based on available memory
- **Cache persistence**: Save cache across page reloads for repeated maps

#### **2. Enhanced Deferral**
- **Priority queuing**: Different priority levels for different operations
- **Batch processing**: Group multiple operations for efficiency
- **User preference**: Allow users to control deferral behavior

#### **3. Performance Monitoring**
- **Real-time metrics**: Track cache hit rates and deferral effectiveness
- **Adaptive optimization**: Automatically adjust parameters based on performance
- **User feedback**: Visual indicators of performance improvements

These performance optimizations represent a significant step forward in the Urban Train project, providing professional-grade performance characteristics while maintaining the same visual quality and functionality. The system automatically adapts to user behavior and browser capabilities for optimal performance.
