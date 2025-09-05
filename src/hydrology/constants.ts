/**
 * Hydrology constants mirrored from Azgaar's JSFiddle behavior.
 * Keep these values stable to maintain visual parity.
 */
export const seaLevel = 0.2;                // land if height >= seaLevel
export const sourceFluxThreshold = 0.6;     // start river when flux > this
export const deltaFluxThreshold = 15;       // delta if flux > this and multiple ocean edges
export const pitRaiseEpsilon = 0.01;        // depression fill raise above spill
export const riverDowncutDivisor = 10;      // river downcut = downcut / this

// Defaults used by our orchestrator later (can be overridden by UI/params)
export const defaultPoissonRadius = 4;      // px sampling radius (ballpark parity)
export const defaultPrecip = 7;             // 0..10 like the fiddle UI
export const defaultDowncut = 0.1;          // coastline erosion knob
