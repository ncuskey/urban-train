import { describe, it, expect } from "vitest";
import { downcutCoastline, downcutRivers } from "./erosion";
import { seaLevel } from "./constants";
function cell(h, f = 0) {
    return {
        id: 0, x: 0, y: 0, polygon: [], neighbors: [],
        height: h, precipitation: 0.02, flux: f
    };
}
describe("downcutCoastline", () => {
    it("reduces only land cells", () => {
        const cells = [cell(seaLevel - 0.01), cell(seaLevel), cell(seaLevel + 0.2)];
        const changed = downcutCoastline(cells, 0.1);
        expect(changed).toBe(2); // seaLevel and above
        expect(cells[0].height).toBeCloseTo(seaLevel - 0.01, 6);
        expect(cells[1].height).toBeCloseTo(Math.max(0, seaLevel - 0.1));
    });
});
describe("downcutRivers", () => {
    it("reduces only qualifying river cells", () => {
        const cells = [
            cell(seaLevel + 0.02, 0.0),
            cell(seaLevel + 0.02, 0.03), // qualifies
            cell(seaLevel - 0.01, 0.5), // water
        ];
        const changed = downcutRivers(cells, 0.1);
        expect(changed).toBe(1);
    });
});
