import { Cell, CellId } from "./types.js";
import { SeededRandom } from "./rng.js";

/**
 * Options that mirror the JSFiddle sliders:
 * - height: starting height boost at the seed cell (0..1)
 * - radius: multiplicative falloff per BFS step (0.5..0.999)
 * - sharpness: randomization of spread multiplier (0..0.4)
 * - type: "island" (uses current cell height as base) or "hill" (uses rolling height variable)
 */
export interface AddOptions {
  height: number;     // e.g. 0.9 for island, 0.1..0.5 for hills
  radius: number;     // e.g. 0.9..0.99
  sharpness: number;  // e.g. 0.0 or 0.2
  type: "island" | "hill";
  rng: SeededRandom;
}

/**
 * Near-verbatim port of Azgaar's `add(start, type)`:
 * - BFS from the start cell
 * - Spread height with radius & sharpness randomization
 * - Clamp height to [0,1]
 * - Clear featureType as the JSFiddle does
 *
 * Mutates cells in place and returns the set of touched cell ids.
 */
export function addBlob(
  cells: Cell[],
  start: CellId,
  opts: AddOptions
): Set<CellId> {
  const { radius, sharpness, rng } = opts;
  let height = opts.height;

  const used = new Set<CellId>();
  const queue: CellId[] = [];

  // initialize
  const s = cells[start];
  s.height = clamp01(s.height + height);
  s.featureType = undefined;
  used.add(start);
  queue.push(start);

  for (let qi = 0; qi < queue.length && height > 0.01; qi++) {
    // Update height for next ring
    if (opts.type === "island") {
      // island uses current cell height * radius
      height = cells[queue[qi]].height * radius;
    } else {
      // hill uses rolling height * radius
      height = height * radius;
    }

    // spread to neighbors
    const curr = cells[queue[qi]];
    for (const nbId of curr.neighbors) {
      if (nbId == null) continue;
      if (used.has(nbId)) continue;

      // sharpness random modulation
      let mod: number;
      if (sharpness === 0) {
        mod = 1;
      } else {
        // mod = Math.random() * sharpness + 1.1 - sharpness
        mod = rng.float() * sharpness + 1.1 - sharpness;
      }

      const n = cells[nbId];
      n.height = clamp01(n.height + height * mod);
      n.featureType = undefined;

      used.add(nbId);
      queue.push(nbId);
    }
  }

  return used;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
