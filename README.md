# Urban Train - Procedural Map Generator

A web-based procedural map generator that creates realistic terrain with islands, lakes, coastlines, and interactive features using D3.js and Voronoi diagrams.

## Features

- **Procedural Terrain Generation**: Creates realistic maps using Poisson-disc sampling and Voronoi diagrams
- **Interactive Map Creation**: Generate maps with islands and hills automatically
- **Random Map Generation**: Generate maps with random terrain features
- **Zoom and Pan**: Navigate around the generated terrain
- **Real-time Information**: View cell data, height values, and feature names
- **Customizable Options**: Adjust various parameters like height, radius, sharpness, and more
- **Visual Effects**: Toggle grid lines, blur effects, and sea polygon rendering

## Technologies Used

- **D3.js v5**: For SVG manipulation, Voronoi diagrams, and data visualization
- **jQuery**: For DOM manipulation and event handling
- **HTML5/CSS3**: For structure and styling
- **ES6 Modules**: For modern JavaScript organization

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

- **New Map**: Clears the current map and generates a fresh one
- **Random Map**: Creates a map with 5 random terrain features
- **Options**: Toggles the options panel for advanced settings
- **Reset Zoom**: Resets the zoom level to default

### Interactive Features

- **Mouse Movement**: See real-time information about the cell under your cursor
- **Zoom**: Use mouse wheel or pinch gestures to zoom in/out
- **Pan**: Click and drag to move around the map

### Advanced Options

- **Points Radius**: Controls the density of the Voronoi cells
- **Max Height**: Sets the maximum height for terrain features
- **Blob Radius**: Controls how far terrain features spread
- **Blob Sharpness**: Adds randomness to terrain generation
- **Blur**: Adds stroke effects to terrain polygons
- **Show Grid**: Displays grid lines between cells
- **Draw Sea Polygons**: Shows/hides sea area polygons
- **Show Blob Centers**: Toggles visibility of terrain center points

## File Structure

```
urban-train/
├── index.html          # Main HTML file with UI controls
├── styles.css          # CSS styling for the application
├── src/
│   └── main.js         # Main JavaScript application logic
└── README.md           # This file
```

## Code Architecture

### Main Components

1. **Map Generation (`generate` function)**:
   - Sets up SVG canvas and D3.js elements
   - Creates Poisson-disc sampling for natural point distribution
   - Generates Voronoi diagram from sampled points
   - Initializes interactive features (zoom, pan, click handlers)

2. **Terrain Generation (`add` function)**:
   - Adds height values to polygons based on user input
   - Spreads terrain features to neighboring cells
   - Supports different terrain types (islands vs hills)

3. **Feature Detection (`markFeatures` function)**:
   - Identifies oceans, islands, and lakes
   - Assigns random names to geographic features
   - Groups connected areas into coherent regions

4. **Coastline Generation (`drawCoastline` function)**:
   - Detects boundaries between land and water
   - Creates smooth coastline paths
   - Handles both island coastlines and lake shorelines

5. **Visualization (`drawPolygons` function)**:
   - Renders terrain polygons with color-coded heights
   - Applies visual effects (blur, strokes)
   - Updates the display based on user settings

### Key Algorithms

- **Poisson-disc Sampling**: Creates evenly distributed points for natural-looking terrain
- **Voronoi Diagrams**: Divides the map into cellular regions
- **Flood Fill**: Identifies connected regions (oceans, islands, lakes)
- **Path Finding**: Creates continuous coastline paths

## Browser Compatibility

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Development

### Local Development

1. Start the development server:
   ```bash
   python3 -m http.server 8080
   ```

2. Open `http://localhost:8080` in your browser

3. Make changes to the code and refresh the page to see updates

### Debugging

- Open browser developer tools (F12)
- Check the console for any JavaScript errors
- Use the network tab to verify all resources are loading

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
