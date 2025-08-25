# Code Map - Urban Train Map Generator

## Overview

This document provides a detailed map of the codebase structure, functions, and their relationships for the Urban Train procedural map generator.

## File Structure

```
urban-train/
├── index.html          # Main HTML interface
├── styles.css          # Application styling
├── src/
│   └── main.js         # Core application logic
├── README.md           # Project documentation
└── CODEMAP.md          # This file
```

## HTML Structure (index.html)

### Key Elements
- **SVG Canvas**: 640x360 pixel map area with filters and patterns
- **Control Panel**: Buttons for map generation and navigation
- **Options Panel**: Collapsible settings for terrain customization
- **Debug Display**: Real-time cell information display

### Dependencies
- D3.js v5 (CDN)
- jQuery 3.6.0 (CDN)
- Local CSS and JavaScript files

## CSS Structure (styles.css)

### Layout Classes
- `.controls`: Main control button container
- `.options-panel`: Collapsible settings panel
- `.options-left/.options-right`: Settings layout divisions

### SVG Styling
- Map cell colors and strokes
- Coastline and feature styling
- Interactive element states

## JavaScript Architecture (src/main.js)

### Global Functions (Window Object)

#### `generate(count)`
**Purpose**: Main initialization and map generation function
**Parameters**: 
- `count` (optional): Number of random features to generate
**Key Operations**:
- Sets up SVG canvas and D3.js elements
- Creates Poisson-disc sampling
- Generates Voronoi diagram
- Initializes interactive features
- Calls `randomMap(count)` if count provided

#### `undraw()`
**Purpose**: Clears the current map and resets settings
**Operations**:
- Removes all SVG groups and paths
- Resets input values to defaults

#### `toggleOptions()`
**Purpose**: Shows/hides the options panel
**Operations**:
- Toggles `hidden` attribute on options panel

#### `toggleBlobCenters()`
**Purpose**: Shows/hides terrain center points
**Operations**:
- Toggles visibility of `.circles` elements

### Core Map Generation Functions

#### `poissonDiscSampler(width, height, radius)`
**Purpose**: Creates evenly distributed points for natural terrain
**Returns**: Function that generates sample points
**Algorithm**: Based on Jason Davies' implementation
**Key Features**:
- Maintains minimum distance between points
- Uses grid-based optimization
- Generates points until no more can fit

#### `detectNeighbors()`
**Purpose**: Identifies adjacent cells for each polygon
**Operations**:
- Iterates through Voronoi diagram cells
- Finds shared edges between polygons
- Stores neighbor indices in polygon objects

#### `add(start, type)`
**Purpose**: Adds terrain features to the map
**Parameters**:
- `start`: Index of starting polygon
- `type`: "island" or "hill"
**Algorithm**:
- Flood-fill approach spreading from start point
- Height decreases with distance from center
- Supports different spreading patterns for islands vs hills

### Visualization Functions

#### `drawPolygons()`
**Purpose**: Renders terrain polygons with colors and effects
**Operations**:
- Removes existing polygons
- Creates new paths based on height values
- Applies color interpolation
- Handles visual effects (blur, strokes)

#### `markFeatures()`
**Purpose**: Identifies and names geographic features
**Algorithm**:
- Flood-fill to identify connected regions
- Classifies areas as Ocean, Island, or Lake
- Assigns random names from adjective list
**Features**:
- Ocean detection from corner point
- Island/lake classification by height
- Connected region grouping

#### `drawCoastline()`
**Purpose**: Creates smooth coastline boundaries
**Algorithm**:
- Detects edges between land and water
- Groups edges by feature type
- Creates continuous paths using D3 line generator
**Features**:
- Handles both island and lake coastlines
- Creates smooth curved paths
- Supports shallow water detection

### Interactive Features

#### Click Handler
**Purpose**: Adds terrain on map clicks
**Logic**:
- First click creates island
- Subsequent clicks create hills
- Updates settings automatically
- Triggers map redraw

#### Mouse Movement Handler (`moved()`)
**Purpose**: Provides real-time cursor information with optimized performance
**Displays**:
- Current cell index
- Height value
- Feature name and type
**Performance Optimizations**:
- RequestAnimationFrame throttling for smooth updates
- Change detection to only update when cell changes
- Vanilla DOM updates instead of jQuery for faster performance
- Removed visual cursor indicator for better performance

#### Zoom and Pan
**Purpose**: Navigation controls
**Implementation**:
- D3 zoom behavior
- Scale limits (1-50x)
- Smooth transitions
- Reset functionality

### Random Map Generation

#### `randomMap(count)`
**Purpose**: Creates maps with random terrain features
**Algorithm**:
- Creates one large island in center area
- Adds smaller hills in surrounding areas
- Ensures proper spacing and positioning
- Applies random height variations

### Utility Functions

#### `toggleBlur()`
**Purpose**: Adds/removes blur effects on terrain
**Operations**:
- Creates stroke effects on polygons
- Adjustable stroke width
- Respects sea polygon settings

#### `toggleStrokes()`
**Purpose**: Shows/hides grid lines between cells
**Operations**:
- Adds grey strokes to polygons
- Toggle-based visibility
- Respects height thresholds

## Data Structures

### Polygon Objects
```javascript
{
  index: number,           // Cell index
  height: number,          // Terrain height (0-1)
  neighbors: [number],     // Adjacent cell indices
  featureType: string,     // "Ocean", "Island", "Lake"
  featureName: string,     // Random adjective name
  featureNumber: number    // Feature instance number
}
```

### Edge Objects
```javascript
{
  start: string,           // "x y" coordinates
  end: string,             // "x y" coordinates
  type: string,            // "Island" or "Lake"
  number: number           // Feature number
}
```

## Key Algorithms

### 1. Poisson-disc Sampling
- **Purpose**: Natural point distribution
- **Complexity**: O(n log n)
- **Features**: Minimum distance enforcement, grid optimization

### 2. Voronoi Diagram Generation
- **Purpose**: Cellular terrain division
- **Implementation**: D3.js voronoi()
- **Features**: Bounded extent, polygon generation

### 3. Flood Fill
- **Purpose**: Connected region identification
- **Implementation**: Queue-based breadth-first search
- **Features**: Height-based classification, name assignment

### 4. Coastline Path Finding
- **Purpose**: Continuous boundary creation
- **Algorithm**: Edge traversal and path construction
- **Features**: Smooth curves, feature-specific paths

## Event Flow

1. **Page Load**: `generate()` called automatically
2. **User Interaction**: Click handlers trigger terrain addition
3. **Map Update**: `drawPolygons()`, `markFeatures()`, `drawCoastline()` called
4. **Visual Feedback**: Real-time cursor information updates
5. **Settings Changes**: Option toggles trigger visual updates

## Performance Considerations

- **Voronoi Generation**: O(n log n) complexity
- **Flood Fill**: O(n) for each feature
- **Rendering**: Efficient D3.js updates
- **Memory**: Polygon objects stored in memory
- **Optimization**: Grid-based neighbor detection
- **Hover Performance**: RequestAnimationFrame throttling and change detection
- **DOM Updates**: Vanilla JavaScript for high-frequency UI updates
- **Visual Effects**: Removed unnecessary cursor rendering for better performance

## Browser Compatibility

- **ES6 Modules**: Modern browser support required
- **D3.js v5**: Compatible with Chrome 60+, Firefox 55+
- **SVG Support**: Universal modern browser support
- **Touch Events**: Mobile-friendly interaction

## Future Enhancements

- **WebGL Rendering**: For larger maps
- **Save/Load**: Map persistence
- **Export**: Image and data export
- **Advanced Terrain**: Rivers, mountains, biomes
- **Multiplayer**: Collaborative map creation
