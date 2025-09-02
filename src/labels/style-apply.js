// src/labels/style-apply.js
// Attach style objects to anchors based on 'kind'.

import { getStyleFor } from "./index.js";

/** Attach style objects to anchors based on 'kind'. */
export function attachStyles(anchors) {
  if (!Array.isArray(anchors)) return [];
  return anchors.map(a => {
    const s = getStyleFor(a.kind) || getStyleFor("region") || null;
    return { ...a, style: s };
  });
}
