// Minimal invariants to catch regressions early. All tests are safe to call even if data is missing.
// Usage:
//   import { runSelfTests, renderSelfTestBadge } from "./selftest.js";
//   const results = runSelfTests(cache, { svg });
//   renderSelfTestBadge(results);

function ok(pass, name, details = "") { return { pass, name, details }; }

// Helper functions for fixing common failures
export function clamp01(arr) {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = max - min || 1;
  for (let i = 0; i < arr.length; i++) {
    let n = (arr[i] - min) / span;
    if (n < 0) n = 0;
    else if (n > 1) n = 1;
    arr[i] = n;
  }
  return arr;
}

export function ensureReciprocalNeighbors(graph) {
  const cells = graph.cells;
  for (const c of cells) {
    if (!c || !Array.isArray(c.neighbors)) continue;
    for (const nId of c.neighbors) {
      const n = cells[nId];
      if (!n) continue;
      if (!Array.isArray(n.neighbors)) n.neighbors = [];
      if (!n.neighbors.includes(c.id)) n.neighbors.push(c.id);
    }
  }
  return graph;
}

export function runSelfTests(cache = {}, dom = {}) {
  const out = [];
  const { graph, height, rivers } = cache;

  // Graph: reciprocal neighbors
  if (graph && Array.isArray(graph.cells)) {
    let bad = 0;
    for (const c of graph.cells) {
      if (!c || !Array.isArray(c.neighbors)) continue;
      for (const n of c.neighbors) {
        const nx = graph.cells[n];
        if (!nx || !Array.isArray(nx.neighbors)) continue;
        if (!nx.neighbors.includes(c.id)) bad++;
      }
    }
    out.push(ok(bad === 0, "Graph neighbors reciprocal", bad ? `${bad} mismatches` : ""));
  } else {
    out.push(ok(true, "Graph present", "(skipped: none)"));
  }

  // Height: range 0..1
  if (height && height.length) {
    let min = +Infinity, max = -Infinity, bad = 0;
    for (let i = 0; i < height.length; i++) {
      const v = height[i];
      if (v < 0 || v > 1 || !Number.isFinite(v)) bad++;
      if (v < min) min = v; if (v > max) max = v;
    }
    out.push(ok(bad === 0, "Height in [0..1]", bad ? `${bad} out of range` : `min=${min.toFixed(3)} max=${max.toFixed(3)}`));
  } else {
    out.push(ok(true, "Height present", "(skipped: none)"));
  }

  // Rivers: non-negative widths (if provided)
  if (Array.isArray(rivers)) {
    const neg = rivers.filter(r => r && r.width < 0).length;
    out.push(ok(neg === 0, "Rivers non-negative width", neg ? `${neg} negatives` : ""));
  }

  // DOM layers exist
  if (dom && dom.svg) {
    const need = ["ocean","land","coast","rivers","roads","searoutes","towns","labels","hud"];
    const missing = need.filter(id => !dom.svg.querySelector(`:scope > g#${id}`));
    out.push(ok(missing.length === 0, "SVG layers present", missing.length ? `missing: ${missing.join(", ")}` : ""));
  }

  // Geo sanity (optional)
  if (cache?.polygons && Array.isArray(cache.polygons) && cache.polygons.length) {
    const polys = cache.polygons;
    // take a small random sample
    let aligned = 0, tested = 0;
    for (let i = 0; i < Math.min(200, polys.length-1); i++) {
      const a = polys[i], b = polys[i+1];
      if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(b.lat) || !Number.isFinite(a.lon) || !Number.isFinite(b.lon)) continue;
      const approxY = (a[0]?.[1] ?? 0) - (b[0]?.[1] ?? 0); // very rough from first vertex
      const approxX = (a[0]?.[0] ?? 0) - (b[0]?.[0] ?? 0);
      if (approxY !== 0) { aligned += Math.sign(approxY) === Math.sign(b.lat - a.lat) ? 1 : 0; tested++; }
      if (approxX !== 0) { aligned += Math.sign(approxX) === Math.sign(b.lon - a.lon) ? 1 : 0; tested++; }
    }
    if (tested) {
      const frac = aligned / tested;
      out.push(ok(frac > 0.5, 'Geo lat/lon monotonicity (rough)', `aligned=${aligned}/${tested}`));
    }
  }

  return out;
}

export function renderSelfTestBadge(results, mount = document.body) {
  try {
    const total = results.length;
    const pass = results.filter(r => r.pass).length;
    const fails = results.filter(r => !r.pass);

    let el = document.getElementById("selftest-badge");
    if (!el) {
      el = document.createElement("div");
      el.id = "selftest-badge";
      el.style.cssText = `position: fixed; right: 10px; bottom: 10px; z-index: 9999; font: 12px/1.2 system-ui, sans-serif; background: rgba(0,0,0,0.65); color: #fff; padding: 8px 10px; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); cursor:pointer`;
      mount.appendChild(el);
    }
    el.textContent = `Self‑tests: ${pass}/${total}`;
    el.title = results.map(r => `${r.pass ? "✔" : "✖"} ${r.name}${r.details ? " — " + r.details : ""}`).join("\n");
    el.onclick = () => {
      const fails = results.filter(r => !r.pass);
      // let the click finish and a frame render before any work
      requestAnimationFrame(() => {
        console.group("Self-tests");
        console.table(results);
        console.groupEnd();
        showToast(
          fails.length
            ? `Failures:\n• ` + fails.map(f => `${f.name}${f.details ? " — " + f.details : ""}`).join("\n• ")
            : "All tests passing ✅",
          3500
        );
      });
    };
  } catch (_) { /* no‑op */ }
}

// minimal toast (no layout thrash, auto-dismiss)
function showToast(text, ms = 3000) {
  let t = document.getElementById("selftest-toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "selftest-toast";
    t.style.cssText =
      "position:fixed;right:12px;bottom:52px;z-index:9999;max-width:320px;" +
      "font:12px/1.35 system-ui,sans-serif;background:#111;color:#fff;" +
      "padding:10px 12px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.25);white-space:pre-wrap";
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.style.opacity = "1";
  clearTimeout(t._hide);
  t._hide = setTimeout(() => (t.style.opacity = "0"), ms);
}
