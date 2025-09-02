// src/labels/metrics/text-metrics.js
// Measure text using Canvas (cached). Handles size per tier, caps, letterSpacing.

let _ctx = null;
function ctx() {
  if (_ctx) return _ctx;
  const c = document.createElement("canvas");
  c.width = 1; c.height = 1;
  _ctx = c.getContext("2d");
  return _ctx;
}

function cssFont({ size=12, weight=400, italic=false, family="serif" }) {
  const w = (typeof weight === "number" || /^\d/.test(weight)) ? String(weight) : (weight || 400);
  return `${italic ? "italic " : ""}${w} ${Math.max(1, Math.round(size))}px ${family}`;
}

function applyCaps(text, caps) {
  if (!text) return "";
  if (caps === "upper") return text.toUpperCase();
  if (caps === "title") {
    return text.replace(/\w[\w'-]*/g, (w) => {
      // small words to keep lower-case in title caps:
      if (/^(and|or|of|the|a|an|in|on|at|to|for|by|vs\.?)$/i.test(w)) return w.toLowerCase();
      return w[0].toUpperCase() + w.slice(1).toLowerCase();
    });
  }
  return text;
}

const _cache = new Map(); // key -> { w, asc, desc, em }

export function measureLabel({ text, style={}, tier="t3" }) {
  const size = (style.size && style.size[tier]) || 12;
  const family = style.fontFamily || "serif";
  const weight = style.weight || 400;
  const italic = !!style.italic;
  const letterSpacing = style.letterSpacing || 0;
  const caps = style.caps || "none";

  const shaped = applyCaps(text || "", caps);
  const key = JSON.stringify({ shaped, size, family, weight, italic, letterSpacing });

  if (_cache.has(key)) return { ..._cache.get(key), text: shaped };

  const c = ctx();
  c.font = cssFont({ size, weight, italic, family });

  // native measure
  const m = c.measureText(shaped);
  // width + tracking
  const trackExtra = Math.max(0, shaped.length - 1) * letterSpacing * size;
  let w = m.width + trackExtra;

  // ascent/desc from metrics if available; fallback ratios
  const asc = (m.actualBoundingBoxAscent ?? size * 0.8);
  const desc = (m.actualBoundingBoxDescent ?? size * 0.2);
  const em = size;

  const out = { w, asc, desc, em };
  _cache.set(key, out);
  return { ...out, text: shaped };
}
