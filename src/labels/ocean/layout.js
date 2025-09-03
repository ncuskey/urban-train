// src/labels/ocean/layout.js
import { measureLine, wrapText } from "../../core/measure-text.js";

/**
 * Compute best ocean label layout inside rect (screen px), counter-scaling by 1/k at render time.
 * Returns {ok, fontPx, lines, anchor:{cx,cy}, box:{x,y,w,h}, score, reasons[]}
 */
export function computeBestLayout(rect, text, k, opts = {}) {
  if (!rect || !Number.isFinite(rect.w) || !Number.isFinite(rect.h)) return { ok: false, reason: "bad rect", rect };
  const {
    maxPx = 36, minPx = 12, stepPx = 1,
    padding = 8, letterSpacing = 0.08, // em-like, we treat as px
    family = "serif", lineHeight = 1.2, maxLines = 3,
  } = opts;

  const innerW = Math.max(0, rect.w - 2 * padding);
  const innerH = Math.max(0, rect.h - 2 * padding);
  if (innerW < 20 || innerH < minPx) return { ok: false, reason: "tiny rect", rect };

  const reasons = [];
  const center = { cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2 };

  let best = null;
  for (let px = maxPx; px >= minPx; px -= stepPx) {
    // Try single line first
    const one = measureLine(text, px, { family, letterSpacing, lineHeight });
    if (one.width <= innerW && one.height <= innerH) {
      const score = px * 10 + (one.width / innerW) * 2 - 0.5; // prefer larger px; slight fill reward, slight penalty for no wrap (keeps stability)
      best = { ok: true, fontPx: px, lines: [text], lineWidths: [one.width], anchor: center, box: rect, score, reasons };
      break; // max px single-line wins
    }
    // Try wrapped into 2..maxLines
    for (let lines = 2; lines <= maxLines; lines++) {
      const wrapped = wrapText(text, px, innerW, { family, letterSpacing, lineHeight }, lines);
      if (!wrapped) continue;
      if (wrapped.height <= innerH) {
        const longest = Math.max(...wrapped.lineWidths, 0);
        // Scoring: prefer bigger px, balanced aspect (longest line near innerW), fewer lines
        const fill = Math.min(1, (longest / innerW)) * Math.min(1, (wrapped.height / innerH));
        const linePenalty = (lines - 1) * 1.5; // light penalty for extra lines
        const score = px * 10 + fill * 3 - linePenalty;
        const candidate = {
          ok: true, fontPx: px, lines: wrapped.lines, lineWidths: wrapped.lineWidths,
          anchor: center, box: rect, score, reasons
        };
        if (!best || candidate.score > best.score) best = candidate;
        // don't break; a 3-line at the same px may fit better in very tall skinny rects
      }
    }
  }

  if (!best) return { ok: false, reason: "no fit", rect, reasons };
  reasons.push({ chosenPx: best.fontPx, lines: best.lines.length, score: best.score });
  return best;
}
