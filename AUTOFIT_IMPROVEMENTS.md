# Autofit Improvements - Promise-Based Implementation

## Overview

This document describes the improvements made to the autofit system in Urban Train, specifically the transition to Promise-based autofit and the fix for ocean label placement timing.

## Problem Statement

### **Original Issue**
Ocean labels were being placed **before** the autofit animation completed, resulting in:
- Incorrect bounds calculation
- Labels positioned for the wrong viewport
- Poor label placement quality
- Timing race conditions

### **Secondary Issue**
After autofit completed, users could manually zoom out beyond the autofit level, losing the tight-to-land view that autofit established.

### **Root Cause**
The original implementation placed ocean labels immediately after calling `fitToLand()`, but `fitToLand()` was synchronous and didn't wait for the D3 transition to complete. Additionally, the zoom extent was not constrained after autofit, allowing users to zoom out beyond the optimal view.

## Solution: Promise-Based Autofit + Zoom Locking

### **1. Updated `fitToLand()` Function**

**Before (Synchronous)**:
```javascript
export function fitToLand({ svg, zoom, polygons, width, height, seaLevel = 0.2, preferFeatureType = true, margin = 0.08, duration = 600 }) {
  // ... calculation logic ...
  
  // Apply transform immediately (no Promise)
  svg
    .transition()
    .duration(duration)
    .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
}
```

**After (Promise-based)**:
```javascript
export function fitToLand({ svg, zoom, polygons, width, height, seaLevel = 0.2, preferFeatureType = true, margin = 0.08, duration = 600 }) {
  // ... calculation logic ...
  
  // Return a Promise that resolves when the transition completes
  return new Promise(resolve => {
    const tr = svg
      .transition()
      .duration(duration);
    
    tr.on('end.autofit', resolve).on('interrupt.autofit', resolve);
    tr.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(k));
  });
}
```

### **2. Added `autoFitToWorld()` Function**

A new function that provides more control over the fitting process:

```javascript
export function autoFitToWorld(svg, zoom, w, h, worldBBox, duration = 400) {
  const k = Math.min(
    (w - 64) / (worldBBox.width  || 1),
    (h - 64) / (worldBBox.height || 1)
  );
  const tx = (w  - k * (worldBBox.x + worldBBox.width  / 2));
  const ty = (h  - k * (worldBBox.y + worldBBox.height / 2));
  const t  = d3.zoomIdentity.translate(tx, ty).scale(k);

  return new Promise(resolve => {
    const tr = svg.transition().duration(duration);
    tr.on('end.autofit', resolve).on('interrupt.autofit', resolve);
    tr.call(zoom.transform, t);
  });
}
```

### **3. Enhanced `getVisibleWorldBounds()` Function**

Added to `labels.js` to get the correct post-autofit bounds:

```javascript
export function getVisibleWorldBounds(svg, width, height) {
  const t = d3.zoomTransform(svg.node());
  const [x0, y0] = t.invert([0, 0]);
  const [x1, y1] = t.invert([width, height]);
  return [x0, y0, x1, y1];
}
```

### **4. Zoom Locking After Autofit**

Added to `main.js` to prevent zooming out beyond the autofit level:

```javascript
// Helper function to lock zoom to prevent zooming out beyond autofit level
function lockZoomToAutofitLevel() {
  const currentZoom = d3.zoomTransform(svgSel.node());
  const autofitZoomLevel = currentZoom.k;
  const zoom = svgSel.node().__ZOOM__;
  if (zoom) {
    // Set minimum zoom to the autofit level to prevent zooming out
    zoom.scaleExtent([autofitZoomLevel, 32]);
    console.log(`[autofit] 🔒 Locked zoom extent: [${autofitZoomLevel.toFixed(2)}, 32]`);
  }
}
```

This function is called after each successful autofit completion to ensure users cannot manually zoom out beyond the optimal view established by autofit.

## Implementation in Main Generation Flow

### **Before (Incorrect Timing)**:
```javascript
// 1. Build feature labels
const featureLabels = buildFeatureLabels({...});

// 2. Place ocean labels immediately (WRONG!)
const oceanLabels = featureLabels.filter(l => l.kind === 'ocean');
// ... place labels with pre-autofit bounds ...

// 3. Autofit to land (labels already placed!)
window.fitLand();
```

### **After (Correct Timing)**:
```javascript
// 1. Build feature labels
const featureLabels = buildFeatureLabels({...});

// 2. Store for later use
window.__featureLabels = featureLabels;

// 3. Autofit to land and wait for completion
if (AUTO_FIT) {
  console.log('[autofit] Starting autofit to land...');
  await window.fitLand();
  console.log('[autofit] Autofit completed, now placing ocean labels...');
  
  // 4. Lock zoom to prevent zooming out beyond autofit level
  lockZoomToAutofitLevel();
  
  // 5. Place ocean labels with correct post-autofit bounds
  const featureLabels = window.__featureLabels || [];
  const oceanLabels = featureLabels.filter(l => l.kind === 'ocean');
  
  if (oceanLabels.length > 0) {
    // Get the post-autofit visible world bounds
    const [x0, y0, x1, y1] = getVisibleWorldBoundsFromLabels(svgSel, mapWidth, mapHeight);
    const visibleWorld = [x0, y0, x1, y1];
    
    // Use correct bounds for rectangle finding and label placement
    // ... rectangle-based placement logic ...
  }
}
```

## Key Benefits

### **1. Correct Timing**
- Ocean labels are placed **after** autofit completes
- No more race conditions between autofit and label placement

### **2. Accurate Bounds**
- `getVisibleWorldBounds()` reads the final transform
- Rectangle finder works with the correct viewport
- Better label placement quality

### **3. Zoom Locking**
- Users cannot zoom out beyond the autofit level
- Maintains the tight-to-land view established by autofit
- Still allows zooming in for detailed inspection

### **4. Clean Async Flow**
- Promise-based approach ensures proper sequencing
- Easy to extend with additional post-autofit operations
- Clear separation of concerns

### **5. Maintains Existing Behavior**
- All existing functionality preserved
- Just reordered for correct timing
- No breaking changes to the API

## Testing

### **Console Logs**
The implementation includes comprehensive logging:
```
[autofit] Starting autofit to land...
[autofit] ✅ Promise-based autofit completed successfully
[autofit] 🔒 Locked zoom extent: [1.23, 32]
[autofit] Autofit completed, now placing ocean labels...
[ocean] DEBUG: After autofit, featureLabels available: {...}
[ocean] DEBUG: Post-autofit bounds: {...}
[ocean] 🎯 Placing ocean labels after autofit with correct bounds
```

### **Test Page**
A dedicated test page is available at `/test-autofit-promise.html` to verify:
- Promise resolution
- Function availability
- Error handling

## Migration Guide

### **For Existing Code**
No changes required - the Promise-based approach is backward compatible.

### **For New Code**
Use the async/await pattern for proper sequencing:

```javascript
// ✅ Correct: Wait for autofit
await fitToLand({...});
placeOceanLabels();

// ❌ Incorrect: Don't wait
fitToLand({...});
placeOceanLabels(); // Too early!
```

## Future Enhancements

### **Potential Improvements**
1. **Multiple autofit operations**: Chain multiple autofit calls
2. **Custom transition easing**: Add easing functions to the Promise
3. **Progress callbacks**: Add progress events during transitions
4. **Cancellation support**: Allow autofit operations to be cancelled
5. **Zoom extent persistence**: Save and restore zoom constraints across sessions

### **Integration Points**
- **Refine operations**: Wait for autofit before refining coastlines
- **Label updates**: Recalculate labels after viewport changes
- **Performance monitoring**: Track autofit timing and success rates

## Conclusion

The Promise-based autofit implementation resolves the timing issues that were causing poor ocean label placement. By ensuring that ocean labels are placed after the autofit animation completes, and by locking the zoom extent to prevent zooming out beyond the autofit level, the system now provides:

- **Better label quality**: Labels positioned for the correct viewport
- **Reliable timing**: No more race conditions
- **Preserved view**: Users cannot accidentally zoom out beyond the optimal autofit level
- **Cleaner code**: Async/await pattern for complex operations
- **Future extensibility**: Easy to add post-autofit operations

This improvement maintains all existing functionality while fixing both the core timing issue that was affecting label placement quality and the user experience issue of losing the tight-to-land view.
