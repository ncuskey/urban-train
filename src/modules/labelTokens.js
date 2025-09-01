// Label token configuration loader
// Provides centralized configuration for label styling, LOD, and placement

const DEFAULT_TOKENS = {
  sizes_px: { t0_area:28, t1_major:22, t2_standard:16, t3_small:13, t4_tiny:10 },
  tracking_em: { area_wide:0.08, area_medium:0.05, normal:0 },
  lod: {
    fade_width_zoom: 0.25,
    tiers: { t0:{min_zoom:0.0,max_zoom:2.0}, t1:{min_zoom:0.8,max_zoom:3.2},
             t2:{min_zoom:1.8,max_zoom:4.4}, t3:{min_zoom:3.0,max_zoom:6.0}, t4:{min_zoom:4.0,max_zoom:7.0} }
  },
  budgets: { t0:{areas:2,ocean:1}, t1:{areas:6,water:4,settlements:6,linear:3}, t2:{settlements:10,linear:6,water:4}, t3:{settlements:14,linear:8} },
  priority_ladder: ['OCEAN','CONTINENT','CAPITAL','SEA','RANGE','MAJOR_CITY','LAKE','PRINCIPAL_RIVER','TOWN','STRAIT','ROAD','VILLAGE'],
  spacing_px: { OCEAN:48, CONTINENT:44, LAKE:24, TOWN:20, STRAIT:18, ROAD:16, VILLAGE:14 }
};

let TOKENS = DEFAULT_TOKENS;

/**
 * Get the current label tokens configuration
 * @returns {Object} The current tokens object
 */
export function getLabelTokens() { 
  return TOKENS; 
}

/**
 * Load label tokens from external file if enabled
 * Falls back to defaults if file is missing or tokensLoader flag is false
 * @returns {Object} The loaded or default tokens
 */
export async function loadLabelTokens() {
  if (!window.labelFlags?.tokensLoader) return TOKENS;
  
  try {
    const res = await fetch('/label-tokens.json', { cache:'no-store' });
    if (res.ok) TOKENS = await res.json();
  } catch(_e) { 
    /* keep defaults */ 
  }
  
  return TOKENS;
}
