// Minimal invariants to catch regressions early. All tests are safe to call even if data is missing.
// Usage:
//   import { runSelfTests, renderSelfTestBadge } from "./selftest.js";
//   const results = runSelfTests(cache, { svg });
//   renderSelfTestBadge(results);

function ok(pass, name, details = "") { return { pass, name, details }; }

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

  return out;
}

export function renderSelfTestBadge(results, mount = document.body) {
  try {
    const total = results.length;
    const pass = results.filter(r => r.pass).length;
    let el = document.getElementById("selftest-badge");
    if (!el) {
      el = document.createElement("div");
      el.id = "selftest-badge";
      el.style.cssText = `position: fixed; right: 10px; bottom: 10px; z-index: 9999; font: 12px/1.2 system-ui, sans-serif; background: rgba(0,0,0,0.65); color: #fff; padding: 8px 10px; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.2);`;
      mount.appendChild(el);
    }
    el.textContent = `Self‑tests: ${pass}/${total}`;
    el.title = results.map(r => `${r.pass ? "✔" : "✖"} ${r.name}${r.details ? " — " + r.details : ""}`).join("\n");
  } catch (_) { /* no‑op */ }
}
