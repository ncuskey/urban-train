import { seaLevel } from "./constants.js";
/**
 * March winds from selected edges, deposit precipitation on land,
 * then smooth with neighbor averaging and seed flux = precipitation.
 *
 * Mirrors Azgaar's JSFiddle behavior:
 * - If randomize is on, each side is enabled with ~0.75 probability.
 * - If after randomization no sides are enabled, pick exactly one at random.
 * - Edge "frontier" bands are thin strips along the map border; rays march inward.
 * - On land:
 *    if height < 0.6: rain = rng.random() * height; precip -= rain; cell.precip += rain
 *    else (ridge): precip = 0; stop the ray
 * - After marching all rays: for each land cell, precipitation = average(self + neighbors)
 *   and flux = precipitation.
 */
export function calculatePrecipitation(params) {
    const { cells, width, height, rng } = params;
    const winds = { ...params.winds }; // copy; may be randomized
    // 1) Randomize winds if requested
    if (winds.randomize) {
        winds.N = rng.float() >= 0.25; // ~0.75 chance ON
        winds.E = rng.float() >= 0.25;
        winds.S = rng.float() >= 0.25;
        winds.W = rng.float() >= 0.25;
    }
    // Ensure at least one wind is active
    let sides = (winds.N ? 1 : 0) + (winds.E ? 1 : 0) + (winds.S ? 1 : 0) + (winds.W ? 1 : 0);
    if (sides === 0) {
        const pick = rng.intIn(0, 3);
        winds.N = pick === 0;
        winds.E = pick === 1;
        winds.S = pick === 2;
        winds.W = pick === 3;
        sides = 1;
    }
    // 2) Initialize per-cell precipitation with a tiny base (matches fiddle defaults)
    for (const c of cells) {
        c.precipitation = c.precipitation ?? 0.02;
    }
    // Base precipitation depends on number of active sides
    const precipInit = params.precipValue / Math.sqrt(sides);
    // Frontier strip thickness (pixel-ish), same shape as JSFiddle
    const selection = 10 / sides;
    // Helper: march one ray starting at (x,y), moving (dx,dy) with jitter
    function marchRay(x, y, nextStep, jitter) {
        let precip = precipInit;
        while (precip > 0 && x >= 0 && x <= width && y >= 0 && y <= height) {
            // advance
            const p = nextStep({ x, y });
            x = p.x;
            y = p.y;
            jitter({ x, y }); // mutate for side-specific lateral jitter (we reassign below)
            // Find the current cell
            const id = params.findCellAt(x, y);
            if (id == null)
                continue;
            const cell = cells[id];
            const h = cell.height;
            if (h >= seaLevel) {
                if (h < 0.6) {
                    // rain is proportional to elevation; depletes along the path
                    const rain = rng.float() * h;
                    precip -= rain;
                    cell.precipitation += rain;
                }
                else {
                    // high ridge blocks further precipitation on this ray
                    precip = 0;
                    cell.precipitation += 0;
                }
            }
        }
    }
    // Collect frontier cells and fire rays for each enabled wind
    const xMin = width * 0.1, xMax = width * 0.9;
    const yMin = height * 0.1, yMax = height * 0.9;
    if (winds.N) {
        const frontier = cells.filter(c => c.y < selection && c.x > xMin && c.x < xMax);
        for (const f of frontier) {
            // North wind marches downward (+y), jitter x ±5
            marchRay(f.x, f.y, ({ x, y }) => ({ x, y: y + 5 }), (pt) => { pt.x += rng.floatIn(-5, 5); });
        }
    }
    if (winds.E) {
        const frontier = cells.filter(c => c.x > width - selection && c.y > yMin && c.y < yMax);
        for (const f of frontier) {
            // East wind marches left (-x), jitter y ±5
            marchRay(f.x, f.y, ({ x, y }) => ({ x: x - 5, y }), (pt) => { pt.y += rng.floatIn(-5, 5); });
        }
    }
    if (winds.S) {
        const frontier = cells.filter(c => c.y > height - selection && c.x > xMin && c.x < xMax);
        for (const f of frontier) {
            // South wind marches upward (-y), jitter x ±5
            marchRay(f.x, f.y, ({ x, y }) => ({ x, y: y - 5 }), (pt) => { pt.x += rng.floatIn(-5, 5); });
        }
    }
    if (winds.W) {
        const frontier = cells.filter(c => c.x < selection && c.y > yMin && c.y < yMax);
        for (const f of frontier) {
            // West wind marches right (+x), jitter y ±10 (matches JSFiddle)
            marchRay(f.x, f.y, ({ x, y }) => ({ x: x + 5, y }), (pt) => { pt.y += rng.floatIn(-10, 10); });
        }
    }
    // 3) Smooth precipitation by neighbor averaging; then seed flux = precipitation
    // We compute into a temp array to avoid order-dependence.
    const smoothed = new Array(cells.length);
    for (const c of cells) {
        if (c.height >= seaLevel) {
            let acc = c.precipitation;
            let cnt = 1;
            for (const nb of c.neighbors) {
                if (nb != null) {
                    acc += cells[nb].precipitation;
                    cnt++;
                }
            }
            smoothed[c.id] = acc / cnt;
        }
        else {
            // sea cells don't accumulate land precipitation
            smoothed[c.id] = c.precipitation;
        }
    }
    for (const c of cells) {
        if (c.height >= seaLevel) {
            c.precipitation = smoothed[c.id];
            // Crucial: Azgaar seeds flux from precipitation
            c.flux = c.precipitation;
        }
        else {
            // water stays at base values
            c.flux = 0.02;
        }
    }
}
