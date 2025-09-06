import { describe, it, expect } from "vitest";
import { routeFluxAndRivers } from "./flux";
import { seaLevel, sourceFluxThreshold, deltaFluxThreshold } from "./constants";
function mkCells() {
    // 5 cells: center (2) with neighbors 1(left),3(right),0(up),4(down)
    // Right neighbor (3) borders ocean neighbors outside the plus shape.
    const base = [
        { id: 0, x: 0, y: -1, neighbors: [2], height: seaLevel + 0.6, precipitation: 0.02, flux: 0.02 }, // up (high)
        { id: 1, x: -1, y: 0, neighbors: [2], height: seaLevel + 0.5, precipitation: 0.02, flux: 0.02 }, // left
        { id: 2, x: 0, y: 0, neighbors: [0, 1, 3, 4], height: seaLevel + 0.4, precipitation: 2.0, flux: sourceFluxThreshold + 0.1 }, // center source
        { id: 3, x: 1, y: 0, neighbors: [2], height: seaLevel - 0.05, precipitation: 0.02, flux: 0.02 }, // ocean (to the right)
        { id: 4, x: 0, y: 1, neighbors: [2], height: seaLevel + 0.3, precipitation: 0.02, flux: 0.02 }, // down
    ];
    // Fill polygon arrays minimally (unused in compute here)
    return base.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        polygon: [],
        neighbors: p.neighbors,
        height: p.height,
        precipitation: p.precipitation,
        flux: p.flux,
    }));
}
describe("routeFluxAndRivers", () => {
    it("creates a source at high-flux cell and produces an estuary at ocean", () => {
        const cells = mkCells();
        // Edge midpoint: return the midpoint between land cell and neighbor (simple)
        const mid = (a, b) => {
            const A = cells[a], B = cells[b];
            return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
        };
        const { riversData, riversCount } = routeFluxAndRivers({
            cells,
            getEdgeMidpoint: mid,
        });
        expect(riversCount).toBeGreaterThan(0);
        const types = riversData.map(r => r.type);
        expect(types).toContain("source");
        expect(types).toContain("estuary");
    });
    it("creates deltas when flux is large and multiple ocean edges exist", () => {
        const cells = mkCells();
        // Force large flux
        cells[2].flux = deltaFluxThreshold + 5;
        cells[2].precipitation = deltaFluxThreshold + 5;
        // Simulate two ocean neighbors on the right by pretending 2 has extra ocean edges
        // We'll hack neighbors for the test: add a fake ocean neighbor id=5 with below-sea height
        const oceanCellA = 5, oceanCellB = 6;
        cells.push({
            id: oceanCellA, x: 1.2, y: 0.2, polygon: [], neighbors: [2], height: seaLevel - 0.1, precipitation: 0.02, flux: 0.02
        });
        cells.push({
            id: oceanCellB, x: 1.2, y: -0.2, polygon: [], neighbors: [2], height: seaLevel - 0.1, precipitation: 0.02, flux: 0.02
        });
        cells[2].neighbors = [...cells[2].neighbors, oceanCellA, oceanCellB];
        const mid = (a, b) => {
            const A = cells[a], B = cells[b];
            return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
        };
        const { riversData } = routeFluxAndRivers({
            cells,
            getEdgeMidpoint: mid,
        });
        const deltas = riversData.filter(r => r.type === "delta");
        expect(deltas.length).toBeGreaterThan(1); // multiple mouths
    });
});
