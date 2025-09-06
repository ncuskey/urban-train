import { describe, it, expect } from "vitest";
import { buildRiverSegments } from "./rivers";
import { SeededRandom } from "./rng";
import { seaLevel } from "./constants";
function mkCells() {
    // simple grid of land for flux sampling
    const cells = [];
    for (let i = 0; i < 25; i++) {
        cells.push({
            id: i, x: i % 5, y: Math.floor(i / 5), polygon: [], neighbors: [],
            height: seaLevel + 0.2,
            precipitation: 0.02,
            flux: 0.5 + (i % 5) * 0.1, // varying flux
        });
    }
    return cells;
}
function nearestFind(cells) {
    return (x, y) => {
        let best = 0, bestD2 = Infinity;
        for (const c of cells) {
            const d2 = (c.x - x) ** 2 + (c.y - y) ** 2;
            if (d2 < bestD2) {
                bestD2 = d2;
                best = c.id;
            }
        }
        return best;
    };
}
describe("buildRiverSegments", () => {
    it("produces bezier segments with positive widths", () => {
        const cells = mkCells();
        const riversData = [
            { river: 0, cell: 0, x: 0.2, y: 0.2, type: "source" },
            { river: 0, cell: 1, x: 1.0, y: 0.4, type: "course" },
            { river: 0, cell: 2, x: 2.1, y: 0.9, type: "course" },
            { river: 0, cell: 3, x: 3.0, y: 1.2, type: "estuary" },
        ];
        const rng = new SeededRandom(42);
        const segs = buildRiverSegments({ cells, riversData, findCellAt: nearestFind(cells), rng });
        expect(segs.length).toBeGreaterThan(0);
        for (const s of segs) {
            expect(s.width).toBeGreaterThan(0);
            expect(s.shadowWidth).toBeGreaterThan(0);
        }
    });
});
