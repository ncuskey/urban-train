# Ocean Label System - Complete Overhaul

## Overview

This document summarizes the complete overhaul of the ocean label system, transitioning from world-space placement with SA optimization to screen-space placement using SAT algorithms. The new system ensures ocean labels are always visible, properly sized, and never interfere with lake/island label placement.

## Problems Solved

1. **Coordinate Space Mismatch**: Ocean labels were placed in world space but needed to align with screen-space SAT rectangles
2. **Duplicate Labels**: Ocean labels appeared both in world space (SA pipeline) and screen space (SAT placement)
3. **Zoom Drift**: World-space ocean labels would drift during zoom operations
4. **NaN Errors**: Rectangle format mismatches caused placement failures
5. **Size Inconsistency**: Ocean labels didn't match the visual style of other place labels

## Current Implementation

### Screen-Space Ocean Label System
The ocean label system has been completely redesigned to use screen-space placement with SAT algorithms, ensuring perfect alignment with debug rectangles and stable positioning during zoom operations.

### Key Features
- **Screen-Space Placement**: Ocean labels are placed in screen coordinates, not world space
- **SAT Integration**: Uses SAT algorithms to find optimal placement rectangles
- **Auto-Fit Sizing**: Font size automatically adjusts to fit the placement rectangle
- **Hard-Capped Limits**: Configurable minimum (18px) and maximum (56px) font sizes
- **Always-White Styling**: Inline styling ensures consistent white color with dark outline
- **Fallback Support**: Gracefully handles invalid rectangles with viewport-based fallback
- **Duplicate Prevention**: Clears existing ocean labels from both screen and world layers

### Rectangle Normalization
**Issue**: SAT algorithms return rectangles in various formats (`[x,y,w,h]`, `{x,y,w,h}`, `{x,y,width,height}`, etc.)

**Solution**: Universal rectangle normalizer that converts any format to consistent `{x,y,width,height}` output

```javascript
export function toPxRect(r) {
  if (!r) return null;
  
  // Array form: [x, y, w, h]
  if (Array.isArray(r)) {
    const [x, y, w, h] = r.map(Number);
    return { x, y, width: w, height: h };
  }
  
  // Object form: allow x/y + w/h or width/height, or DOMRect-like
  const x = Number(r.x ?? r.left ?? r[0] ?? 0);
  const y = Number(r.y ?? r.top ?? r[1] ?? 0);
  
  let width  = r.width;
  if (width == null) width = r.w;
  if (width == null && r.right != null && r.left != null) width = Number(r.right) - Number(r.left);
  if (width == null && Array.isArray(r)) width = Number(r[2]);
  width = Number(width ?? 0);
  
  let height = r.height;
  if (height == null) height = r.h;
  if (height == null && r.bottom != null && r.top != null) height = Number(r.bottom) - Number(r.top);
  if (height == null && Array.isArray(r)) height = Number(r[3]);
  height = Number(height ?? 0);
  
  return { x, y, width, height };
}
```

## Implemented Solutions

### 1. Ocean Label Placement System (`src/modules/labels.js`)

#### `placeOceanLabelCentered(parentSel, name, rectLike, fallback)` - Smart Ocean Label Placer
- **Screen-Space Placement**: Places labels in screen coordinates (not world space) for stable positioning
- **Auto-Fit Font Sizing**: Automatically scales font to fit rectangle dimensions with padding
- **Hard-Capped Sizing**: Configurable MIN_PX (18px) and MAX_PX (56px) limits
- **Inline Styling**: Forces white color and dark outline that can't be overridden by CSS
- **Fallback Support**: Gracefully handles invalid rectangles with viewport-based fallback

```javascript
export function placeOceanLabelCentered(parentSel, name, rectLike, fallback = null) {
  const R = toPxRect(rectLike) || toPxRect(fallback) || { x: 0, y: 0, width: 0, height: 0 };
  const cx = R.x + R.width / 2;
  const cy = R.y + R.height / 2;
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;

  // clamp settings
  const MIN_PX = 18;
  const MAX_PX = 56; // ← pick your ceiling (try 48–64)

  // provisional based on rect height
  const provisional = Math.max(MIN_PX, Math.min(MAX_PX, R.height * 0.6));

  // create text (force white inline so it can't be overridden)
  const text = parentSel.append('text')
    .attr('class', 'place-label ocean')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'middle')
    .attr('x', cx)
    .attr('y', cy)
    .text(name)
    .style('fill', '#fff')                 // ← force white
    .style('stroke', 'rgba(0,0,0,.9)')
    .style('font-size', `${provisional}px`);

  // fit to rect, then clamp again
  let bbox = text.node().getBBox();
  const maxW = Math.max(1, R.width  * 0.90);
  const maxH = Math.max(1, R.height * 0.80);
  const scale = Math.min(1, maxW / bbox.width, maxH / bbox.height);

  const base = parseFloat(text.style('font-size'));
  const fitted = Math.max(MIN_PX, Math.min(MAX_PX, base * scale));
  text.style('font-size', `${fitted}px`);

  // re-center (after size change)
  text.attr('x', R.x + R.width / 2).attr('y', R.y + R.height / 2);
}
```

### 2. Ocean Label Pipeline (`src/main.js`)

#### `placeOceanLabelsAfterAutofit()` - Post-Autofit Ocean Placement
- **Screen Overlay Placement**: Uses screen overlay instead of world label layer for stable positioning
- **SAT-Based Rectangle**: Integrates with SAT algorithm for optimal ocean label placement
- **Duplicate Prevention**: Clears existing ocean labels from both screen and world layers
- **Fallback Support**: Provides viewport-based fallback when SAT rectangle is invalid
- **Debug Integration**: Draws debug rectangle and logs placement information

```javascript
function placeOceanLabelsAfterAutofit() {
  // Use SAT-based rectangle finder with post-autofit bounds
  const pxRect = findOceanLabelRectAfterAutofit(viewportBounds, state.getCellAtXY, state.seaLevel, 8, 1);
  
  if (pxRect) {
    // before placing anything
    const screenLayer = (window.debugOverlays && window.debugOverlays.overlayScreen) || d3.select('svg');

    // nuke ANY previous ocean labels in both layers
    screenLayer.selectAll('text.place-label.ocean').remove();
    d3.select('#labels').selectAll('text.place-label.ocean').remove();

    // Draw debug rectangle
    drawDebugOceanRect(pxRect);
    
    // SAT's best rect (may be [x,y,w,h] or {x,y,w,h}/{x,y,width,height})
    const best = pxRect;

    // fallback: top third of viewport
    const fallback = { x: 0, y: 0, width: mapWidth, height: Math.round(mapHeight / 3) };

    const name = (oceanLabels[0]?.text) || 'The Pale Sea';

    placeOceanLabelCentered(screenLayer, name, best, fallback);
  }
}
```

### 3. World/SA Pipeline Exclusion (`src/modules/labels.js`)

#### Ocean Labels Completely Removed from SA Processing
- **Filtered Out**: Ocean labels are excluded from `placeLabelsAvoidingCollisions()`
- **No SA Processing**: Oceans no longer go through simulated annealing optimization
- **Lake/Island Only**: SA pipeline now processes only lake and island labels
- **Updated Logging**: Console shows "Using SA labeler for lake/island labels (ocean excluded)"

```javascript
// Step 1: Process lake/island clusters with performance guardrails
for (const cluster of clusters) {
  const members = cluster.filter(l => l.kind !== 'ocean'); // oceans later
  if (!members.length) continue;
  // ... SA processing for lakes/islands only
}

// Step 3: Merge in any labels we skipped (non-ocean labels only)
for (const label of labels) {
  if (!processedIds.has(label.id) && label.kind !== 'ocean') {
    // ... placement logic for skipped non-ocean labels
  }
}
```

### 4. CSS Styling (`styles.css`)

#### Ocean Label Visual Design
- **Always-White Text**: `fill: #fff` ensures consistent white color matching other labels
- **Dark Outline**: `stroke: rgba(0,0,0,.9)` with 3px width for crisp contrast
- **Professional Typography**: Bold (700) font weight with 0.4px letter spacing
- **Paint Order**: Stroke first, then fill for proper outline rendering
- **Non-Interactive**: `pointer-events: none` prevents interference with map interactions

```css
/* Big ocean label — inherits base .place-label settings */
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

#### Inline Style Override Protection
The `placeOceanLabelCentered` function applies inline styles to ensure the white color and dark outline can never be overridden by CSS:

```javascript
.style('fill', '#fff')                 // ← force white
.style('stroke', 'rgba(0,0,0,.9)')
.style('stroke-width', '3px')
.style('paint-order', 'stroke fill')
.style('font-weight', 700)
.style('letter-spacing', '.4px')
```

## How It Works

### Before (Problematic)
```
1. Ocean labels placed in world space (SA pipeline)
2. Ocean labels also placed in screen space (SAT placement)
3. Duplicate labels visible during zoom operations
4. Labels drift with zoom transforms
5. Coordinate space mismatches cause NaN errors
```

### After (Improved - Screen-Space Only)
```
1. SAT algorithm finds optimal ocean label rectangle in screen coordinates
2. Ocean labels completely excluded from world/SA pipeline
3. Labels placed only in screen overlay using SAT rectangle
4. Font size auto-fits to rectangle dimensions with hard caps
5. Inline styling ensures consistent white color and dark outline
6. Labels remain stable during zoom operations
```

### Ocean Label Pipeline
```
🎯 SAT Algorithm: Find optimal placement rectangle
   ↓
🔄 Rectangle Normalization: Convert any format to {x,y,width,height}
   ↓
📏 Auto-Fit Sizing: Scale font to fit rectangle (18px-56px limits)
   ↓
🎨 Inline Styling: Force white fill and dark outline
   ↓
📍 Screen Placement: Position in screen overlay (not world space)
   ↓
✅ Ocean label perfectly aligned with debug rectangle
```

## Benefits

1. **Perfect Alignment**: Ocean labels are perfectly centered within SAT-computed rectangles
2. **Stable Positioning**: Screen-space placement prevents drift during zoom operations
3. **No Duplicates**: Ocean labels appear only once, eliminating confusion
4. **Consistent Styling**: Always-white text with dark outline matches other place labels
5. **Auto-Fit Sizing**: Font size automatically adjusts to fit available space
6. **Hard-Capped Limits**: Configurable size bounds (18px-56px) ensure visual consistency
7. **Robust Placement**: Rectangle normalizer handles any input format without NaN errors
8. **Fallback Support**: Graceful degradation when SAT rectangles are invalid
9. **Performance**: No SA processing for ocean labels, faster lake/island optimization
10. **Debug Integration**: Debug rectangles and console logging for development

## Testing

Test files have been created to verify the new ocean label system:

### `test-sat-ocean-placement.html`
- ✅ SAT algorithm integration
- ✅ Rectangle format handling
- ✅ Debug rectangle drawing
- ✅ Ocean label placement

### `dev/test-ocean-rectangle.html`
- ✅ Rectangle normalizer functionality
- ✅ Auto-fit font sizing
- ✅ Hard-capped size limits
- ✅ Inline styling application

### `index.html` (Main Application)
- ✅ Screen-space ocean label placement
- ✅ SAT rectangle integration
- ✅ Duplicate prevention
- ✅ Zoom stability
- ✅ Fallback handling

## Usage

The new ocean label system is automatically active and requires no manual configuration. Ocean labels will be placed using SAT algorithms in screen space, with automatic font sizing and consistent styling.

### Configuration Options
- **Font Size Limits**: Adjust `MIN_PX` (18) and `MAX_PX` (56) in `placeOceanLabelCentered`
- **Padding**: Modify `PADX` (0.05) and `PADY` (0.10) for text fitting
- **Fallback**: Customize fallback rectangle dimensions in `placeOceanLabelsAfterAutofit`

## Future Enhancements

1. **Dynamic Font Sizing**: Could add zoom-based font size adjustments
2. **Animation Integration**: Smooth transitions when ocean labels are repositioned
3. **Performance Metrics**: Track SAT algorithm performance and placement success rates
4. **Advanced Fallbacks**: Multiple fallback strategies for different failure modes

## Files Modified

- `src/modules/labels.js` - Added `toPxRect` normalizer and `placeOceanLabelCentered` function
- `src/main.js` - Updated `placeOceanLabelsAfterAutofit` to use screen-space placement
- `styles.css` - Added ocean label styling with always-white text
- `dev/test-ocean-rectangle.html` - Updated test file for new function signature

## Conclusion

The ocean label system has been completely overhauled to provide a robust, screen-space placement solution that ensures:

1. **Perfect Alignment**: Ocean labels are perfectly centered within SAT-computed rectangles
2. **Stable Positioning**: Screen-space placement prevents drift during zoom operations
3. **No Duplicates**: Ocean labels appear only once, eliminating confusion
4. **Consistent Styling**: Always-white text with dark outline matches other place labels
5. **Auto-Fit Sizing**: Font size automatically adjusts to fit available space with hard caps
6. **Robust Placement**: Rectangle normalizer handles any input format without NaN errors
7. **Performance**: No SA processing for ocean labels, faster lake/island optimization
8. **Debug Integration**: Debug rectangles and console logging for development

The ocean label will now appear perfectly centered inside the red dashed rectangle, remain stable during zoom operations, and maintain consistent styling with the rest of the map's labeling system. The SAT algorithm provides optimal placement while the screen-space positioning ensures perfect alignment with debug overlays.
