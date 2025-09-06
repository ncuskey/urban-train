/**
 * Near-verbatim port of Azgaar's `add(start, type)`:
 * - BFS from the start cell
 * - Spread height with radius & sharpness randomization
 * - Clamp height to [0,1]
 * - Clear featureType as the JSFiddle does
 *
 * Mutates cells in place and returns the set of touched cell ids.
 */
export function addBlob(cells, start, opts) {
    const { radius, sharpness, rng } = opts;
    let height = opts.height;
    const used = new Set();
    const queue = [];
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
        }
        else {
            // hill uses rolling height * radius
            height = height * radius;
        }
        // spread to neighbors
        const curr = cells[queue[qi]];
        for (const nbId of curr.neighbors) {
            if (nbId == null)
                continue;
            if (used.has(nbId))
                continue;
            // sharpness random modulation
            let mod;
            if (sharpness === 0) {
                mod = 1;
            }
            else {
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
function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}
