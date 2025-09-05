import { describe, it, expect } from "vitest";
import { resolveDepressions, getLandSortedDesc } from "./depressions";
import { seaLevel, pitRaiseEpsilon } from "./constants";
import { Cell } from "./types";

function mkCell(id: number, h: number, neighbors: number[] = []): Cell {
  return {
    id,
    x: 0, y: 0,
    polygon: [],
    neighbors,
    height: h,
    precipitation: 0.02,
    flux: 0.02,
  } as unknown as Cell;
}

describe("resolveDepressions", () => {
  it("raises pits to spill height + epsilon and terminates", () => {
    // Simple diamond of land where the center is a pit:
    //    0.6
    // 0.6  C(0.3) 0.6
    //    0.6
    const cells: Cell[] = [
      mkCell(0, seaLevel + 0.4, [1,2]),          // top
      mkCell(1, seaLevel + 0.4, [0,2,3]),        // left
      mkCell(2, seaLevel + 0.1, [0,1,3,4]),      // center pit
      mkCell(3, seaLevel + 0.4, [1,2,4]),        // right
      mkCell(4, seaLevel + 0.4, [2,3])           // bottom
    ];
    // Fix neighbor arrays to be bidirectional for this toy
    cells[0].neighbors = [2,1];
    cells[1].neighbors = [0,2,3];
    cells[2].neighbors = [0,1,3,4];
    cells[3].neighbors = [1,2,4];
    cells[4].neighbors = [2,3];

    const before = cells[2].height;
    const stats = resolveDepressions(cells);
    expect(stats.totalLifts).toBeGreaterThan(0);
    // Center should be lifted to min(neighbors) + epsilon
    const minNbh = Math.min(
      cells[0].height,
      cells[1].height,
      cells[3].height,
      cells[4].height
    );
    expect(cells[2].height).toBeCloseTo(minNbh + pitRaiseEpsilon, 6);
    // No infinite loops
    expect(stats.passes).toBeLessThanOrEqual(100);
    expect(cells[2].height).toBeGreaterThan(before);
  });

  it("provides land cells sorted by descending height", () => {
    const cells: Cell[] = [
      mkCell(0, seaLevel - 0.1),
      mkCell(1, seaLevel + 0.3),
      mkCell(2, seaLevel + 0.1),
      mkCell(3, seaLevel + 0.6),
    ];
    const sorted = getLandSortedDesc(cells);
    expect(sorted.map(c => c.id)).toEqual([3,1,2]);
  });
});
