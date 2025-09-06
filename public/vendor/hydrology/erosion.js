import { seaLevel, riverDowncutDivisor, } from "./constants.js";
/**
 * Coastline downcutting (verbatim behavior):
 * - If cell.height >= seaLevel, subtract 'downcut'
 * - Clamp to [0,1]
 * Returns number of modified cells.
 */
export function downcutCoastline(cells, downcut) {
    let changed = 0;
    for (const c of cells) {
        if (c.height >= seaLevel) {
            const before = c.height;
            c.height = clamp01(c.height - downcut);
            if (c.height !== before)
                changed++;
        }
    }
    return changed;
}
/**
 * River downcutting (verbatim behavior):
 * - If cell.flux >= 0.03 && cell.height >= seaLevel + 0.01
 *   subtract (downcut / riverDowncutDivisor)
 * Returns number of modified cells.
 */
export function downcutRivers(cells, downcut) {
    let changed = 0;
    const riverCut = downcut / riverDowncutDivisor;
    for (const c of cells) {
        if (c.flux >= 0.03 && c.height >= seaLevel + 0.01) {
            const before = c.height;
            c.height = clamp01(c.height - riverCut);
            if (c.height !== before)
                changed++;
        }
    }
    return changed;
}
function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}
