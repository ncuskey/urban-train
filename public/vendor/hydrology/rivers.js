/**
 * Build Azgaar-style river geometry:
 * - Group points by river id (ignore 1-point rivers)
 * - If len > 2, insert meander points (~1/3, 2/3 between pairs) with small random offset
 * - Convert polyline to cubic Bézier using Catmull–Rom (alpha=1)
 * - Compute per-segment width from local flux via findCellAt
 * Returns all Bézier segments flattened across rivers.
 */
export function buildRiverSegments(params) {
    const { cells, riversData, findCellAt, rng } = params;
    // 1) Group by river id preserving order of appearance
    const groups = new Map();
    for (const rp of riversData) {
        if (!groups.has(rp.river))
            groups.set(rp.river, []);
        groups.get(rp.river).push(rp);
    }
    const segments = [];
    for (const [riverId, pts] of groups) {
        if (!pts || pts.length < 2)
            continue;
        // 2) Strip to x,y polyline in order (ignore types here)
        const base = pts.map(p => ({ x: p.x, y: p.y }));
        // 3) Inject meander points when path is long enough (Azgaar's vibe)
        const withMeanders = (base.length > 2)
            ? addMeanders(base, rng)
            : base.slice();
        // 4) Convert to cubic Bézier using Catmull–Rom α=1
        const alpha = 1; // match d3.curveCatmullRom.alpha(1)
        const curves = catmullRomToBeziers(withMeanders, alpha);
        // 5) Widths per segment based on local flux
        for (let s = 0; s < curves.length; s++) {
            const seg = curves[s];
            // local flux sampled at the start-point (sx,sy)
            const id = findCellAt(seg.sx, seg.sy);
            let localFlux = 0.02;
            if (id != null && cells[id]) {
                localFlux = cells[id].flux ?? 0.02;
            }
            let width = s / 100 + localFlux / 30;
            if (width > 0.5)
                width *= 0.9;
            const shadowWidth = Math.max(0.1, width / 3);
            segments.push({
                ...seg,
                width,
                shadowWidth,
                riverId,
            });
        }
    }
    return segments;
}
/**
 * Insert two points (at ~1/3 and ~2/3) between each consecutive pair,
 * with a tiny offset applied on either x or y (randomly) to create meanders.
 * Matches the JSFiddle's logic range: 0.4..0.7.
 */
function addMeanders(points, rng) {
    if (points.length < 2)
        return points.slice();
    const out = [];
    for (let i = 0; i < points.length; i++) {
        out.push(points[i]);
        if (i + 1 < points.length) {
            const a = points[i];
            const b = points[i + 1];
            // positions at 1/3 and 2/3
            const st = {
                x: (a.x * 2 + b.x) / 3,
                y: (a.y * 2 + b.y) / 3,
            };
            const en = {
                x: (a.x + b.x * 2) / 3,
                y: (a.y + b.y * 2) / 3,
            };
            // meander magnitude ~ 0.4..0.7
            const meandr = 0.4 + rng.float() * 0.3;
            if (rng.float() > 0.5) {
                st.x += meandr;
                en.x -= meandr;
            }
            else {
                st.y += meandr;
                en.y -= meandr;
            }
            out.push(st, en);
        }
    }
    return out;
}
/**
 * Convert a polyline into cubic Bézier segments equivalent to a
 * Catmull–Rom spline (centripetal parameterization if alpha=0.5; here alpha=1).
 *
 * Returns one cubic segment per consecutive pair of polyline points.
 * Each segment starts at p[i] and ends at p[i+1].
 */
function catmullRomToBeziers(pts, alpha = 1) {
    const n = pts.length;
    if (n < 2)
        return [];
    const beziers = [];
    // Helper: distance^alpha
    const td = (p, q) => Math.pow(Math.hypot(q.x - p.x, q.y - p.y), alpha);
    for (let i = 0; i < n - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(n - 1, i + 2)];
        // chord-length parameterization
        const t0 = 0;
        const t1 = t0 + td(p0, p1);
        const t2 = t1 + td(p1, p2);
        const t3 = t2 + td(p2, p3);
        // Avoid degenerate divisions
        const m1x = ((p2.x - p0.x) / (t2 - t0 || 1)) * (t1 - t0);
        const m1y = ((p2.y - p0.y) / (t2 - t0 || 1)) * (t1 - t0);
        const m2x = ((p3.x - p1.x) / (t3 - t1 || 1)) * (t3 - t2);
        const m2y = ((p3.y - p1.y) / (t3 - t1 || 1)) * (t3 - t2);
        // Convert to cubic Bézier control points
        // See standard Catmull–Rom -> Bézier conversion with parameterization
        const c1x = p1.x + m1x / 3;
        const c1y = p1.y + m1y / 3;
        const c2x = p2.x - m2x / 3;
        const c2y = p2.y - m2y / 3;
        beziers.push({
            sx: p1.x, sy: p1.y,
            cx1: c1x, cy1: c1y,
            cx2: c2x, cy2: c2y,
            ex: p2.x, ey: p2.y,
        });
    }
    return beziers;
}
