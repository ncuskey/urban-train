# Phase 0 Implementation - Drop-in Files + main.js Patch

This document describes the Phase 0 implementation that adds four new modules and patches the existing `main.js` to integrate them.

## New Modules Added

### 1. `src/core/rng.js`
- **Purpose**: Deterministic, seedable RNG using sfc32 + xmur3 algorithms
- **Features**: 
  - Seeded random number generation
  - Helper methods: `random()`, `int()`, `float()`, `bool()`, `pick()`, `shuffle()`
  - Global singleton for quick access

### 2. `src/core/timers.js`
- **Purpose**: Lightweight performance timers with console logging
- **Features**:
  - Mark/lap timing functionality
  - Summary generation for console.table output
  - Clear method for resetting timers

### 3. `src/render/layers.js`
- **Purpose**: Centralized SVG layer management
- **Features**:
  - Creates missing SVG groups in proper stacking order
  - Returns a map of layer references
  - Clear layer functionality

### 4. `src/selftest.js`
- **Purpose**: Minimal invariants to catch regressions early
- **Features**:
  - Graph neighbor reciprocity tests
  - Height range validation (0..1)
  - River width validation
  - SVG layer presence validation
  - Visual badge display

## Changes to main.js

### Imports Added
```javascript
import { RNG } from "./core/rng.js";
import { Timers } from "./core/timers.js";
import { ensureLayers } from "./render/layers.js";
import { runSelfTests, renderSelfTestBadge } from "./selftest.js";
```

### Global State
- Added `state` object with `seed` property
- Created `rng` and `timers` singletons

### Random Number Generation
- Replaced all `Math.random()` calls with `rng.random()`
- Replaced `Math.floor(Math.random() * n)` with `rng.int(0, n-1)`
- Replaced array picking with `rng.pick(array)`

### Timing Integration
- Added `timers.clear()` and `timers.mark('generate')` at start
- Added `timers.lap('generate', 'Generate() – total')` at end
- Added `console.table(timers.summary())` for performance logging

### Self-Tests Integration
- Added cache object creation with graph, height, and rivers data
- Added `runSelfTests()` call with cache and DOM data
- Added `renderSelfTestBadge()` call for visual feedback

## Testing

### Quick Smoke Test Checklist
1. **Page loads with no console errors** - Open index.html and check browser console
2. **generate() prints timing summary** - Look for console.table output after generation
3. **Self-tests badge appears** - Check bottom-right corner for "Self-tests: X/Y" badge
4. **Deterministic generation** - Re-run with same seed produces identical terrain

### Test Commands
```bash
# Start local server
python3 -m http.server 8000

# Open in browser
open http://localhost:8000

# Test modules independently
open http://localhost:8000/test.html
```

### Manual Testing
1. Open the main page and check console for any errors
2. Click "Random map" button and verify:
   - Console shows timing table
   - Self-test badge appears
   - Map generates successfully
3. Check that the same seed produces identical results

## Global Access
The following objects are made available globally for debugging:
- `window.state` - State object with current seed
- `window.rng` - RNG instance for manual testing
- `window.generate` - Generate function
- `window.undraw` - Undraw function

## Next Steps (Phase 1 Preview)
- Extract `src/core/geometry.js` (`buildVoronoi`, `ensurePolys`)
- Extract `src/terrain/height.js` (mask+noise+normalize)
- Leave DOM writes in place until Phase 4

## Troubleshooting

### Common Issues
1. **CORS errors**: Make sure to serve files via HTTP server, not file:// protocol
2. **Module not found**: Check that all files are in correct directories
3. **Console errors**: Check browser console for specific error messages

### Debugging
- Use `console.log(window.rng.seed)` to check current seed
- Use `console.table(window.timers.summary())` to see timing data
- Check `window.state` for current state object
