# Urban Train - Procedural Map Generator

A web-based procedural map generator that creates realistic terrain with islands, lakes, coastlines, and interactive features using D3.js and Voronoi diagrams.

## Features

- **Procedural Terrain Generation**: Creates realistic maps using Poisson-disc sampling and Voronoi diagrams
- **Deterministic Generation**: Seeded random number generation for reproducible maps
- **Interactive Map Creation**: Generate maps with islands and hills automatically
- **Random Map Generation**: Generate maps with random terrain features
- **Smooth Zoom and Pan**: Navigate around the generated terrain with optimized performance
- **Real-time Information**: View cell data, height values, and feature names with optimized performance
- **Level-of-Detail (LOD)**: Automatic switching between raster and vector rendering for optimal performance
- **Performance Monitoring**: Built-in timing and performance analysis
- **Self-Testing**: Automatic validation and regression testing with visual feedback
- **Customizable Options**: Adjust various parameters like height, radius, sharpness, and more
- **Visual Effects**: Toggle grid lines, blur effects, and sea polygon rendering
- **Smart Labeling**: Automatic feature labeling with deduplication and proper placement
- **Label Scaling**: Toggle between scaling and constant-size label modes
- **Modular Architecture**: ES6 modules for maintainable code organization

## Technologies Used

- **D3.js v5**: For SVG manipulation, Voronoi diagrams, and data visualization
- **jQuery**: For DOM manipulation and event handling
- **HTML5/CSS3**: For structure and styling
- **ES6 Modules**: For modern JavaScript organization and modular architecture
- **Deterministic RNG**: Custom sfc32 + xmur3 implementation for seeded generation

## Getting Started

### Prerequisites

- A modern web browser (Chrome, Firefox, Safari, Edge)
- Python 3 (for local development server)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd urban-train
   ```

2. Start a local development server:
   ```bash
   python3 -m http.server 8080
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:8080
   ```

## How to Use

### Basic Controls

- **Random Map**: Creates a map with 5 random terrain features
- **Options**: Toggles the options panel for advanced settings

### Interactive Features

- **Mouse Movement**: See real-time information about the cell under your cursor (optimized with throttling and change detection)
- **Zoom**: Use mouse wheel or pinch gestures to zoom in/out (0.5x to 32x scale)
- **Pan**: Click and drag to move around the map
- **Auto-fit**: Automatically fits the map to show all land masses
- **Performance Optimized**: LOD system switches between raster and vector rendering based on zoom level

### Advanced Options

- **Points Radius**: Controls the density of the Voronoi cells
- **Max Height**: Sets the maximum height for terrain features
- **Blob Radius**: Controls how far terrain features spread
- **Blob Sharpness**: Adds randomness to terrain generation
- **Blur**: Adds stroke effects to terrain polygons
- **Show Grid**: Displays grid lines between cells
- **Draw Sea Polygons**: Shows/hides sea area polygons
- **Show Blob Centers**: Toggles visibility of terrain center points
- **Constant-size Labels**: Toggle between scaling and fixed-size label modes

### Self-Testing and Performance

- **Self-Test Badge**: Click the badge in the bottom-right corner to see test results
- **Performance Timing**: Check browser console for detailed timing information
- **Deterministic Maps**: Same seed produces identical terrain every time

## File Structure

```
urban-train/
├── index.html              # Main HTML file with UI controls
├── styles.css              # CSS styling for the application
├── src/
│   ├── main.js             # Main JavaScript application logic
│   ├── core/
│   │   ├── rng.js          # Deterministic, seedable RNG
│   │   └── timers.js       # Performance timing utilities
│   ├── modules/
│   │   ├── geometry.js     # Voronoi diagram and neighbor detection
│   │   ├── heightmap.js    # Terrain generation and height mapping
│   │   ├── features.js     # Geographic feature detection and naming
│   │   ├── coastline.js    # Coastline tracing and path generation
│   │   ├── rendering.js    # Polygon rendering and visual effects
│   │   └── interaction.js  # Zoom and hover HUD functionality
│   ├── render/
│   │   └── layers.js       # SVG layer management
│   └── selftest.js         # Regression testing and validation
├── README.md               # This file
└── CODEMAP.md              # Detailed code documentation
```

## Code Architecture

### Modular Components

1. **Core Modules**:
   - **RNG (`src/core/rng.js`)**: Deterministic, seedable random number generation
   - **Timers (`src/core/timers.js`)**: Performance monitoring and timing utilities
   - **Layers (`src/render/layers.js`)**: SVG layer management and organization
   - **Self-Tests (`src/selftest.js`)**: Validation and regression testing

2. **Feature Modules**:
   - **Geometry (`src/modules/geometry.js`)**: Voronoi diagram generation and neighbor detection
   - **Heightmap (`src/modules/heightmap.js`)**: Terrain generation and height mapping
   - **Features (`src/modules/features.js`)**: Geographic feature detection and naming
   - **Coastline (`src/modules/coastline.js`)**: Coastline tracing and path generation
   - **Rendering (`src/modules/rendering.js`)**: Polygon rendering and visual effects
   - **Interaction (`src/modules/interaction.js`)**: Zoom, pan, and hover HUD functionality with LOD optimization

3. **Map Generation (`generate` function)**:
   - Sets up SVG canvas and D3.js elements
   - Creates Poisson-disc sampling for natural point distribution
   - Generates Voronoi diagram from sampled points
   - Initializes interactive features via interaction module
   - Integrates modular components for timing and validation

4. **Terrain Generation (`add` function)**:
   - Adds height values to polygons based on user input
   - Spreads terrain features to neighboring cells
   - Supports different terrain types (islands vs hills)
   - Uses seeded RNG for deterministic behavior

5. **Feature Detection (`markFeatures` function)**:
   - Identifies oceans, islands, and lakes
   - Assigns random names to geographic features
   - Groups connected areas into coherent regions

6. **Coastline Generation (`drawCoastline` function)**:
   - Detects boundaries between land and water
   - Creates smooth coastline paths
   - Handles both island coastlines and lake shorelines
   - Marks shallow water areas

7. **Visualization (`drawPolygons` function from `src/modules/rendering.js`)**:
   - Renders terrain polygons with color-coded heights
   - Applies visual effects (blur, strokes)
   - Updates the display based on user settings
   - Manages sea cutoff logic and shallow water rendering

8. **Label Management (`computeMapLabels` and `drawLabels` functions)**:
   - Automatically generates labels for geographic features (Oceans, Islands, Lakes)
   - Deduplicates labels to prevent overlapping text
   - Calculates proper centroids for label placement
   - Supports both scaling and constant-size label modes
   - Uses keyed data joins to prevent label accumulation

9. **Interaction System (`attachInteraction` function)**:
   - Provides smooth zoom and pan functionality (0.5x to 32x scale)
   - Implements real-time hover HUD with cell information
   - Features Level-of-Detail (LOD) system for performance optimization
   - Uses spatial picking for efficient cell selection
   - Supports auto-fit functionality for optimal map viewing

### Key Algorithms

- **Poisson-disc Sampling**: Creates evenly distributed points for natural-looking terrain
- **Voronoi Diagrams**: Divides the map into cellular regions
- **Flood Fill**: Identifies connected regions (oceans, islands, lakes)
- **Path Finding**: Creates continuous coastline paths
- **Deterministic RNG**: sfc32 + xmur3 algorithms for reproducible generation
- **Performance Timing**: RequestAnimationFrame-based timing for accurate measurements
- **Level-of-Detail (LOD)**: Automatic switching between raster and vector rendering based on zoom level
- **Spatial Picking**: Efficient cell selection using spatial indexing instead of DOM hit-testing

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Development

### Local Development

1. Start the development server:
   ```bash
   python3 -m http.server 8000
   ```

2. Open `http://localhost:8000` in your browser

3. Make changes to the code and refresh the page to see updates

### Debugging

- Open browser developer tools (F12)
- Check the console for any JavaScript errors and performance timing data
- Use the network tab to verify all resources are loading
- Click the self-test badge for validation results
- Check console.table output for detailed timing information

### Modular Architecture

The project has been refactored with a comprehensive modular architecture:
- **Deterministic generation** with seeded RNG
- **Performance monitoring** with built-in timers
- **Self-testing** with visual feedback
- **ES6 modules** for maintainable code organization
- **Feature extraction** into specialized modules (geometry, heightmap, features, coastline, rendering, interaction)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the [MIT License](LICENSE).

## Acknowledgments

- **D3.js**: For powerful data visualization capabilities
- **Poisson-disc Sampling**: Algorithm adapted from Jason Davies' implementation
- **Voronoi Diagrams**: For creating natural cellular terrain patterns
