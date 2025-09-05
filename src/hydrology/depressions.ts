import { Cell } from "./types";
import { seaLevel, pitRaiseEpsilon } from "./constants";

/**
 * Return the subset of cells considered "land" (height >= seaLevel).
 */
export function getLand(cells: Cell[]): Cell[] {
  return cells.filter(c => c.height >= seaLevel);
}

/**
 * Return land cells sorted by descending height.
 * (Used by routing to iterate from peaks to lowlands.)
 */
export function getLandSortedDesc(cells: Cell[]): Cell[] {
  const land = getLand(cells).slice();
  land.sort((a, b) => b.height - a.height);
  return land;
}

/**
 * Resolve depressions ("sinks") by lifting pit cells to the spill height + ε.
 * This mirrors Azgaar's simple loop in the JSFiddle:
 *   while (found any pits) for each land cell:
 *     h_min = min(neighbor.height)
 *     if (cell.height <= h_min) cell.height = h_min + ε
 *
 * - Mutates cells in place.
 * - Returns an object with iteration stats.
 * - Includes safety caps to avoid pathological loops.
 */
export function resolveDepressions(cells: Cell[], opts?: {
  maxPasses?: number;          // hard cap on outer loop (default 100)
  maxLiftsPerPass?: number;    // optional early-out if tons of lifts in one pass
}): { passes: number; totalLifts: number; lastLiftCount: number } {
  const maxPasses = opts?.maxPasses ?? 100;
  const maxLiftsPerPass = opts?.maxLiftsPerPass ?? Number.POSITIVE_INFINITY;

  // Work only on land; water is ignored entirely
  const land = getLand(cells);
  if (land.length === 0) {
    return { passes: 0, totalLifts: 0, lastLiftCount: 0 };
  }

  let passes = 0;
  let totalLifts = 0;
  let lastLiftCount = 0;

  // We iterate until no pits are lifted in a pass, or we hit the cap.
  for (; passes < maxPasses; passes++) {
    let liftsThisPass = 0;

    // For each land cell, compare height to lowest neighbor
    for (const c of land) {
      let minH = Number.POSITIVE_INFINITY;
      for (const nbId of c.neighbors) {
        if (nbId == null) continue;
        const nb = cells[nbId];
        if (!nb) continue;
        if (nb.height < minH) minH = nb.height;
      }

      // If c is not strictly above its lowest neighbor, it's a pit: lift it
      if (c.height <= minH) {
        const before = c.height;
        c.height = minH + pitRaiseEpsilon;
        if (c.height !== before) {
          liftsThisPass++;
          totalLifts++;
        }
      }

      // Optional: early stop per-pass if we're lifting too many (guard)
      if (liftsThisPass >= maxLiftsPerPass) break;
    }

    lastLiftCount = liftsThisPass;
    if (liftsThisPass === 0) break; // stable, no more depressions
  }

  return { passes, totalLifts, lastLiftCount };
}
