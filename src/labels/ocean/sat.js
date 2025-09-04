// src/labels/ocean/sat.js

// Build a screen-space water mask inside a given viewport rect.
// - cells: array-like
// - getHeight(i): number
// - getXY(i): [x,y] in screen px
export function rasterizeWaterMask(viewport, cells, getHeight, getXY, seaLevel, cellPx = 8) {
  const gw = Math.max(1, Math.floor(viewport.w / cellPx));
  const gh = Math.max(1, Math.floor(viewport.h / cellPx));
  const a = new Uint8Array(gw * gh); // 1 = water, 0 = land/unknown

  const x0 = viewport.x, y0 = viewport.y;
  const idx = (gx, gy) => gy * gw + gx;

  const N = cells.length || 0;
  for (let i = 0; i < N; i++) {
    const h = getHeight(i);
    const isWater = Number.isFinite(h) && h <= seaLevel;
    const xy = getXY(i);
    if (!xy) continue;
    const gx = Math.floor((xy[0] - x0) / cellPx);
    const gy = Math.floor((xy[1] - y0) / cellPx);
    if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue;
    if (isWater) a[idx(gx, gy)] = 1;
  }
  return { a, gw, gh, cellPx, viewport };
}

// Erode water by r cells (so we stay off coasts). r ~ coastBufferPx / cellPx.
export function erodeWater(mask, r = 1) {
  if (r <= 0) return mask;
  const { a, gw, gh } = mask;
  const out = new Uint8Array(gw * gh);
  const id = (x, y) => y * gw + x;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let ok = a[id(x, y)] === 1;
      if (ok) {
        // if any neighbor within r is land (0), we drop this as well
        for (let dy = -r; ok && dy <= r; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= gh) continue;
          for (let dx = -r; ok && dx <= r; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= gw) continue;
            if (a[id(xx, yy)] === 0) ok = false;
          }
        }
      }
      out[id(x, y)] = ok ? 1 : 0;
    }
  }
  mask.a = out;
  return mask;
}

// Largest rectangle of ones in a binary grid (O(gw*gh)), histogram method.
export function largestRectOnes(mask) {
  const { a, gw, gh } = mask;
  const H = new Uint16Array(gw); // running heights
  let best = { gx: 0, gy: 0, gw: 0, gh: 0, area: 0 };

  for (let y = 0; y < gh; y++) {
    // update histogram
    for (let x = 0; x < gw; x++) {
      H[x] = a[y * gw + x] ? (H[x] + 1) : 0;
    }
    // max rectangle in histogram (monotonic stack)
    const stack = [];
    for (let x = 0; x <= gw; x++) {
      const h = x < gw ? H[x] : 0;
      let start = x;
      while (stack.length && h < stack[stack.length - 1].h) {
        const { h: hh, i: ii } = stack.pop();
        const width = x - ii;
        const area = hh * width;
        if (area > best.area) {
          best = { gx: ii, gy: y - hh + 1, gw: width, gh: hh, area };
        }
        start = ii;
      }
      stack.push({ h, i: start });
    }
  }
  return best.area > 0 ? best : null;
}

// Convert grid rect back to screen-space px rect
export function gridToScreenRect(mask, gr) {
  const { cellPx, viewport } = mask;
  return {
    x: viewport.x + gr.gx * cellPx,
    y: viewport.y + gr.gy * cellPx,
    w: gr.gw * cellPx,
    h: gr.gh * cellPx
  };
}
