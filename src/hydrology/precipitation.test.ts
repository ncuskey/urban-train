import { describe, it, expect } from "vitest";
import { calculatePrecipitation, FindCellAt } from "./precipitation";
import { SeededRandom } from "./rng";
import { Cell } from "./types";
import { seaLevel } from "./constants";

function mkGrid(w: number, h: number, cols: number, rows: number): {cells: Cell[], find: FindCellAt} {
  const dx = w / cols, dy = h / rows;
  const cells: Cell[] = [];
  let id = 0;

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      cells.push({
        id: id++,
        x: i * dx + dx/2,
        y: j * dy + dy/2,
        polygon: [],
        neighbors: [],
        height: (j > 1 ? seaLevel + 0.1 : seaLevel - 0.05), // first row ocean, rest land
        precipitation: 0.02,
        flux: 0.02,
      } as unknown as Cell);
    }
  }

  // 4-neighborhood
  const idx = (i:number,j:number) => j*cols + i;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const me = cells[idx(i,j)];
      const nbs:number[] = [];
      if (i>0) nbs.push(idx(i-1,j));
      if (i<cols-1) nbs.push(idx(i+1,j));
      if (j>0) nbs.push(idx(i,j-1));
      if (j<rows-1) nbs.push(idx(i,j+1));
      me.neighbors = nbs;
    }
  }

  // simple find: nearest grid cell
  const find: FindCellAt = (x,y) => {
    const i = Math.max(0, Math.min(cols-1, Math.floor(x / dx)));
    const j = Math.max(0, Math.min(rows-1, Math.floor(y / dy)));
    return idx(i,j);
  };

  return { cells, find };
}

describe("calculatePrecipitation", () => {
  it("seeds flux from precipitation and increases inland moisture under a wind", () => {
    const { cells, find } = mkGrid(640, 360, 32, 18);
    const rng = new SeededRandom(42);

    calculatePrecipitation({
      cells,
      width: 640,
      height: 360,
      precipValue: 7,
      winds: { N: true, E: false, S: false, W: false, randomize: false },
      rng,
      findCellAt: find
    });

    const inland = cells.filter(c => c.height >= seaLevel && c.y > 80);
    const avgFlux = inland.reduce((a,c)=>a+c.flux,0)/inland.length;
    expect(avgFlux).toBeGreaterThan(0.02); // should have rained
  });
});
