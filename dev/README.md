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

## SA Labeler Test Pages

### `test-feature-flag.html`
**Purpose**: Testing the SA labeler feature flag system

**How to run**:
```bash
http://localhost:8000/test-feature-flag.html
```

**Tests**:
- Feature flag status verification
- Toggle between SA and original systems
- Label placement comparison
- System status reporting

### `test-d3-labeler.html`
**Purpose**: Testing the D3-Labeler plugin integration

**How to run**:
```bash
http://localhost:8000/test-d3-labeler.html
```

**Tests**:
- D3-Labeler plugin loading
- Plugin API functionality
- Basic annealing operations
- Plugin integration verification

### `test-label-metrics.html`
**Purpose**: Testing label metrics computation for SA labeler

**How to run**:
```bash
http://localhost:8000/test-label-metrics.html
```

**Tests**:
- Font size calculation by label type
- Text width measurement
- Anchor point generation
- Metrics structure validation

### `test-anneal-labels.html`
**Purpose**: Testing the annealer wrapper function

**How to run**:
```bash
http://localhost:8000/test-anneal-labels.html
```

**Tests**:
- Annealer wrapper functionality
- Coordinate transformation
- Bounds handling
- Result validation

### `test-sa-integration.html`
**Purpose**: Testing the complete SA labeler integration

**How to run**:
```bash
http://localhost:8000/test-sa-integration.html
```

**Tests**:
- Complete SA integration workflow
- Cluster-based processing
- Label placement optimization
- Visual comparison of before/after

### `test-ocean-polishing.html`
**Purpose**: Testing ocean label polishing with keepWithinRect

**How to run**:
```bash
http://localhost:8000/test-ocean-polishing.html
```

**Tests**:
- Ocean label optimization within bounds
- Neighbor inclusion in ocean rects
- Boundary constraint handling
- Ocean-specific optimization

### `test-performance-guardrails.html`
**Purpose**: Testing performance guardrails and debug features

**How to run**:
```bash
http://localhost:8000/test-performance-guardrails.html
```

**Tests**:
- Performance guardrails for different cluster sizes
- Debug mode functionality
- Overlap detection and reporting
- SA labeler status and controls

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

## Additional Test Pages

### `test-counter-scaling.html`
**Purpose**: Testing counter-scaling label implementation

**How to run**:
```bash
http://localhost:8000/dev/test-counter-scaling.html
```

**Tests**:
- Counter-scaling behavior during zoom operations
- Label size consistency across zoom levels
- Pan and zoom interaction with labels
- Vector-effect attributes for constant halo width

### `test-ocean-placement-verification.html`
**Purpose**: Testing ocean label placement verification

**How to run**:
```bash
http://localhost:8000/dev/test-ocean-placement-verification.html
```

**Tests**:
- Ocean label placement accuracy
- Rectangle boundary validation
- Placement verification algorithms
- Debug visualization and reporting

### `test-fantasy-fonts.html`
**Purpose**: Testing fantasy font system

**How to run**:
```bash
http://localhost:8000/dev/test-fantasy-fonts.html
```

**Tests**:
- Fantasy font loading and rendering
- Font family switching
- Typography consistency
- Font performance and fallbacks

### `test-idempotent-zoom.html`
**Purpose**: Testing idempotent zoom behavior

**How to run**:
```bash
http://localhost:8000/dev/test-idempotent-zoom.html
```

**Tests**:
- Zoom operation idempotency
- Transform consistency
- State preservation during zoom
- Performance of repeated zoom operations

### `test-ocean-rectangle.html`
**Purpose**: Testing ocean rectangle calculations

**How to run**:
```bash
http://localhost:8000/dev/test-ocean-rectangle.html
```

**Tests**:
- Ocean rectangle computation
- Boundary detection algorithms
- Rectangle optimization
- Visual validation of rectangles

### `test-autofit-improvements.html`
**Purpose**: Testing autofit system improvements

**How to run**:
```bash
http://localhost:8000/dev/test-autofit-improvements.html
```

**Tests**:
- Autofit algorithm enhancements
- Land bounding box calculations
- Viewport optimization
- Performance improvements

### `test-pan-to-fit.html`
**Purpose**: Testing pan-to-fit functionality

**How to run**:
```bash
http://localhost:8000/dev/test-pan-to-fit.html
```

**Tests**:
- Pan-to-fit algorithm
- Coordinate calculations
- Viewport adjustments
- Smooth transitions

### `test-placeOceanLabelInRect.html`
**Purpose**: Testing ocean label placement within rectangles

**How to run**:
```bash
http://localhost:8000/dev/test-placeOceanLabelInRect.html
```

**Tests**:
- Ocean label placement algorithms
- Rectangle boundary constraints
- Text fitting and scaling
- Placement optimization

### `test-scoring.html`
**Purpose**: Testing scoring system for label placement

**How to run**:
```bash
http://localhost:8000/dev/test-scoring.html
```

**Tests**:
- Scoring algorithms
- Energy function calculations
- Optimization metrics
- Performance evaluation

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
├── README.md                           # This file
├── debug-labels.js                     # Console debugging script
├── test-labels-v2.1.html              # Comprehensive label testing
├── test-labels-v2.html                 # Labels v2 system testing
├── test-collision-zoom.html            # Collision avoidance testing
├── test-label-zoom.html                # Zoom behavior testing
├── test-names.html                     # Fantasy naming testing
├── test-refine.html                    # Coastline refinement testing
├── test-svg-zoom.html                  # SVG zoom testing
├── test-event-capture.html             # Event handling testing
├── test-event-surface.html             # Interactive surface testing
├── test-ocean-rectangle.html           # Ocean rectangle testing
├── test-counter-scaling.html           # Counter-scaling label testing
├── test-ocean-placement-verification.html # Ocean placement verification
├── test-fantasy-fonts.html             # Fantasy fonts testing
├── test-idempotent-zoom.html           # Idempotent zoom testing
├── test-performance-guardrails.html    # Performance guardrails testing
├── test-ocean-polishing.html           # Ocean label polishing testing
├── test-sa-integration.html            # SA labeler integration testing
├── test-anneal-labels.html             # Annealer wrapper testing
├── test-label-metrics.html             # Label metrics testing
├── test-d3-labeler.html                # D3-Labeler plugin testing
├── test-feature-flag.html              # Feature flag testing
├── test-sat-ocean-placement.html       # SAT ocean placement testing
├── test-autofit-improvements.html      # Autofit improvements testing
├── test-autofit-promise.html           # Autofit promise testing
├── test-pan-to-fit.html                # Pan to fit testing
├── test-placeOceanLabelInRect.html     # Ocean label rect placement testing
└── test-scoring.html                   # Scoring system testing
```
