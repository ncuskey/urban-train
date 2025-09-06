// js/modules/refine.js
// NOTE: d3 is global.

import { buildVoronoi } from "./geometry.js";
import { seaLevel } from "../hydrology/constants.js";

export function refineCoastlineAndRebuild({
  samples,
  diagram,
  polygons,
  mapWidth,
  mapHeight,
  seaLevel = seaLevel,
  targetSpacing = 8,      // sensible default; will be overridden by main.js
  minSpacingFactor = 0.75 // avoid clustering new points too tightly
}) {
  // 1) Collect coastal edges (land vs sea)
  const coastalEdges = [];
  for (let e = 0; e < diagram.edges.length; e++) {
    const edge = diagram.edges[e];
    if (!edge || !edge.left || !edge.right) continue;
    const li = edge.left.index;
    const ri = edge.right.index;
    const lh = polygons[li]?.height ?? 0;
    const rh = polygons[ri]?.height ?? 0;

    const leftIsLand  = lh >= seaLevel;
    const rightIsLand = rh >= seaLevel;
    if (leftIsLand === rightIsLand) continue; // both land or both sea -> not coastal

    // Keep edges with valid endpoints
    if (edge[0] && edge[1]) {
      const a = edge[0]; // [x, y]
      const b = edge[1];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      coastalEdges.push({ a, b, len });
    }
  }

  if (!coastalEdges.length) return { samples, diagram, polygons, added: 0 };

  // console.log(`[refine] Found ${coastalEdges.length} coastal edges`);

  // 2) Build quadtree for de-duplication
  const qt = d3.quadtree()
    .x(d => d[0])
    .y(d => d[1])
    .addAll(samples);

  const minSpacing = Math.max(2, targetSpacing * minSpacingFactor);
  const newPoints = [];

  function farEnough(x, y) {
    let ok = true;
    qt.visit((node, x0, y0, x1, y1) => {
      if (!node.length) {
        const dx = node.data[0] - x;
        const dy = node.data[1] - y;
        if (dx*dx + dy*dy < minSpacing*minSpacing) { ok = false; return true; }
      }
      const r = minSpacing;
      return x0 > x + r || x1 < x - r || y0 > y + r || y1 < y - r ? true : false;
    });
    return ok;
  }

  // 3) Subdivide each coastal edge and add points
  for (const {a, b, len} of coastalEdges) {
    // heuristic: 1 point for short edges, more for longer edges
    const segments = Math.max(1, Math.round(len / targetSpacing));
    for (let i = 1; i <= segments; i++) {
      const t = i / (segments + 1);
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;
      if (farEnough(x, y)) {
        const p = [x, y];
        newPoints.push(p);
        qt.add(p);
      }
    }
  }

  if (newPoints.length < 10) {
    // console.log(`[refine] Skipping rebuild: only ${newPoints.length} new points`);
    return { samples, diagram, polygons, added: newPoints.length };
  }

  const augmented = samples.concat(newPoints);

  // 4) Rebuild Voronoi with augmented samples
  const { diagram: newDiagram, polygons: newPolygons } = buildVoronoi(augmented, mapWidth, mapHeight);

  // 5) Transfer heights (nearest old cell via oldDiagram.find)
  const finder = diagram.find.bind(diagram);
  for (let i = 0; i < newPolygons.length; i++) {
    const poly = newPolygons[i];
    if (!poly || !poly.data) continue;
    const x = poly.data[0];
    const y = poly.data[1];
    const old = finder(x, y);
    const oldIndex = old?.index;
    if (oldIndex != null && polygons[oldIndex]) {
      poly.height = polygons[oldIndex].height;
      // Preserve featureType when present (optional)
      if (polygons[oldIndex].featureType) {
        poly.featureType = polygons[oldIndex].featureType;
      }
    } else {
      // Fallback: sea if out of bounds
      poly.height = 0;
    }
  }

  return { samples: augmented, diagram: newDiagram, polygons: newPolygons, added: newPoints.length };
}
