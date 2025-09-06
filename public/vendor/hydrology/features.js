import { seaLevel } from "./constants.js";
/**
 * Mark connected components:
 * - Start "Ocean" flood from a corner sea cell (0,0 nearest) or any sea fallback.
 * - Remaining components with h >= seaLevel => "Island" #n
 * - Remaining components with h < seaLevel  => "Lake"   #n
 *
 * Mutates cells in place, setting:
 *   featureType, featureNumber, (optional) featureName
 */
export function markFeatures(cells, opts) {
    const nameProvider = opts?.nameProvider;
    // Utility BFS for a homogeneous predicate
    const flood = (startId, pred, kind, num) => {
        const q = [startId];
        const used = new Set([startId]);
        while (q.length) {
            const id = q.shift();
            const c = cells[id];
            c.featureType = kind;
            c.featureNumber = num;
            if (nameProvider)
                c.featureName = nameProvider(kind, num);
            for (const nbId of c.neighbors) {
                if (nbId == null || used.has(nbId))
                    continue;
                const nb = cells[nbId];
                if (pred(nb)) {
                    used.add(nbId);
                    q.push(nbId);
                }
            }
        }
    };
    // reset previous marks
    for (const c of cells) {
        c.featureType = undefined;
        c.featureNumber = undefined;
        // keep any previous names unless overwritten
    }
    // 1) Ocean: find a starting sea cell
    let oceanStart = null;
    // If caller suggested a corner index and it's sea, use it
    if (opts?.cornerIndex != null && cells[opts.cornerIndex] && cells[opts.cornerIndex].height < seaLevel) {
        oceanStart = opts.cornerIndex;
    }
    // else fallback: pick the sea cell closest to (0,0) if any
    if (oceanStart == null) {
        let best = -1;
        let bestD2 = Infinity;
        for (const c of cells) {
            if (c.height < seaLevel) {
                const d2 = c.x * c.x + c.y * c.y;
                if (d2 < bestD2) {
                    bestD2 = d2;
                    best = c.id;
                }
            }
        }
        oceanStart = best >= 0 ? best : null;
    }
    // If we found any ocean at all, flood it
    if (oceanStart != null) {
        flood(oceanStart, (m) => m.height < seaLevel && m.featureType === undefined, "Ocean", 0);
    }
    // 2) Islands & Lakes: label all remaining unmarked components
    let island = 0, lake = 0;
    for (const c of cells) {
        if (c.featureType)
            continue;
        if (c.height >= seaLevel) {
            const id = island++;
            flood(c.id, (m) => m.height >= seaLevel && m.featureType === undefined, "Island", id);
        }
        else {
            const id = lake++;
            flood(c.id, (m) => m.height < seaLevel && m.featureType === undefined, "Lake", id);
        }
    }
    return { islands: island, lakes: lake };
}
