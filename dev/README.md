# Development Tools

This directory contains debugging tools and test pages for the Urban Train procedural map generator.

## Debug Scripts

### `debug-labels.js`
**Purpose**: Comprehensive label system diagnostics for browser console

**Usage**:
1. Open the main app (`index.html`) in your browser
2. Open browser console (F12)
3. Run: `debugLabels()`

**What it does**:
- Inspects all placed labels and their properties
- Checks for placement issues (distance from features, overlaps)
- Validates DOM structure and transforms
- Reports statistics on label distribution by type
- Identifies potential problems with collision avoidance

## Test Pages

### `test-labels-v2.1.html`
**Purpose**: Comprehensive testing of the Labels v2.1 system

**How to run**:
```bash
# Start a local server (if not already running)
python3 -m http.server 8000

# Open in browser
http://localhost:8000/dev/test-labels-v2.1.html
```

**Tests**:
- Label generation for all feature types (oceans, lakes, islands)
- Collision avoidance with cluster jiggling
- Size-based zoom filtering
- Label placement and rendering
- DOM structure validation

### `test-collision-zoom.html`
**Purpose**: Interactive testing of collision avoidance and zoom filtering

**How to run**:
```bash
http://localhost:8000/dev/test-collision-zoom.html
```

**Features**:
- Interactive collision detection testing
- Real-time zoom controls with slider
- Size-based filtering verification
- Overlap analysis and statistics
- Performance monitoring

### `test-label-zoom.html`
**Purpose**: Focused testing of zoom behavior and label visibility

**How to run**:
```bash
http://localhost:8000/dev/test-label-zoom.html
```

**Tests**:
- Progressive label disclosure based on zoom level
- Size-based visibility thresholds
- Smooth transitions during zoom
- Performance during zoom operations

### `test-names.html`
**Purpose**: Testing the fantasy naming system

**How to run**:
```bash
http://localhost:8000/dev/test-names.html
```

**Tests**:
- Ocean name generation with size variations
- Lake name generation with size variations
- Island name generation with cluster size variations
- Name uniqueness and variety
- Flavor pack testing

### `test-refine.html`
**Purpose**: Testing coastline refinement system

**How to run**:
```bash
http://localhost:8000/dev/test-refine.html
```

**Tests**:
- Coastal point addition and refinement
- Voronoi diagram rebuilding
- Height and feature preservation
- Performance impact of refinement

### `test-svg-zoom.html`
**Purpose**: Testing SVG zoom behavior and transforms

**How to run**:
```bash
http://localhost:8000/dev/test-svg-zoom.html
```

**Tests**:
- D3 zoom behavior integration
- Transform application and updates
- Coordinate system conversions
- Performance during zoom operations

### `test-event-capture.html`
**Purpose**: Testing event handling and capture

**How to run**:
```bash
http://localhost:8000/dev/test-event-capture.html
```

**Tests**:
- Mouse event capture and handling
- Touch event support
- Event propagation and bubbling
- Performance of event handlers

### `test-event-surface.html`
**Purpose**: Testing interactive surface behavior

**How to run**:
```bash
http://localhost:8000/dev/test-event-surface.html
```

**Tests**:
- Interactive surface detection
- Hover and click handling
- Spatial picking accuracy
- Performance of interactive features

## Quick Start

1. **Start development server**:
   ```bash
   python3 -m http.server 8000
   ```

2. **Open main app**:
   ```
   http://localhost:8000/index.html
   ```

3. **Run debug tools**:
   - Open browser console
   - Run `debugLabels()` for comprehensive diagnostics
   - Use `window.DEBUG = true` to enable verbose logging

4. **Test specific features**:
   - Open relevant test page from `/dev/`
   - Follow instructions in browser console
   - Check for any errors or warnings

## Debugging Tips

### Enable Debug Mode
```javascript
// In browser console
window.DEBUG = true;  // Enables verbose logging
debugLabels();        // Run comprehensive diagnostics
```

### Common Issues
- **Labels not appearing**: Check zoom level and size thresholds
- **Performance issues**: Monitor console for timing information
- **Collision problems**: Use `test-collision-zoom.html` for detailed analysis
- **Naming issues**: Use `test-names.html` to verify name generation

### Performance Monitoring
```javascript
// Check performance timers
Timers.report();

// Toggle performance HUD
window.toggleHUD();

// Toggle labels for performance testing
window.toggleLabels();
```

## File Structure

```
dev/
├── README.md              # This file
├── debug-labels.js        # Console debugging script
├── test-labels-v2.1.html  # Comprehensive label testing
├── test-collision-zoom.html # Collision avoidance testing
├── test-label-zoom.html   # Zoom behavior testing
├── test-names.html        # Fantasy naming testing
├── test-refine.html       # Coastline refinement testing
├── test-svg-zoom.html     # SVG zoom testing
├── test-event-capture.html # Event handling testing
└── test-event-surface.html # Interactive surface testing
```
