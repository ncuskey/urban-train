// src/core/zoom-utils.js
// Zoom utility functions for consistent zoom state access

/**
 * Get the current zoom scale factor reliably
 * Falls back to window.currentTransform.k if D3 zoom transform is unavailable
 * @returns {number} Current zoom scale factor (k)
 */
export function getZoomScale() {
  try {
    const svg = d3.select('svg').node();
    if (svg) {
      return d3.zoomTransform(svg).k;
    }
  } catch (e) {
    // Fallback if D3 or SVG not available
  }
  return window.currentTransform?.k ?? 1;
}

/**
 * Get the current zoom transform object reliably
 * Falls back to window.currentTransform if D3 zoom transform is unavailable
 * @returns {Object} Current zoom transform {k, x, y}
 */
export function getZoomTransform() {
  try {
    const svg = d3.select('svg').node();
    if (svg) {
      return d3.zoomTransform(svg);
    }
  } catch (e) {
    // Fallback if D3 or SVG not available
  }
  return window.currentTransform ?? { k: 1, x: 0, y: 0 };
}

/**
 * Get the current zoom state in a convenient format
 * @returns {Object} Current zoom state {scale, x, y, level}
 */
export function getZoomState() {
  const transform = getZoomTransform();
  return {
    scale: transform.k,
    x: transform.x,
    y: transform.y,
    level: getZoomLevel(transform.k)
  };
}

/**
 * Get a human-readable zoom level description
 * @param {number} k - Zoom scale factor
 * @returns {string} Zoom level description
 */
function getZoomLevel(k) {
  if (k >= 4) return 'very close';
  if (k >= 2) return 'close';
  if (k >= 1) return 'normal';
  if (k >= 0.5) return 'far';
  if (k >= 0.25) return 'very far';
  return 'extreme far';
}

/**
 * Set up global zoom getter for easy access from console or other modules
 * This provides a consistent way to get zoom scale from anywhere
 */
export function setupGlobalZoomGetter() {
  if (typeof window !== 'undefined') {
    window.getZoomScale = window.getZoomScale || getZoomScale;
    window.getZoomTransform = window.getZoomTransform || getZoomTransform;
    window.getZoomState = window.getZoomState || getZoomState;
  }
}

// Auto-setup when module loads
setupGlobalZoomGetter();
