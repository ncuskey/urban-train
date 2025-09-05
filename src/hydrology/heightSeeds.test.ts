import { describe, it, expect } from "vitest";
import { addBlob } from "./heightSeeds";
import { SeededRandom } from "./rng";
import { Cell } from "./types";

function mkCells(n: number): Cell[] {
  // simple line graph 0-1-2-...-(n-1)
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    x: i,
    y: 0,
    polygon: [],
    neighbors: [i - 1, i + 1].filter((k) => k >= 0 && k < n),
    height: 0,
    precipitation: 0.02,
    flux: 0.02,
  })) as unknown as Cell[];
}

describe("addBlob", () => {
  it("raises heights and clamps to [0,1]", () => {
    const cells = mkCells(5);
    const rng = new SeededRandom(42);
    const touched = addBlob(cells, 2, {
      height: 0.9,
      radius: 0.9,
      sharpness: 0.2,
      type: "island",
      rng,
    });

    expect(touched.size).toBeGreaterThan(0);
    for (const c of cells) {
      expect(c.height).toBeGreaterThanOrEqual(0);
      expect(c.height).toBeLessThanOrEqual(1);
    }
  });
});
