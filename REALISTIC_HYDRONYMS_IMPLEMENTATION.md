# Realistic Hydronyms & Islands Implementation

## Overview

This implementation creates realistic fantasy names for oceans, lakes, and islands with no tautologies (e.g., no "Basin Lake" or "Island Island"). The naming system is size-aware and collision-safe.

## Key Features

### 1. No Tautologies
- **Oceans**: One terminal type word (Sea | Ocean | Gulf | Bight | Expanse | Reach | Deeps) OR classical forms (Mare | Thalassa | Pelagos) — never both
- **Lakes**: Either "Lake X"/"X Lake" OR standalone type words (Mere/Loch/Tarn/Basin/Lagoon) — never "Basin Lake"
- **Islands**: Singular (Island/Isle/Islet/Atoll/Cay/Key) vs plural (Isles/Keys/Skerries) chosen by cluster size; never "Keys Island"

### 2. Size-Aware Naming
- **Oceans**: Pass normalized area (0..1) for appropriate term selection
- **Lakes**: Pass relative area for size-appropriate naming (small → more "Tarn/Mere")
- **Islands**: Pass cluster size (1 = singular, >1 = plural)

### 3. Collision-Safe
- Unique name enforcement with fallback numbering
- 60 attempts before adding numeric disambiguator

## Implementation Details

### Files Modified

1. **`src/modules/names.js`** - Complete rewrite with new naming system
2. **`src/modules/features.js`** - Updated to pass size information to namer
3. **`src/main.js`** - Fixed label rendering to not append type words
4. **`src/modules/interaction.js`** - Fixed HUD formatters to not append type words

### Naming Patterns

#### Oceans
```javascript
// 35% classical forms
"Mare Noctis", "Thalassa of Echoes", "Azure Pelagos"

// 65% modern forms (one terminal term only)
"The Deep Sea", "Sea of Dragons", "Crimson Tempest Ocean"
```

#### Lakes
```javascript
// 45% Lake X / X Lake
"Lake Sorrow", "Shimmering Lake"

// 55% standalone types
"Lotus Mere", "Azure Tarn", "Golden Basin"
```

#### Islands
```javascript
// Singular (clusterSize = 1)
"Dragon Isle", "Verdant Island"

// Plural (clusterSize > 1)
"Isles of Echoes", "Keys of Sorrow"
```

## API Changes

### Old API
```javascript
const namer = makeNamer(rng, flavor);
namer.ocean();    // No size info
namer.lake();     // No size info  
namer.island();   // No cluster info
```

### New API
```javascript
const namer = makeNamer(rng);
namer.ocean(size);        // size in [0..1]
namer.lake(size);         // size in [0..1]
namer.island(clusterSize); // clusterSize >= 1
```

## Label Rendering Fixes

### Before (Tautologies)
```javascript
// Labels showed: "Azure Sea Sea", "Lotus Mere Lake"
name: `${featureName} ${featureType}`

// HUD showed: "Azure Sea Sea"
featureEl.textContent = cell.featureName + " " + cell.featureType;
```

### After (Clean Names)
```javascript
// Labels show: "Azure Sea", "Lotus Mere"
name: featureName

// HUD shows: "Azure Sea"
featureEl.textContent = cell.featureName;
```

## Testing

### Test Page
- `test-names.html` - Comprehensive validation of naming patterns
- Checks for tautologies, classical vs modern terms, size variations

### Console Commands
```javascript
testNames()        // Test basic naming
testFlavorPacks()  // Test size variations (renamed function)
```

## Validation Results

The implementation successfully:
- ✅ Eliminates all tautologies
- ✅ Provides size-appropriate naming
- ✅ Maintains fantasy aesthetic
- ✅ Ensures uniqueness
- ✅ Supports cluster-based island naming

## Example Output

### Oceans
- "Mare Umbra"
- "Sea of Dragons" 
- "The Azure Ocean"
- "Thalassa of Echoes"

### Lakes
- "Lake Sorrow"
- "Golden Mere"
- "Crimson Tarn"
- "Shimmering Lake"

### Islands
- "Dragon Isle" (singular)
- "Isles of Echoes" (plural)
- "Verdant Island" (singular)
- "Keys of Sorrow" (plural)
