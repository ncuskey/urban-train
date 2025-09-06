import { seaLevel } from "./constants.js";
/**
 * Coastline builder:
 * - Scans all land cells and finds edges where the opposite side is water.
 * - If opposite is Ocean: this edge belongs to the ISLAND ring for the Island's featureNumber.
 *   Also tags the ocean neighbor as "shallow" for hatch rendering.
 * - If opposite is Lake : this edge belongs to the LAKE ring for the Lake's featureNumber.
 * - Segments are then chained into closed rings (per (type, number)).
 *
 * Returns { coastIslands, coastLakes } arrays of closed rings.
 */
export function buildCoastlines(params) {
    const { cells, getSharedEdge } = params;
    const eps = params.eps ?? 1e-3;
    // Buckets keyed per-feature
    const islandSegs = new Map();
    const lakeSegs = new Map();
    // 1) Collect land/water border segments
    for (const land of cells) {
        if (land.height < seaLevel)
            continue; // only land cells
        for (const nbId of land.neighbors) {
            if (nbId == null)
                continue;
            const nb = cells[nbId];
            if (!nb)
                continue;
            if (nb.height >= seaLevel)
                continue; // not a water boundary
            // Determine if boundary is toward Ocean or Lake
            const kind = nb.featureType; // should be "Ocean" or "Lake" after markFeatures
            const seg = getSharedEdge(land.id, nbId);
            const s = { a: seg[0], b: seg[1] };
            if (kind === "Ocean") {
                // mark shallow water for hatch
                nb.type = "shallow";
                const idx = land.featureNumber ?? 0;
                pushSeg(islandSegs, idx, s);
            }
            else if (kind === "Lake") {
                const idx = nb.featureNumber ?? 0;
                pushSeg(lakeSegs, idx, s);
            }
        }
    }
    // 2) Chain into closed rings
    const coastIslands = [];
    const coastLakes = [];
    for (const [, segs] of islandSegs) {
        coastIslands.push(...chainClosedRings(segs, eps));
    }
    for (const [, segs] of lakeSegs) {
        coastLakes.push(...chainClosedRings(segs, eps));
    }
    return { coastIslands, coastLakes };
}
function pushSeg(map, key, seg) {
    const arr = map.get(key);
    if (arr)
        arr.push(seg);
    else
        map.set(key, [seg]);
}
/**
 * Chain a set of unoriented segments into one or more closed rings.
 * Endpoints are snapped by distance <= eps.
 */
function chainClosedRings(segments, eps) {
    // Build adjacency by hashing endpoints (snapping within eps)
    const nodes = [];
    const idxOf = (p) => {
        const i = nodes.findIndex(n => dist2(n, p) <= eps * eps);
        if (i >= 0)
            return i;
        nodes.push({ x: p.x, y: p.y });
        return nodes.length - 1;
    };
    const edges = [];
    for (const s of segments) {
        const i = idxOf(s.a);
        const j = idxOf(s.b);
        if (i !== j)
            edges.push([i, j]);
    }
    // Build adjacency list
    const adj = new Map();
    for (const [u, v] of edges) {
        if (!adj.has(u))
            adj.set(u, []);
        if (!adj.has(v))
            adj.set(v, []);
        adj.get(u).push(v);
        adj.get(v).push(u);
    }
    // Walk cycles greedily
    const used = new Set();
    const rings = [];
    const edgeKey = (u, v) => (u < v ? `${u}-${v}` : `${v}-${u}`);
    for (const [u0, v0] of edges) {
        const k = edgeKey(u0, v0);
        if (used.has(k))
            continue;
        // Start a ring
        let ringIdxs = [u0, v0];
        used.add(k);
        // Extend forward until we return to start
        let curr = v0;
        let prev = u0;
        let guard = edges.length * 4;
        while (guard-- > 0) {
            const nbrs = (adj.get(curr) ?? []).filter(n => n !== prev);
            let next = null;
            // pick a neighbor that has an unused edge
            for (const n of nbrs) {
                const ek = edgeKey(curr, n);
                if (!used.has(ek)) {
                    next = n;
                    break;
                }
            }
            if (next == null)
                break; // dead end for this chain
            ringIdxs.push(next);
            used.add(edgeKey(curr, next));
            prev = curr;
            curr = next;
            // closed?
            if (next === u0) {
                // convert to Path
                const path = ringIdxs.map(i => ({ x: nodes[i].x, y: nodes[i].y }));
                rings.push(path);
                break;
            }
        }
    }
    return rings;
}
function dist2(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return dx * dx + dy * dy;
}
