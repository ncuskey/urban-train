const SVG_NS = "http://www.w3.org/2000/svg";
export function renderHydrology(container, outputs, opts = {}) {
    const { oceanFill = "#5E4FA2", islandFill = "#f9f9eb", lakeFill = "#4D83AE", lakeStroke = "#386e98", coastStroke = "black", riverStroke = "#4D83AE", riverShadow = "black", blurFilterId = null, shallowPatternId = null, hardClear = false, perSegment = true, maskId = null } = opts;
    const svg = container.ownerSVGElement || (container.tagName === "svg" ? container : null);
    if (!svg)
        throw new Error("renderHydrology: pass an <svg> or a <g> inside an <svg>");
    // If the caller passed the <svg>, try to use the app's zoom root first
    const root = (container.tagName === "svg"
        ? (container.querySelector("#world") ||
            container.querySelector("g.viewbox") ||
            container) // last resort: svg itself
        : container); // already a <g>
    // 0) Optional hard clear (but keep <defs>)
    if (hardClear) {
        const defs = svg.querySelector("defs");
        while (svg.firstChild)
            svg.removeChild(svg.firstChild);
        if (defs)
            svg.appendChild(defs);
    }
    // 1) Ensure layer stack exists (Azgaar order)
    const layers = ensureLayers(root, opts);
    // 2) Clear dynamic layers
    clearLayer(layers.oceanLayer);
    clearLayer(layers.shallow);
    clearLayer(layers.islandBack);
    clearLayer(layers.lakecoast);
    clearLayer(layers.coastline);
    clearLayer(layers.riversShade);
    clearLayer(layers.rivers);
    // 3) Ocean backdrop (full-rect fill)
    const { width, height } = getViewport(svg);
    const oceanRect = el("rect", {
        x: "0", y: "0",
        width: String(width),
        height: String(height),
        fill: oceanFill
    });
    layers.oceanLayer.appendChild(oceanRect);
    // 3.5) Apply mask if available
    const maskIdToUse = maskId || "shape"; // your index.html already has <mask id="shape">
    const maskUrl = svg.querySelector(`#${maskIdToUse}`) ? `url(#${maskIdToUse})` : null;
    if (maskUrl) {
        layers.oceanLayer.setAttribute("mask", maskUrl);
    }
    // 4) True coastal shallows (if any)
    if (shallowPatternId && outputs.cells) {
        const polys = outputs.cells.filter(c => c.type === "shallow" && Array.isArray(c.polygon) && c.polygon.length > 2);
        for (const c of polys) {
            let d = `M ${c.polygon[0][0]} ${c.polygon[0][1]}`;
            for (let i = 1; i < c.polygon.length; i++)
                d += ` L ${c.polygon[i][0]} ${c.polygon[i][1]}`;
            d += " Z";
            layers.shallow.appendChild(el("path", {
                d, fill: `url(#${shallowPatternId})`, opacity: "0.8", stroke: "none"
            }));
        }
        if (maskUrl) {
            layers.shallow.setAttribute("mask", maskUrl);
        }
    }
    // 5) Island background (under coasts/rivers)
    //    Draw each island ring as a filled path
    for (const ring of outputs.coastIslands) {
        const d = ringToPathD(ring, true);
        const p = el("path", {
            d,
            fill: islandFill,
            stroke: "none"
        });
        layers.islandBack.appendChild(p);
    }
    // 6) Lakes (shade + stroke)
    for (const ring of outputs.coastLakes) {
        const d = ringToPathD(ring, true);
        // Shade (wide, blurred line) — optional
        const lakeShade = el("path", {
            d,
            fill: "none",
            stroke: darken(lakeStroke, 0.25),
            "stroke-linecap": "round",
            "stroke-width": "1",
            "vector-effect": "none",
            opacity: "0.5",
            filter: blurFilterId ? `url(#${blurFilterId})` : undefined
        });
        layers.lakecoast.appendChild(lakeShade);
        // Fill + stroke
        const lakeFillPath = el("path", {
            d,
            fill: lakeFill,
            stroke: lakeStroke,
            "stroke-width": "0.2",
            "vector-effect": "none"
        });
        layers.lakecoast.appendChild(lakeFillPath);
    }
    // 7) Coastlines (land vs ocean + lake rims)
    for (const ring of outputs.coastIslands) {
        const d = ringToPathD(ring, true);
        const p = el("path", {
            d,
            fill: "none",
            stroke: coastStroke,
            opacity: "0.9",
            "stroke-width": "0.3",
            "vector-effect": "none",
            filter: blurFilterId ? `url(#${blurFilterId})` : undefined
        });
        layers.coastline.appendChild(p);
    }
    // 8) Rivers: per-segment rendering for Azgaar-accurate widths
    if (perSegment) {
        for (const s of outputs.riverSegments) {
            const d = `M ${s.sx} ${s.sy} C ${s.cx1} ${s.cy1} ${s.cx2} ${s.cy2} ${s.ex} ${s.ey}`;
            layers.riversShade.appendChild(el("path", {
                d, fill: "none",
                stroke: riverShadow,
                "stroke-linecap": "round",
                "stroke-linejoin": "round",
                "stroke-width": String(s.shadowWidth),
                "vector-effect": "none",
                opacity: "0.9",
                filter: blurFilterId ? `url(#${blurFilterId})` : undefined
            }));
            layers.rivers.appendChild(el("path", {
                d, fill: "none",
                stroke: riverStroke,
                "stroke-linecap": "round",
                "stroke-linejoin": "round",
                "stroke-width": String(s.width),
                "vector-effect": "none"
            }));
        }
    }
    else {
        // Fallback: group segments by riverId into single path per river
        const byRiver = groupBy(outputs.riverSegments, s => s.riverId);
        for (const [riverId, segs] of byRiver) {
            // Shadow first
            const dShadow = bezierSegmentsToPathD(segs);
            const shadowPath = el("path", {
                d: dShadow,
                fill: "none",
                stroke: riverShadow,
                "stroke-linecap": "round",
                "stroke-linejoin": "round",
                // We can't vary stroke-width along a single path segment-by-segment in pure SVG easily.
                // Azgaar draws each segment individually. To keep perf, we approximate with max width.
                "stroke-width": String(maxStroke(segs, "shadowWidth")),
                "vector-effect": "none",
                opacity: "0.9",
                filter: blurFilterId ? `url(#${blurFilterId})` : undefined
            });
            layers.riversShade.appendChild(shadowPath);
            // Main river
            const dMain = dShadow; // same geometry
            const riverPath = el("path", {
                d: dMain,
                fill: "none",
                stroke: riverStroke,
                "stroke-linecap": "round",
                "stroke-linejoin": "round",
                "stroke-width": String(maxStroke(segs, "width")),
                "vector-effect": "none"
            });
            layers.rivers.appendChild(riverPath);
        }
    }
}
/* -------------------- helpers -------------------- */
function ensureLayers(root, opts) {
    // Optionally let you reuse app IDs:
    const ids = Object.assign({
        oceanLayer: "oceanLayer",
        shallow: "shallow",
        islandBack: "islandBack",
        lakecoast: "lakecoast",
        coastline: "coastline",
        riversShade: "riversShade",
        rivers: "rivers",
        mapCells: "mapCells",
        hatching: "hatching",
        circles: "circles",
        grid: "grid"
    }, opts.layerIds || {});
    const g = (idOrClass) => {
        // prefer id if a group already exists, else create with that id
        let el = root.querySelector(`#${CSS.escape(idOrClass)}`);
        if (!el)
            el = root.querySelector(`g.${CSS.escape(idOrClass)}`);
        if (!el) {
            el = document.createElementNS(root.namespaceURI, "g");
            el.setAttribute("id", idOrClass); // ids play nicer with your CSS
            root.appendChild(el);
        }
        return el;
    };
    const oceanLayer = g(ids.oceanLayer);
    const shallow = g(ids.shallow);
    const islandBack = g(ids.islandBack);
    const mapCells = g(ids.mapCells);
    const hatching = g(ids.hatching);
    const lakecoast = g(ids.lakecoast);
    const coastline = g(ids.coastline);
    const riversShade = g(ids.riversShade);
    const rivers = g(ids.rivers);
    const circles = g(ids.circles);
    const grid = g(ids.grid);
    // keep layer order consistent with your app
    [oceanLayer, shallow, islandBack, mapCells, hatching, lakecoast, coastline, riversShade, rivers, circles, grid]
        .forEach(n => root.appendChild(n));
    return { root, oceanLayer, shallow, islandBack, mapCells, hatching, lakecoast, coastline, riversShade, rivers, circles, grid };
}
function ensureGroup(parent, className) {
    const sel = parent.querySelector(`g.${cssEscape(className)}`);
    if (sel)
        return sel;
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("class", className);
    parent.appendChild(g);
    return g;
}
function clearLayer(layer) {
    while (layer.firstChild)
        layer.removeChild(layer.firstChild);
}
function el(name, attrs) {
    const e = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined)
            continue;
        e.setAttribute(k, String(v));
    }
    return e;
}
function getViewport(svg) {
    const w = Number(svg.getAttribute("width") ?? 640);
    const h = Number(svg.getAttribute("height") ?? 360);
    return { width: w, height: h };
}
function ringToPathD(ring, closed = true) {
    if (!ring.length)
        return "";
    const [p0, ...rest] = ring;
    let d = `M ${p0.x} ${p0.y}`;
    for (const p of rest)
        d += ` L ${p.x} ${p.y}`;
    if (closed)
        d += " Z";
    return d;
}
function bezierSegmentsToPathD(segs) {
    // Concatenate as a single path of cubic segments.
    // Start where the first segment starts.
    if (!segs.length)
        return "";
    let d = `M ${segs[0].sx} ${segs[0].sy}`;
    for (const s of segs) {
        d += ` C ${s.cx1} ${s.cy1} ${s.cx2} ${s.cy2} ${s.ex} ${s.ey}`;
    }
    return d;
}
function maxStroke(segs, key) {
    let m = 0.1;
    for (const s of segs)
        if (s[key] > m)
            m = s[key];
    return m;
}
function groupBy(arr, by) {
    const m = new Map();
    for (const a of arr) {
        const k = by(a);
        const list = m.get(k);
        if (list)
            list.push(a);
        else
            m.set(k, [a]);
    }
    return m;
}
// Simple "darken" helper for lake shade
function darken(hex, amt = 0.2) {
    const c = parseHex(hex);
    const f = (x) => Math.max(0, Math.min(255, Math.round(x * (1 - amt))));
    return `rgb(${f(c.r)},${f(c.g)},${f(c.b)})`;
}
function parseHex(hex) {
    const s = hex.replace("#", "");
    if (s.length === 3) {
        return {
            r: parseInt(s[0] + s[0], 16),
            g: parseInt(s[1] + s[1], 16),
            b: parseInt(s[2] + s[2], 16),
        };
    }
    return {
        r: parseInt(s.slice(0, 2), 16),
        g: parseInt(s.slice(2, 4), 16),
        b: parseInt(s.slice(4, 6), 16),
    };
}
// Escape for querySelector usage on class names
function cssEscape(s) {
    return s.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, "\\$1");
}
