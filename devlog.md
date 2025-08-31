# Urban Train Development Log

This document consolidates the development history, implementation details, and technical decisions for the Urban Train procedural map generator.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Core Architecture](#core-architecture)
3. [Label System Evolution](#label-system-evolution)
4. [Tiering System Implementation](#tiering-system-implementation)
5. [Ocean Label Implementation](#ocean-label-implementation)
6. [Counter-Scaling Implementation](#counter-scaling-implementation)
7. [Autofit System](#autofit-system)
8. [Font System](#font-system)
9. [Names System](#names-system)
10. [Performance Optimizations](#performance-optimizations)
11. [Bug Fixes and Improvements](#bug-fixes-and-improvements)
12. [Technical Decisions](#technical-decisions)

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
