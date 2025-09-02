// src/labels/placement/candidates.js
// Minimal candidate boxes for visible anchors (no collision yet).

import { visibleAtK } from "../lod.js";
import { measureLabel } from "../metrics/text-metrics.js";

export function makeCandidates({ anchorsLOD, k = 1.0 }) {
  if (!Array.isArray(anchorsLOD)) return [];
  const visibles = visibleAtK(anchorsLOD, k);

  return visibles.map(a => {
    const tier  = a.tier || "t3";
    const style = a.style || {};
    const size  = (style.size && style.size[tier]) || 12;
    const track = style.letterSpacing || 0;

    // text string (placeholder until names are wired)
    const rawText = a.text || a.id;
    const m = measureLabel({ text: rawText, style, tier });
    const text = m.text;           // with caps applied for measurement
    const w = Math.max(6, m.w);
    const h = Math.max(6, (m.asc + m.desc));

    // center the box on (x,y) for now (we'll bias per kind later)
    const x0 = a.x - w / 2;
    const y0 = a.y - h / 2;
    const x1 = a.x + w / 2;
    const y1 = a.y + h / 2;

    return {
      id: a.id,
      kind: a.kind,
      tier,
      x: a.x, y: a.y,
      text, size,
      w, h, x0, y0, x1, y1,
      lod: a.lod || { minK: 1, maxK: 32 },
      style
    };
  });
}
