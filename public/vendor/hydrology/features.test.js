import { describe, it, expect } from "vitest";
import { markFeatures } from "./features";
import { seaLevel } from "./constants";
function mkCells() {
    // 3x3 grid; outer ring sea, center cross is land => 1 island, no lakes
    const cells = [];
    const N = 3;
    const idx = (i, j) => j * N + i;
    for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
            const id = idx(i, j);
            cells.push({
                id, x: i, y: j, polygon: [], neighbors: [],
                height: (i === 1 || j === 1) ? seaLevel + 0.2 : seaLevel - 0.1,
                precipitation: 0.02, flux: 0.02
            });
        }
    }
    for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
            const me = cells[idx(i, j)];
            const nbs = [];
            if (i > 0)
                nbs.push(idx(i - 1, j));
            if (i < N - 1)
                nbs.push(idx(i + 1, j));
            if (j > 0)
                nbs.push(idx(i, j - 1));
            if (j < N - 1)
                nbs.push(idx(i, j + 1));
            me.neighbors = nbs;
        }
    }
    return cells;
}
describe("markFeatures", () => {
    it("labels ocean and a single island", () => {
        const cells = mkCells();
        const { islands, lakes } = markFeatures(cells, { width: 3, height: 3 });
        expect(islands).toBe(1);
        expect(lakes).toBe(0);
        expect(cells.find(c => c.height < seaLevel).featureType).toBe("Ocean");
        expect(cells.find(c => c.height >= seaLevel).featureType).toBe("Island");
    });
});
