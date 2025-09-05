// src/core/idle.js
// Centralized idle scheduler with safe options + cancellation
// Usage:
//   const h = deferIdle(() => doWork(), { timeout: 1000, fallbackDelay: 16 });
//   cancelIdle(h);

function hasRIC() {
  return typeof window !== "undefined" && typeof window.requestIdleCallback === "function";
}

export function deferIdle(cb, opts = {}) {
  const { timeout, fallbackDelay = 16, signal } = opts;

  if (signal?.aborted) return { type: "none", id: null, cancel: () => {} };

  const wrapped = (deadline) => {
    if (signal?.aborted) return;
    try { cb(deadline); } catch (err) { /* console.error("[idle] callback error:", err); */ }
  };

  if (hasRIC()) {
    // Only pass the options object when timeout is a finite number (avoids Safari/strict polyfills throwing).
    if (Number.isFinite(timeout)) {
      const id = window.requestIdleCallback(wrapped, { timeout: Number(timeout) });
      return { type: "ric", id, cancel: () => window.cancelIdleCallback?.(id) };
    } else {
      const id = window.requestIdleCallback(wrapped);
      return { type: "ric", id, cancel: () => window.cancelIdleCallback?.(id) };
    }
  }

  // Fallback: use a short timeout so we don't block the frame
  const delay = Math.max(0, Number.isFinite(fallbackDelay) ? fallbackDelay : 16);
  const id = window.setTimeout(() => wrapped({ didTimeout: true, timeRemaining: () => 0 }), delay);
  return { type: "timeout", id, cancel: () => window.clearTimeout(id) };
}

export function cancelIdle(handle) {
  if (!handle || typeof handle.cancel !== "function") return;
  try { handle.cancel(); } catch (err) { /* noop */ }
}
