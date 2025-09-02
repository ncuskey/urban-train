// src/labels/lod.js
import { getStyleTokens } from "./index.js";

/** Attach min/max zoom (k) bands by tier. */
export function computeLOD({
  anchors,
  tokens = getStyleTokens(),
  baseMinK = { t1: 1.0, t2: 1.8, t3: 3.2, t4: 6.4 },
  clamp = [1.0, 32.0],
  minKByKind = null,     // NEW: optional overrides per kind (e.g., { lake: 1.2, sea: 1.1 })
}) {
  if (!Array.isArray(anchors)) return [];
  const [minClamp, maxClamp] = clamp;
  return anchors.map(a => {
    const tier = a.tier || "t3";
    let minK = Math.max(baseMinK[tier] ?? baseMinK.t3, minClamp);
    if (minKByKind && a.kind in minKByKind) {
      minK = Math.max(minKByKind[a.kind], minClamp);
    }
    const maxK = maxClamp;
    return { ...a, lod: { minK, maxK } };
  });
}

/** Filter helper: anchors visible at zoom scale k. */
export function visibleAtK(anchors, k) {
  if (!Array.isArray(anchors)) return [];
  return anchors.filter(a => {
    const { minK = 1.0, maxK = 32.0 } = a.lod || {};
    return k >= minK && k <= maxK;
  });
}
