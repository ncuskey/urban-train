// src/core/rect.js
export function intersectRect(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const btm = Math.min(a.y + a.h, b.y + b.h);
  const w = Math.max(0, r - x);
  const h = Math.max(0, btm - y);
  return { x, y, w, h };
}
export function clampPointToRect(x, y, rect, pad = 0) {
  const cx = Math.max(rect.x + pad, Math.min(rect.x + rect.w - pad, x));
  const cy = Math.max(rect.y + pad, Math.min(rect.y + rect.h - pad, y));
  return { cx, cy };
}
// Given a SAT mask (Uint8Array a, gw, gh, cellPx, viewport), compute water fraction in a px rect.
export function waterFractionInRect(mask, rect) {
  const { a, gw, gh, cellPx, viewport } = mask;
  const gx0 = Math.max(0, Math.floor((rect.x - viewport.x) / cellPx));
  const gy0 = Math.max(0, Math.floor((rect.y - viewport.y) / cellPx));
  const gx1 = Math.min(gw, Math.ceil((rect.x + rect.w - viewport.x) / cellPx));
  const gy1 = Math.min(gh, Math.ceil((rect.y + rect.h - viewport.y) / cellPx));
  if (gx1 <= gx0 || gy1 <= gy0) return 0;
  let water = 0, cells = 0;
  for (let y = gy0; y < gy1; y++) {
    for (let x = gx0; x < gx1; x++) {
      cells++; water += a[y * gw + x] ? 1 : 0;
    }
  }
  return cells ? water / cells : 0;
}
