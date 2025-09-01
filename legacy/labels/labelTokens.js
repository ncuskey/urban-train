// Label token configuration loader
// Provides centralized configuration for label styling, LOD, and placement

const DEFAULT_TOKENS = {
  sizes_px: { t0_area:28, t1_major:22, t2_standard:16, t3_small:13, t4_tiny:10 },
  tracking_em: { area_wide:0.08, area_medium:0.05, normal:0 },
  lod: {
    fade_width_zoom: 0.25,
    tiers: { t0:{min_zoom:0.0,max_zoom:2.0}, t1:{min_zoom:0.8,max_zoom:99.0},
             t2:{min_zoom:1.5,max_zoom:8.0}, t3:{min_zoom:2.5,max_zoom:10.0}, t4:{min_zoom:3.5,max_zoom:12.0} }
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

/**
 * Get font size in pixels for a feature based on its tier and kind
 * @param {Object} feature - The feature object with tier and kind properties
 * @returns {number} Font size in pixels
 */
export function fontPxFor(feature) {
  const t = getLabelTokens();
  const tier = feature?.tier ?? 3;

  // Map tier → base size token
  const tierSize =
    tier <= 1 ? t.sizes_px.t1_major :
    tier === 2 ? t.sizes_px.t2_standard :
    tier === 3 ? t.sizes_px.t3_small :
                 t.sizes_px.t4_tiny;

  // Class tweaks
  if (feature.kind === 'lake') {
    return tier <= 2 ? tierSize : Math.max(tierSize - 1, t.sizes_px.t4_tiny);
  }
  if (feature.kind === 'island') {
    const big = (feature.area ?? 0) > 15000;
    return big ? Math.max(tierSize, t.sizes_px.t1_major) : tierSize;
  }
  // Fallback
  return tierSize;
}

/**
 * Calculate opacity for a label based on zoom level and tier
 * @param {number} k - Current zoom level
 * @param {number} tier - Label tier (1-4)
 * @param {number} fadeWidth - Width of fade transition (defaults to token value)
 * @returns {number} Opacity value between 0 and 1
 */
export function opacityForZoom(k, tier, fadeWidth = getLabelTokens().lod.fade_width_zoom) {
  const tiers = getLabelTokens().lod.tiers;
  // map numeric tier → key (t1..t4); be defensive
  const key = tier <= 1 ? 't1' : tier === 2 ? 't2' : tier === 3 ? 't3' : 't4';
  const band = tiers[key] || { min_zoom: 0, max_zoom: Infinity };
  const enterStart = band.min_zoom - fadeWidth;
  const exitEnd    = band.max_zoom + fadeWidth;

  if (k <= enterStart || k >= exitEnd) return 0;
  if (k < band.min_zoom) return (k - enterStart) / (band.min_zoom - enterStart);
  if (k > band.max_zoom) return (exitEnd - k) / (exitEnd - band.max_zoom);
  return 1;
}
