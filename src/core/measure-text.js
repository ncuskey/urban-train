// src/core/measure-text.js
let _canvas, _ctx;
function ctx() {
  if (!_canvas) { _canvas = document.createElement("canvas"); _ctx = _canvas.getContext("2d"); }
  return _ctx;
}

function fontString(px, family = "serif", weight = "", style = "") {
  const size = Math.max(1, Math.floor(px));
  return `${style} ${weight} ${size}px ${family}`.trim();
}

/** Measure a single line of text. Returns {width, height, actualBoundingBoxAscent, …}. */
export function measureLine(text, fontPx, opts = {}) {
  const { family = "serif", letterSpacing = 0, lineHeight = 1.2, weight = "", style = "" } = opts;
  const c = ctx();
  c.font = fontString(fontPx, family, weight, style);
  const m = c.measureText(text || "");
  const width = (m.width || 0) + Math.max(0, (text?.length ? (text.length - 1) : 0)) * letterSpacing;
  const height = Math.ceil(fontPx * lineHeight);
  return { width, height, fontPx, lineHeight, letterSpacing, family };
}

/** Greedy word wrap into ≤ maxLines that fits maxWidth; returns null if it can't fit. */
export function wrapText(text, fontPx, maxWidth, opts = {}, maxLines = 3) {
  const words = (text || "").split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [""], lineWidths: [0], fontPx, height: measureLine("", fontPx, opts).height };
  const lines = []; const lineWidths = [];
  let cur = [], curW = 0;
  for (let i = 0; i < words.length; i++) {
    const attempt = cur.length ? cur.join(" ") + " " + words[i] : words[i];
    const w = measureLine(attempt, fontPx, opts).width;
    if (w <= maxWidth || cur.length === 0) { cur = attempt.split(" "); curW = w; }
    else { // wrap
      lines.push(cur.join(" ")); lineWidths.push(curW);
      if (lines.length === maxLines) return null;
      cur = [words[i]]; curW = measureLine(words[i], fontPx, opts).width;
      if (curW > maxWidth) return null;
    }
  }
  if (cur.length) { lines.push(cur.join(" ")); lineWidths.push(curW); }
  const lineH = measureLine("Mg", fontPx, opts).height;
  const height = lineH * lines.length;
  return { lines, lineWidths, fontPx, height, lineHeight: lineH };
}
