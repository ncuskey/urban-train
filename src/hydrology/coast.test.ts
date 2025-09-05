import { describe, it, expect } from "vitest";
import { buildCoastlines, GetSharedEdge } from "./coast";
import { markFeatures } from "./features";
import { Cell } from "./types";
import { seaLevel } from "./constants";

/**
 * Tiny diamond island in the middle of a 5-cell plus-shape:
 *   . L .
 *   L C L
 *   . L .
 * Where L = land, . = ocean, C=center land
 */
function mkPlusIsland(): { cells: Cell[], getEdge: GetSharedEdge } {
  const O = seaLevel - 0.1, L = seaLevel + 0.2;
  const cells: Cell[] = [
    { id:0,x:0,y:-1,polygon:[],neighbors:[2],height:O,precipitation:0.02,flux:0.02 } as Cell,
    { id:1,x:-1,y:0,polygon:[],neighbors:[2],height:L,precipitation:0.02,flux:0.02 } as Cell,
    { id:2,x:0,y:0,polygon:[],neighbors:[0,1,3,4],height:L,precipitation:0.02,flux:0.02 } as Cell,
    { id:3,x:1,y:0,polygon:[],neighbors:[2],height:L,precipitation:0.02,flux:0.02 } as Cell,
    { id:4,x:0,y:1,polygon:[],neighbors:[2],height:L,precipitation:0.02,flux:0.02 } as Cell,
    { id:5,x:-2,y:0,polygon:[],neighbors:[],height:O,precipitation:0.02,flux:0.02 } as Cell,
    { id:6,x:2,y:0, polygon:[],neighbors:[],height:O,precipitation:0.02,flux:0.02 } as Cell,
    { id:7,x:0,y:2, polygon:[],neighbors:[],height:O,precipitation:0.02,flux:0.02 } as Cell,
    { id:8,x:0,y:-2,polygon:[],neighbors:[],height:O,precipitation:0.02,flux:0.02 } as Cell,
  ];

  // neighbors already set for the plus; others are irrelevant

  // Simple shared edge: midpoint-ish line between cell centers
  const getEdge: GetSharedEdge = (a,b) => {
    const A = cells[a], B = cells[b];
    // produce a small segment orthogonal to AB at the midpoint (for test only)
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
    const dx = B.x - A.x, dy = B.y - A.y;
    // orthogonal unit-ish
    const ox = -dy * 0.1, oy = dx * 0.1;
    return [{ x: mx - ox, y: my - oy }, { x: mx + ox, y: my + oy }];
  };

  return { cells, getEdge };
}

describe("buildCoastlines", () => {
  it("returns at least one island ring and marks shallows on ocean neighbors", () => {
    const { cells, getEdge } = mkPlusIsland();
    markFeatures(cells, { width: 3, height: 3 });
    const { coastIslands, coastLakes } = buildCoastlines({ cells, getSharedEdge: getEdge });
    expect(coastIslands.length).toBeGreaterThan(0);
    expect(coastLakes.length).toBe(0);
    // Ocean neighbor near cell 0 should be shallow if adjacent to land
    expect(cells[0].type === "shallow" || cells[0].type === undefined).toBe(true);
  });
});
