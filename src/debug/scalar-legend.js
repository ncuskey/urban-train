// src/debug/scalar-legend.js
// Inline legend for the Scalar overlay. Renders into #scalarLegend div.

import { scalarColor, computeScalarDomain } from "./scalar-overlay.js";

export function renderScalarLegend(polygons, seaLevel, field, container) {
  if (!container) return;
  const domain = computeScalarDomain(polygons, field, seaLevel);
  // Show/hide container based on availability
  container.style.display = domain.count ? "block" : "none";
  container.setAttribute("aria-hidden", domain.count ? "false" : "true");
  if (!domain.count) {
    container.innerHTML = "";
    return;
  }

  const width = 160, height = 44, barH = 10, pad = 6;
  const id = "scalarGrad-" + field;

  // Build SVG
  container.innerHTML = `
    <div class="legend-title">Scalar: ${field}</div>
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="${id}" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%"   stop-color="${scalarColor(field, 0)}"></stop>
          <stop offset="50%"  stop-color="${scalarColor(field, 0.5)}"></stop>
          <stop offset="100%" stop-color="${scalarColor(field, 1)}"></stop>
        </linearGradient>
      </defs>
      <rect x="${pad}" y="${pad}" width="${width - pad*2}" height="${barH}" fill="url(#${id})" stroke="rgba(255,255,255,0.25)"></rect>
      <text class="legend-label" x="${pad}" y="${pad + barH + 12}">${fmt(domain.min, field)}</text>
      <text class="legend-label" x="${width/2}" y="${pad + barH + 12}" text-anchor="middle">${fmt(domain.mean, field)}</text>
      <text class="legend-label" x="${width - pad}" y="${pad + barH + 12}" text-anchor="end">${fmt(domain.max, field)}</text>
    </svg>
  `;
}

function fmt(value, field) {
  if (!Number.isFinite(value)) return "—";
  if (field === "temp") return value.toFixed(1) + "°C";
  if (field === "prec") return value.toFixed(2);
  if (field === "height") return value.toFixed(3);
  return value.toFixed(2);
}
