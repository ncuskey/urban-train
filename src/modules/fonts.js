/**
 * Fantasy Font Manager for Urban Train Map Generator
 * 
 * Provides easy font switching between different fantasy themes.
 * All fonts are from Google Fonts and are free for commercial use.
 */

// Fantasy font themes
export const FANTASY_FONTS = {
  // Medieval/Classical themes
  cinzel: {
    name: 'Cinzel',
    family: "'Cinzel', serif",
    description: 'Elegant serif with medieval feel - great for fantasy maps',
    weights: [400, 700, 900]
  },
  unifraktur: {
    name: 'UnifrakturMaguntia', 
    family: "'UnifrakturMaguntia', cursive",
    description: 'Gothic blackletter style - very medieval',
    weights: [400]
  },
  medieval: {
    name: 'MedievalSharp',
    family: "'MedievalSharp', cursive", 
    description: 'Hand-drawn medieval look - rustic and authentic',
    weights: [400]
  },
  alegreya: {
    name: 'Alegreya SC',
    family: "'Alegreya SC', serif",
    description: 'Small caps serif with classical feel',
    weights: [400, 700]
  },
  
  // Elegant/Readable themes
  crimson: {
    name: 'Crimson Text',
    family: "'Crimson Text', serif",
    description: 'Elegant serif with fantasy feel - very readable',
    weights: [400, 600, 700]
  },
  lora: {
    name: 'Lora',
    family: "'Lora', serif",
    description: 'Beautiful serif with good readability',
    weights: [400, 500, 600, 700]
  },
  merriweather: {
    name: 'Merriweather',
    family: "'Merriweather', serif",
    description: 'Robust serif with fantasy feel - excellent readability',
    weights: [300, 400, 700, 900]
  },
  
  // Fallback to original
  georgia: {
    name: 'Georgia',
    family: 'Georgia, "Times New Roman", serif',
    description: 'Original font - clean and readable',
    weights: [400, 700]
  }
};

/**
 * Switch to a different fantasy font theme
 * @param {string} fontKey - Key from FANTASY_FONTS object
 */
export function switchFont(fontKey) {
  const font = FANTASY_FONTS[fontKey];
  if (!font) {
    // console.warn(`Unknown font key: ${fontKey}. Available:`, Object.keys(FANTASY_FONTS));
    return false;
  }
  
  // Update CSS custom properties
  document.documentElement.style.setProperty('--label-font', font.family);
  document.documentElement.style.setProperty('--label-font-family', font.family);
  
  // console.log(`Switched to ${font.name}: ${font.description}`);
  return true;
}

/**
 * Get current font information
 * @returns {Object} Current font details
 */
export function getCurrentFont() {
  const currentFamily = getComputedStyle(document.documentElement).getPropertyValue('--label-font-family');
  
  // Find which font this matches
  for (const [key, font] of Object.entries(FANTASY_FONTS)) {
    if (font.family === currentFamily.trim()) {
      return { key, ...font };
    }
  }
  
  return { key: 'unknown', name: 'Unknown', family: currentFamily, description: 'Custom font' };
}

/**
 * List all available fonts with descriptions
 */
export function listFonts() {
  // console.log('Available fantasy fonts:');
  for (const [key, font] of Object.entries(FANTASY_FONTS)) {
    // console.log(`  ${key}: ${font.name} - ${font.description}`);
  }
}

/**
 * Quick font switcher for testing
 * Cycles through fonts when called repeatedly
 */
let __fontIndex = 0;
const __fontKeys = Object.keys(FANTASY_FONTS);

export function cycleFont() {
  const key = __fontKeys[__fontIndex % __fontKeys.length];
  switchFont(key);
  __fontIndex++;
  return key;
}
