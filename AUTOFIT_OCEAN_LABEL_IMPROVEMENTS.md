# Autofit Ocean Label Improvements

## Overview

This document summarizes the improvements made to the autofit system for better ocean label placement after autofit operations. The improvements address the timing issues where ocean labels were being placed before the D3 transition completed, leading to incorrect positioning.

## Problems Solved

1. **Timing Issues**: Ocean labels were placed immediately after calling `fitToLand()`, but the D3 transition hadn't completed yet
2. **Incorrect Bounds**: Labels were positioned using pre-autofit bounds instead of post-autofit bounds
3. **Race Conditions**: No guarantee that the viewport had settled before measuring and placing labels

## Bug Fixes

### Rectangle Clamping Format Mismatch
**Issue**: The `clampRectToBounds` function was expecting `x,y,w,h` properties but the actual rectangle objects from `findOceanLabelRect` use `x0,y0,x1,y1,w,h` format, causing `NaN` values.

**Solution**: Updated the function to automatically detect and handle both rectangle formats:
- **Input format detection**: Checks for `x0` property to determine format
- **Property mapping**: Maps `x0,y0,x1,y1` to `x,y,w,h` for calculations
- **Output format preservation**: Returns the same format as input with all properties intact

**Before (Broken)**:
```javascript
// Expected x,y,w,h but got x0,y0,x1,y1
const x = Math.max(bounds.x0, Math.min(rect.x, bounds.x1)); // rect.x = undefined → NaN
```

**After (Fixed)**:
```javascript
// Smart format detection
const rectX = rect.x0 !== undefined ? rect.x0 : rect.x;
const rectY = rect.y0 !== undefined ? rect.y0 : rect.y;
const rectW = rect.w || (rect.x1 - rect.x0);
const rectH = rect.h || (rect.y1 - rect.y0);
```

## Implemented Solutions

### 1. Utility Functions (`src/modules/autofit.js`)

#### `afterLayout(callback)`
- Uses double `requestAnimationFrame` for belt-and-suspenders approach
- Ensures layout is complete before measuring
- Provides a reliable way to defer operations until after DOM updates

```javascript
export function afterLayout(callback) {
  requestAnimationFrame(() => requestAnimationFrame(callback));
}
```

#### `clampRectToBounds(rect, bounds)`
- Final safety guard for rectangle positioning
- Ensures ocean label rectangles are always within visible bounds
- Prevents labels from being placed outside the viewport
- **Smart format detection**: Automatically handles both `x0,y0,x1,y1` and `x,y,w,h` rectangle formats
- **Property preservation**: Maintains all original rectangle properties (corner, touchesCoast, area, labelScore)

```javascript
export function clampRectToBounds(rect, bounds) {
  // Handle both x0,y0,x1,y1 format and x,y,w,h format
  const rectX = rect.x0 !== undefined ? rect.x0 : rect.x;
  const rectY = rect.y0 !== undefined ? rect.y0 : rect.y;
  const rectW = rect.w || (rect.x1 - rect.x0);
  const rectH = rect.h || (rect.y1 - rect.y0);
  
  const x = Math.max(bounds.x0, Math.min(rectX, bounds.x1));
  const y = Math.max(bounds.y0, Math.min(rectY, bounds.y1));
  const w = Math.max(0, Math.min(rectX + rectW, bounds.x1) - x);
  const h = Math.max(0, Math.min(rectY + rectH, bounds.y1) - y);
  
  // Return in the same format as the input
  if (rect.x0 !== undefined) {
    // Return x0, y0, x1, y1 format with preserved properties
    return { 
      x0: x, y0: y, x1: x + w, y1: y + h,
      w, h,
      corner: rect.corner,
      touchesCoast: rect.touchesCoast,
      area: w * h,
      labelScore: rect.labelScore
    };
  } else {
    // Return x, y, w, h format
    return { x, y, w, h };
  }
}
```

### 2. Horizontal Rectangle Preference (`src/modules/labels.js`)

#### `findOceanLabelRect(opts)` - Enhanced with Horizontal Preference
- **Aspect Ratio Constraint**: Requires `w/h >= minAspect` (default: 1.15 for horizontal)
- **Smart Growth Algorithm**: `growFromSeed()` function preserves horizontal orientation during expansion
- **Fallback Strategy**: Relaxes aspect ratio if no rectangles meet the strict requirement
- **Font Fitting**: Optional `fitFontToRect()` function checks if text fits at desired font size

```javascript
// Usage with horizontal preference
const rect = findOceanLabelRect({
  bounds: [x0, y0, x1, y1],
  step: 8,
  minAspect: 1.2,        // prefer horizontal rectangles (w/h > 1.2)
  edgePad: 12,           // keep off hard edges
  coastPad: 6,           // inset from coastline
  getCellAtXY: state.getCellAtXY,
  isWaterAt
});

// Optional font fitting check
const fit = fitFontToRect(oceanName, rect, 28, 'serif');
if (!fit.fits) {
  // either pick next-best horizontal rect or pan slightly and retry
}
```

#### **Growth Algorithm Details**
1. **Horizontal First**: Widens the rectangle before growing vertically
2. **Aspect Preservation**: Stops vertical growth if it would break the minimum aspect ratio
3. **Water Boundary Respect**: Only grows into areas that are confirmed to be water
4. **Coastline Awareness**: Maintains the `touchesCoast` property during growth

### 3. Improved Autofit Flow (`src/main.js`)

#### Prioritized Method Approach
The system now follows a **prioritized fallback strategy** to ensure ocean labels are placed at the right time:

**Method 1: Promise-based autofit (PREFERRED)**
- Uses `await window.fitLand()` which returns a Promise
- Ocean labels placed immediately after Promise resolves
- Most reliable and clean approach

**Method 2: Transition event handling (FALLBACK 1)**
- Falls back to D3 transition events if Method 1 fails
- Sets up `end.placeOcean.autofit` and `interrupt.placeOcean.autofit` handlers
- Provides safety net for transition completion

**Method 3: AfterLayout safety (FALLBACK 2)**
- Final fallback using `afterLayout()` double RAF approach
- Ensures labels are placed even if all else fails
- Belt-and-suspenders approach for maximum reliability

#### Ocean Label Placement Function
- Moved ocean label placement logic into a dedicated function `placeOceanLabelsAfterAutofit()`
- This function is called **only after** the autofit transition completes
- Uses **post-autofit bounds** for accurate positioning
- **Always applies rectangle clamping** as a final safety guard

### 3. Rectangle Clamping Integration

Ocean label rectangles are **always clamped** to visible bounds before placement, regardless of which method succeeds:

```javascript
// ALWAYS clamp the rectangle to visible bounds as a final safety guard
const clampedRect = clampRectToBounds(rect, {
  x0: x0, y0: y0, x1: x1, y1: y1
});

// Place ocean labels in the clamped rectangle
for (const oceanLabel of oceanLabels) {
  const panned = placeOceanLabelInRect(oceanLabel, clampedRect, svgSel);
  // ... handle panning logic
}
```

## How It Works

### Before (Problematic)
```
1. Call fitToLand()
2. Immediately place ocean labels ← WRONG! Transition not done
3. Labels use wrong bounds
4. Labels appear in wrong positions
```

### After (Improved - Prioritized Approach)
```
1. Try Method 1: Promise-based autofit (await window.fitLand())
2. If Method 1 succeeds: Place ocean labels immediately after Promise resolves
3. If Method 1 fails: Try Method 2: Transition event handling
4. If Method 2 fails: Try Method 3: AfterLayout safety (double RAF)
5. ALWAYS: Place ocean labels with correct post-autofit bounds
6. ALWAYS: Clamp rectangles to visible bounds for safety
```

### Method Priority
```
🎯 Method 1 (Preferred): Promise-based autofit
   ↓ (if fails)
🔄 Method 2 (Fallback 1): D3 transition events
   ↓ (if fails)
🔄 Method 3 (Fallback 2): AfterLayout safety
   ↓
✅ Ocean labels placed with correct bounds + rectangle clamping
```

## Benefits

1. **Accurate Positioning**: Ocean labels are placed using correct post-autofit bounds
2. **Reliable Timing**: Multiple fallback mechanisms ensure labels are placed at the right time
3. **Safety**: Rectangle clamping prevents labels from appearing outside the viewport
4. **Performance**: Uses efficient D3 transition events when possible
5. **Robustness**: Multiple fallback strategies handle edge cases
6. **Horizontal Preference**: Ocean labels now prefer wide, horizontal rectangles for better readability
7. **Smart Growth**: Rectangle expansion maintains aspect ratio and water boundaries
8. **Font Fitting**: Optional validation that text fits at desired font size

## Testing

A test file `test-autofit-improvements.html` has been created to verify:

- ✅ Utility function imports
- ✅ Transition event handling setup
- ✅ Rectangle clamping functionality
- ✅ AfterLayout timing behavior
- ✅ Horizontal rectangle preference (aspect ratio constraints)
- ✅ Smart growth algorithm (preserves horizontal orientation)
- ✅ Font fitting validation (optional text size checking)

## Usage

The improvements are automatically active when `AUTO_FIT = true` in the main generation flow. No manual configuration is required.

## Future Enhancements

1. **Promise-based Integration**: Could integrate more deeply with the existing Promise-based `fitToLand()` function
2. **Performance Monitoring**: Add timing metrics to track autofit → label placement latency
3. **Animation Coordination**: Better coordination between autofit animations and label placement animations

## Files Modified

- `src/modules/autofit.js` - Added utility functions
- `src/main.js` - Updated autofit flow with improved ocean label placement
- `test-autofit-improvements.html` - Test file for verification

## Conclusion

These improvements ensure that ocean labels are placed accurately after autofit operations by:

1. Waiting for D3 transitions to complete
2. Using correct post-autofit bounds
3. Providing multiple fallback mechanisms
4. Adding safety guards for rectangle positioning
5. **Preferring horizontal rectangles** for better ocean label readability
6. **Maintaining aspect ratios** during rectangle growth
7. **Validating font fitting** to ensure text displays properly

The red rectangle (ocean label placement area) will now be computed after the auto-fit zoom completes, will always sit inside the actual visible viewport, and will prefer horizontal orientations for optimal ocean label placement.
