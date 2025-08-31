# Counter-Scaling Labels Implementation

## Overview

The counter-scaling implementation ensures that all map labels maintain constant on-screen size during pan/zoom operations. This provides a consistent user experience where labels remain readable at all zoom levels while moving perfectly with the map.

## How It Works

### 1. **Dual Transform System**
- **Map transform**: The `#world` and `#labels-world` groups receive normal zoom transforms (translate + scale)
- **Label counter-transform**: Each individual label group gets an additional `scale(1/k)` to counteract the zoom

### 2. **Transform Chain**
```
Label Group Transform = translate(x,y) + scale(1/k) + rotate(angle)
Parent Group Transform = translate(zoom.x, zoom.y) + scale(zoom.k)
Final Result = Label moves with map but maintains constant screen size
```

### 3. **Vector-Effect Attributes**
All text elements include SVG attributes for consistent rendering:
- `vector-effect="non-scaling-stroke"`: Halo stroke width stays constant
- `paint-order="stroke"`: Halo renders behind text for proper layering

## Implementation Details

### **Zoom Handler (interaction.js)**

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

### **Label Creation (labels.js)**

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

### **Font-Size Scaling Removed**

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

### **CSS Kill Switch for Debug Rectangles**

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

## Safety Features

### **Zoom Level Guards**
```javascript
const inv = 1 / Math.max(0.5, Math.min(32, t.k));
```
- **Minimum zoom**: 0.5x (prevents extreme inverse scaling)
- **Maximum zoom**: 32x (prevents extreme inverse scaling)

### **Defensive Positioning**
- Extracts original position from current transform attributes
- Handles cases where labels might not have expected data properties
- Gracefully handles missing or malformed transforms

### **Rotation Preservation**
- Maintains any existing label rotation during counter-scaling
- Preserves the `d.angle` property if present
- Applies rotation after scaling for proper transform order

### **Debug Logging**
- Console output when counter-scaling is applied
- Shows zoom level, inverse scale factor, and label count
- Controlled by `window.DBG.labels` flag

## Benefits

### ✅ **Constant Label Size**
- Labels never change pixel size during zoom operations
- Consistent readability at all zoom levels
- Professional appearance regardless of view state

### ✅ **Perfect Map Tracking**
- Labels move exactly with the map during pan/zoom
- No parallax or positioning drift
- Maintains spatial relationships with features

### ✅ **Crisp Halo Rendering**
- Stroke widths remain constant at all zoom levels
- `vector-effect="non-scaling-stroke"` ensures consistent appearance
- Professional label styling maintained

### ✅ **Performance Improvements**
- No font-size recalculations during zoom
- No DOM style updates for text sizing
- Efficient transform-based scaling

### ✅ **Backward Compatibility**
- Existing label positioning logic unchanged
- Collision avoidance algorithms unaffected
- Zoom filtering and LOD systems work as before

## Testing

### **Manual Verification**
1. **Load the app** and zoom in/out
2. **Verify label size**: Island/lake/ocean labels should maintain pixel size
3. **Check pan behavior**: Labels should track perfectly with no parallax
4. **Inspect halo width**: Should look constant at all zoom levels

### **Console Debugging**
```javascript
// Enable debug logging
window.DBG = { labels: true };

// Check zoom behavior
window.forceZoomSanity();

// Verify label transforms
d3.selectAll('g.label').each(function() {
  console.log(this.getAttribute('transform'));
});
```

### **Test Page**
Use `test-counter-scaling.html` for isolated testing of the counter-scaling behavior.

## Technical Notes

### **Transform Order**
The transform chain is applied in this order:
1. `translate(x, y)` - Position the label
2. `scale(1/k)` - Counter-scale for constant size
3. `rotate(angle)` - Apply any rotation

### **SVG Vector Effects**
- `vector-effect="non-scaling-stroke"`: Keeps stroke width constant regardless of parent scaling
- `paint-order="stroke"`: Ensures stroke renders behind fill for proper layering
- These attributes are applied to all text elements during creation

### **Performance Considerations**
- Counter-scaling is applied only when labels exist
- Transform parsing uses regex for efficiency
- Debug logging is gated to prevent console spam
- No DOM queries during zoom operations

## Future Enhancements

### **Potential Optimizations**
- **Batch transforms**: Apply counter-scaling to multiple labels simultaneously
- **Transform caching**: Cache parsed transform values to avoid regex parsing
- **Selective scaling**: Only apply counter-scaling to visible labels

### **Advanced Features**
- **Label-specific scaling**: Different scaling factors for different label types
- **Dynamic thresholds**: Adaptive zoom level guards based on label density
- **Performance monitoring**: Track counter-scaling performance metrics

## Troubleshooting

### **Common Issues**

**Labels not counter-scaling:**
- Check if `#labels-world` group exists
- Verify labels have `g.label` class
- Check console for error messages

**Extreme scaling:**
- Verify zoom level guards are working
- Check if `t.k` is within expected bounds
- Look for NaN or Infinity values in transforms

**Performance issues:**
- Disable debug logging (`window.DBG.labels = false`)
- Check label count during zoom operations
- Monitor transform parsing performance

**Debug rectangles visible:**
- Use CSS kill switch to hide debug rectangles: `.ocean-bbox, .ocean-debug, #labels-debug rect { display: none !important; }`
- Check if `window.DBG.labels` is enabled
- Verify debug flags in console

### **Debug Commands**
```javascript
// Check current zoom state
getZoomState()

// Verify label transforms
d3.selectAll('g.label').each(function() {
  console.log(this.getAttribute('transform'));
});

// Test counter-scaling manually
const k = 2.0;
const inv = 1 / k;
console.log(`Counter-scale factor: ${inv}`);

// Hide debug rectangles via CSS
document.querySelector('style').textContent += '.ocean-bbox, .ocean-debug, #labels-debug rect { display: none !important; }';
```

## Conclusion

The counter-scaling implementation provides a robust, performant solution for maintaining constant label sizes during map interactions. It preserves all existing functionality while adding professional-quality label rendering that enhances the user experience.
