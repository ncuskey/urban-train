# Label and HUD Implementation

This document describes the implementation of proper label scaling and HUD tracking for the D3/SVG map application.

## Overview

The implementation unifies coordinate spaces to ensure:
- Labels scale correctly with the map (or stay constant-size)
- Mouseover picking works at any zoom level
- HUD elements stay crisp and properly positioned

## Key Components

### 1. Coordinate Space Layers

```javascript
// Core nodes
const svg = d3.select('svg');                    // Root SVG container
const viewbox = svg.append("g").attr("class", "viewbox");  // Zoomed group
const gLabels = viewbox.append("g").attr("id", "labels");  // Labels (world coords)
const gHUD = svg.append("g").attr("id", "hud");           // HUD (screen coords)
```

### 2. Global Transform Tracking

```javascript
// Global transform tracking for coordinate space conversions
let currentTransform = d3.zoomIdentity;

// Label scaling configuration
const LABELS_NONSCALING = false; // Set to true for constant-size labels
```

### 3. Zoom Handler

The zoom handler in `src/modules/interaction.js` now:
- Updates global transform tracking
- Applies transform to world layers
- Handles label scaling based on configuration

```javascript
function zoomed() {
  const t = d3.zoomTransform(svg.node());
  window.currentTransform = t; // Update global transform tracking
  
  // Apply transform to world layers (geometry etc.)
  viewbox.attr("transform", t);
  
  // Handle label scaling based on configuration
  const gLabels = d3.select('#labels');
  if (!gLabels.empty()) {
    if (window.LABELS_NONSCALING) {
      // Keep label text constant-size in pixels: counter-scale each label
      gLabels.selectAll('text')
        .attr("transform", d => `translate(${t.applyX(d.x)},${t.applyY(d.y)}) scale(${1 / t.k})`);
    }
    // If LABELS_NONSCALING is false, labels scale naturally with the map
  }
}
```

### 4. Mouseover Picking

The mouseover handler now converts screen coordinates to world coordinates:

```javascript
function moved(event) {
  // Get screen coordinates relative to SVG viewport
  // Use d3.mouse for D3 v5 compatibility (d3.pointer is v6+)
  const point = d3.mouse(svg.node());
  const mx = point[0], my = point[1];
  
  // Convert to world coordinates under current zoom/pan
  const [wx, wy] = window.currentTransform.invert([mx, my]);
  
  // Use world coordinates for spatial queries
  const nearest = diagram.find(wx, wy).index;
  
  // Update HUD with screen coordinates for crisp positioning
  updateHUD(poly, { screenX: mx, screenY: my, worldX: wx, worldY: wy, k: window.currentTransform.k });
}
```

### 5. HUD Positioning

The HUD uses screen coordinates to stay crisp:

```javascript
function updateHUD(cell, ctx) {
  // Position HUD using screen coordinates
  const merged = enter.merge(tip)
    .attr("transform", `translate(${ctx.screenX + 12},${ctx.screenY + 12})`);
}
```

## Usage

### Label Modes

1. **Scaling Labels (default)**: Labels scale with the map
   ```javascript
   window.LABELS_NONSCALING = false;
   ```

2. **Constant-Size Labels**: Labels maintain pixel size
   ```javascript
   window.LABELS_NONSCALING = true;
   ```

### Toggle Label Scaling

Use the "Constant-size labels" checkbox in the options panel, or call:
```javascript
window.toggleLabelScaling();
```

### Drawing Labels

```javascript
const labelData = [
  { id: 'label-1', x: 100, y: 200, name: 'City Name' }
];
window.drawLabels(labelData);
```

## Auto-Fit Compatibility

The auto-fit function (`fitToLand`) automatically works with the new system because it uses:
```javascript
svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
```

This automatically fires the `onZoom` handler and keeps everything in sync.

## CSS Styling

Labels and HUD have been styled for visibility:

```css
.place-label {
  fill: white;
  stroke: black;
  stroke-width: 0.5px;
  font-family: Arial, sans-serif;
  font-weight: bold;
  text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
  pointer-events: none;
}

#hud {
  pointer-events: none;
}
```

## Testing

1. Generate a map - labels will appear on features
2. Zoom in/out - labels should scale appropriately
3. Toggle "Constant-size labels" - labels should maintain pixel size
4. Hover over cells - HUD should appear near cursor and stay crisp
5. Use auto-fit - everything should remain properly positioned

## Files Modified

- `src/main.js` - Added label layers, global tracking, and label drawing
- `src/modules/interaction.js` - Updated zoom handler and mouseover picking
- `index.html` - Added label scaling toggle
- `styles.css` - Added label and HUD styling

## D3 Version Compatibility

This implementation is designed for **D3 v5** (as used in this project). Key compatibility notes:

- Uses `d3.mouse()` instead of `d3.pointer()` (which is D3 v6+)
- Compatible with existing D3 v5 zoom behavior
- Works with the current D3 v5 event handling system
