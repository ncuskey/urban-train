# SA Labeler Migration - Feature Flag Setup

## Overview
This document tracks the migration from the current label placement system to a new Simulated Annealing (SA) labeler.

## Feature Flag: `USE_SA_LABELER`

**Location**: `src/modules/labels.js` (line 4)

**Current State**: `true` (enabled)

### How to Toggle

1. **Enable SA Labeler** (current):
   ```javascript
   export const USE_SA_LABELER = true;
   ```

2. **Disable SA Labeler** (revert to current system):
   ```javascript
   export const USE_SA_LABELER = false;
   ```

### What the Flag Controls

The feature flag currently controls the `placeLabelsAvoidingCollisions()` function:

- **When `true`**: Logs a message indicating SA labeler is active (placeholder for now)
- **When `false`**: Uses the current collision avoidance system

## Testing

### Test Page
Use `test-feature-flag.html` to verify the flag is working:

1. Open `test-feature-flag.html` in your browser
2. Check the "Feature Flag Status" section
3. Click "Test Labeler" to see console output
4. The console should show the current flag state

### Manual Testing
1. Load the main application (`index.html`)
2. Open browser console
3. Look for the message: `[labels] Using new SA labeler (placeholder - current system still active)`
4. Verify labels still appear correctly

## Migration Steps

### ✅ Step 0: Safety Rails (COMPLETED)
- [x] Added feature flag `USE_SA_LABELER`
- [x] Modified `placeLabelsAvoidingCollisions()` to check flag
- [x] Created test page for verification
- [x] Current system remains functional

### ✅ Step 1: Vendor D3-Labeler Plugin (COMPLETED)
- [x] Downloaded `labeler.js` from [D3-Labeler repository](https://github.com/tinker10/D3-Labeler)
- [x] Created `vendor/d3-labeler/` directory structure
- [x] Added script tag to `index.html` between D3 and jQuery
- [x] Created test page `test-d3-labeler.html` to verify plugin loading
- [x] Plugin attaches as `d3.labeler` on the global d3 object

### ✅ Step 2: Normalize Anchors and Dimensions (COMPLETED)
- [x] Added `computeLabelMetrics()` function to prepare label data for SA labeler
- [x] Computes font sizes based on label kind (ocean: 28px, lake: 14px, island: 12px)
- [x] Measures text width using existing `measureTextWidth()` function
- [x] Calculates height based on font size (font * 0.9)
- [x] Creates anchor points with small radius (3px) at component centroids
- [x] Created test page `test-label-metrics.html` to verify function works correctly

### ✅ Step 3: Add Annealer Wrapper (COMPLETED)
- [x] Added `annealLabels()` function as wrapper around D3-Labeler plugin
- [x] Supports optional bounds for local coordinate systems
- [x] Handles coordinate transformations (world ↔ local)
- [x] Configurable number of sweeps (default: 400)
- [x] Returns labels with `placed` coordinates in world space
- [x] Created test page `test-anneal-labels.html` with visualization

### ✅ Step 4: SA Integration for Lake/Island Labels (COMPLETED)
- [x] Modified `placeLabelsAvoidingCollisions()` to use SA labeler for lake/island labels
- [x] Oceans are kept as-is (using original system)
- [x] Uses `findLabelClusters()` to group nearby labels
- [x] Computes loose cluster bounds with 64px padding
- [x] Dynamic sweeps calculation: `Math.min(600, 200 + members.length * 2)`
- [x] Merges skipped labels (oceans, small clusters) with original centroids
- [x] Maintains existing LOD and zoom scaling
- [x] Created test page `test-sa-integration.html` with visualization

### ✅ Step 5: Ocean Polishing with keepWithinRect (COMPLETED)
- [x] Added ocean polishing for labels with `keepWithinRect` boundaries
- [x] Oceans stay within their designated water rectangles
- [x] Includes neighboring labels that fall inside the ocean rect
- [x] Uses local coordinate system with rect bounds
- [x] Fixed 400 sweeps for ocean polishing
- [x] Processes oceans after lake/island clusters
- [x] Maintains proper label ordering and processing
- [x] Created test page `test-ocean-polishing.html` with visualization

### ✅ Step 6: LOD & Zoom Transforms Unchanged (COMPLETED)
- [x] `updateLabelVisibility()` remains unchanged
- [x] `updateLabelZoom()` updated for idempotent styling (see LABEL_FIXES.md)
- [x] Inverse-scale transforms preserved exactly as-is
- [x] Bucketed `filterByZoom()` function unchanged
- [x] All existing LOD and zoom functionality maintained

### ✅ Step 7: Debug Toggle & Fallback Path (COMPLETED)
- [x] Original `placeLabelsAvoidingCollisions` code preserved as fallback
- [x] `USE_SA_LABELER` flag allows instant switching between old/new systems
- [x] Added `toggleSALabeler()` and `getSALabelerStatus()` debug functions
- [x] Debug mode can be enabled/disabled via `window.DEBUG`

### ✅ Step 8: Performance Guardrails (COMPLETED)
- [x] Skip annealing for clusters of size 1-2 (no benefit)
- [x] Dynamic sweeps: `clamp(200 + 2 * clusterSize, 200, 800)`
- [x] Large clusters (>60 labels): reduce sweeps by ~30%
- [x] Ocean polishing: smaller sweeps (300-500) since rectangle did most work
- [x] Added `checkRemainingOverlaps()` for post-assertion collision detection
- [x] Debug overlap details available via `window.DEBUG_OVERLAPS`
- [x] Created test page `test-performance-guardrails.html`

### 🔄 Next Steps
1. **Step 1**: ✅ Vendor the D3-Labeler plugin (COMPLETED)
2. **Step 2**: ✅ Normalize anchors and dimensions (COMPLETED)
3. **Step 3**: ✅ Add annealer wrapper (COMPLETED)
4. **Step 4**: ✅ SA integration for lake/island labels (COMPLETED)
5. **Step 5**: ✅ Ocean polishing with keepWithinRect (COMPLETED)
6. **Step 6**: ✅ LOD & zoom transforms unchanged (COMPLETED)
7. **Step 7**: ✅ Debug toggle & fallback path (COMPLETED)
8. **Step 8**: ✅ Performance guardrails (COMPLETED)
9. **Step 9**: Add SA-specific configuration options
10. **Step 10**: Performance testing and optimization
11. **Step 11**: Gradual rollout with A/B testing
12. **Step 12**: Remove feature flag and old system

## Current System Behavior

When `USE_SA_LABELER = true`:
- Console logs: `[labels] Using new SA labeler (placeholder - current system still active)`
- Falls through to current collision avoidance algorithm
- No functional changes to label placement

When `USE_SA_LABELER = false`:
- Uses current collision avoidance system directly
- No console logging about SA labeler

## Safety Notes

- The feature flag is **safe to toggle** at any time
- Current system remains fully functional regardless of flag state
- No breaking changes have been introduced
- All existing tests should continue to pass

## Files Modified

- `src/modules/labels.js` - Added feature flag, conditional logic, computeLabelMetrics, annealLabels, SA integration, ocean polishing, performance guardrails, and debug functions
- `test-feature-flag.html` - Created test page for verification
- `SA_LABELER_MIGRATION.md` - This documentation file
- `index.html` - Added D3-Labeler script tag
- `vendor/d3-labeler/labeler.js` - Downloaded D3-Labeler plugin
- `test-d3-labeler.html` - Created test page for plugin verification
- `test-label-metrics.html` - Created test page for label metrics verification
- `test-anneal-labels.html` - Created test page for annealer wrapper verification
- `test-sa-integration.html` - Created test page for SA integration verification
- `test-ocean-polishing.html` - Created test page for ocean polishing verification
- `test-performance-guardrails.html` - Created test page for performance guardrails verification
