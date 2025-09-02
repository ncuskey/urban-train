// src/labels/enrich.js
// Enrich anchors with polygon context + provisional kind classification.

function isWaterPoly(poly, sea = 0.10) {
  if (!poly) return false;
  if (poly.isWater != null) return !!poly.isWater;
  if (poly.water != null)   return !!poly.water;
  const h = (poly.height ?? poly.h);
  if (typeof h === "number") return h <= sea;
  return false;
}

/**
 * Enrich anchors with polygon context + provisional kind.
 * @param {Object} args
 * @param {Array}  args.anchors
 * @param {Array}  args.polygons
 * @param {number} args.sea     - water height threshold
 * @return {{anchors:Array, metrics:Object}}
 */
export function enrichAnchors({ anchors, polygons, sea = 0.10 }) {
  if (!Array.isArray(anchors)) return { anchors: [], metrics: { total: 0, water: 0 } };

  const out = anchors.map(a => {
    let polyIndex = a.polyIndex;
    if (polyIndex == null && typeof a.id === "string" && a.id.startsWith("poly-")) {
      const n = Number(a.id.slice(5));
      if (Number.isFinite(n)) polyIndex = n;
    }

    const poly   = (Array.isArray(polygons) && Number.isInteger(polyIndex)) ? polygons[polyIndex] : undefined;
    const water  = isWaterPoly(poly, sea);
    const kind   = water ? "ocean" : "region";

    return {
      ...a,
      polyIndex,
      isWater: water,
      kind,
      h: (poly && (poly.height ?? poly.h)) ?? null
    };
  });

  const waterCount = out.reduce((acc, a) => acc + (a.isWater ? 1 : 0), 0);
  return { anchors: out, metrics: { total: out.length, water: waterCount } };
}
