// src/labels/water-split.js
// Data-only water split into ocean / sea / lake.
// Uses quadtree over water polygon centroids to build connected components quickly.

function centroid(poly) {
  // d3 helper if available
  if (typeof d3 !== "undefined" && d3.polygonCentroid) return d3.polygonCentroid(poly);
  let sx = 0, sy = 0, n = poly?.length || 0;
  for (let i = 0; i < n; i++) { sx += poly[i][0]; sy += poly[i][1]; }
  return n ? [sx / n, sy / n] : [0, 0];
}

function areaAbs(poly) {
  if (typeof d3 !== "undefined" && d3.polygonArea) return Math.abs(d3.polygonArea(poly));
  // fallback shoelace
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  }
  return Math.abs(a / 2);
}

function touchesBorder(poly, W, H, eps = 0.5) {
  if (!Array.isArray(poly)) return false;
  for (const [x, y] of poly) {
    if (x <= eps || y <= eps || x >= (W - eps) || y >= (H - eps)) return true;
  }
  return false;
}

function isWaterPoly(poly, sea = 0.10) {
  if (!poly) return false;
  if (poly.isWater != null) return !!poly.isWater;
  if (poly.water   != null) return !!poly.water;
  const h = (poly.height ?? poly.h);
  if (typeof h === "number") return h <= sea;
  return false;
}

function makeQuadtree(points) {
  // points: [{i, x, y}]
  return d3.quadtree()
    .x(p => p.x)
    .y(p => p.y)
    .addAll(points);
}

function neighborsWithin(qt, x, y, r) {
  const out = [];
  qt.visit((node, x0, y0, x1, y1) => {
    if (x0 > x + r || x1 < x - r || y0 > y + r || y1 < y - r) return true; // skip
    if (!node.length) {
      do {
        const d = node.data;
        const dx = d.x - x, dy = d.y - y;
        if ((dx * dx + dy * dy) <= r * r) out.push(d);
      } while (node = node.next);
    }
    return false;
  });
  return out;
}

/**
 * Compute water connected components and classify:
 *  - "ocean": any component connected to the map border
 *  - inland water: "sea" vs "lake" by total component area threshold
 *
 * @param {Object} args
 * @param {Array}  args.polygons     - all polygons
 * @param {number} args.width        - map width in px
 * @param {number} args.height       - map height in px
 * @param {number} [args.seaLevel]   - water height threshold (default 0.10)
 * @param {number} [args.seaFrac]    - min component area as a fraction of map area to be a "sea" (default 0.005 = 0.5%)
 * @param {number} [args.radiusK]    - neighbor radius multiplier over nominal spacing (default 1.6)
 * @returns {{components:Array, classByPoly:Map<number,string>, metrics:Object}}
 */
export function computeWaterComponents({
  polygons, width, height,
  seaLevel = 0.10,
  seaFrac  = 0.005,
  radiusK  = 1.6
}) {
  const n = polygons?.length || 0;
  if (!n) return { components: [], classByPoly: new Map(), metrics: { totalWaterPolys: 0, oceans: 0, inland: 0 } };

  // Identify water polys + collect centroids/areas
  const W = width, H = height;
  const mapArea = W * H;
  const water = [];
  const waterSet = new Set();
  const borderSeeds = [];
  const areas = new Map();

  for (let i = 0; i < n; i++) {
    const poly = polygons[i];
    if (!Array.isArray(poly)) continue;
    if (!isWaterPoly(poly, seaLevel)) continue;

    const [x, y] = centroid(poly);
    const a = areaAbs(poly);
    const touches = touchesBorder(poly, W, H);

    water.push({ i, x, y });
    waterSet.add(i);
    areas.set(i, a);
    if (touches) borderSeeds.push(i);
  }

  const totalWaterPolys = water.length;
  if (!totalWaterPolys) {
    return { components: [], classByPoly: new Map(), metrics: { totalWaterPolys: 0, oceans: 0, inland: 0 } };
  }

  // Nominal spacing ~ sqrt(mapArea / nCells)
  const spacing = Math.sqrt(mapArea / Math.max(1, n));
  const R = spacing * radiusK;

  // Build quadtree for neighbor lookup
  const qt = makeQuadtree(water);
  const visited = new Set();
  const classByPoly = new Map();
  const components = [];

  // --- (1) Flood ocean from border seeds ---
  const oceanSeedSet = new Set(borderSeeds);
  let oceans = 0;

  for (const seedIdx of borderSeeds) {
    if (visited.has(seedIdx)) continue;

    // BFS over water
    const queue = [seedIdx];
    visited.add(seedIdx);

    const indices = [];
    let sumArea = 0;

    while (queue.length) {
      const i = queue.pop();
      indices.push(i);
      sumArea += areas.get(i) || 0;

      // expand to neighbors-in-radius
      const p = water.find(w => w.i === i); // small lookup; if perf is a concern, index by i -> point
      if (!p) continue;
      const neigh = neighborsWithin(qt, p.x, p.y, R);
      for (const nn of neigh) {
        if (!waterSet.has(nn.i) || visited.has(nn.i)) continue;
        visited.add(nn.i);
        queue.push(nn.i);
      }
    }

    // Mark all as ocean
    for (const i of indices) classByPoly.set(i, "ocean");

    components.push({
      kind: "ocean",
      indices,
      area: sumArea,
      areaFrac: sumArea / mapArea,
      touchesBorder: true
    });
    oceans++;
  }

  // --- (2) Cluster remaining inland water into components ---
  let inland = 0;
  for (const p of water) {
    const start = p.i;
    if (visited.has(start)) continue;

    const queue = [start];
    visited.add(start);

    const indices = [];
    let sumArea = 0;
    let touches = false;

    while (queue.length) {
      const i = queue.pop();
      indices.push(i);
      sumArea += areas.get(i) || 0;

      // If any poly in this component happens to touch border (rare here), mark
      const poly = polygons[i];
      if (touchesBorder(poly, W, H)) touches = true;

      const pp = water.find(w => w.i === i);
      if (!pp) continue;
      const neigh = neighborsWithin(qt, pp.x, pp.y, R);
      for (const nn of neigh) {
        if (!waterSet.has(nn.i) || visited.has(nn.i)) continue;
        visited.add(nn.i);
        queue.push(nn.i);
      }
    }

    // Classify inland component
    const areaFrac = sumArea / mapArea;
    const kind = touches ? "ocean" : (areaFrac >= seaFrac ? "sea" : "lake");

    for (const i of indices) classByPoly.set(i, kind);

    components.push({
      kind,
      indices,
      area: sumArea,
      areaFrac,
      touchesBorder: touches
    });
    inland++;
  }

  return {
    components,
    classByPoly,
    metrics: {
      totalWaterPolys,
      oceans,
      inlandComponents: inland,
      seaFrac,
      radius: R
    }
  };
}

/**
 * Update anchor kinds using the water classification map.
 * Anchors with a.polyIndex in classByPoly get kind: "ocean"/"sea"/"lake".
 */
// --- Topology-based water components: polygons that share a vertex are neighbors ---

// Build adjacency by SHARED EDGES (undirected), with light quantization
function buildWaterAdjacencyByEdges(polygons, waterSet, quant = 1) {
  const qf = 10 ** quant;
  const q = v => Math.round(v * qf) / qf;
  const edgeKey = (a, b) => {
    // order endpoints so the edge is undirected-stable
    const k1 = `${q(a[0])},${q(a[1])}`;
    const k2 = `${q(b[0])},${q(b[1])}`;
    return (k1 < k2) ? `${k1}|${k2}` : `${k2}|${k1}`;
  };

  const edgeMap = new Map(); // edgeKey -> [polyIdx, ...]
  for (const i of waterSet) {
    const poly = polygons[i];
    if (!Array.isArray(poly) || poly.length < 2) continue;
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const key = edgeKey(poly[b], poly[a]);
      if (!edgeMap.has(key)) edgeMap.set(key, []);
      edgeMap.get(key).push(i);
    }
  }

  const adj = new Map(); // i -> Set(neighborIdx)
  for (const i of waterSet) adj.set(i, new Set());
  for (const [, arr] of edgeMap) {
    if (arr.length <= 1) continue;
    for (let x = 0; x < arr.length; x++) {
      for (let y = x + 1; y < arr.length; y++) {
        adj.get(arr[x]).add(arr[y]);
        adj.get(arr[y]).add(arr[x]);
      }
    }
  }
  return adj;
}

/**
 * Topology-based water components:
 * - "ocean": any component with at least one polygon touching border
 * - inland: "sea" if area >= seaAreaPx (or areaFrac >= seaFrac), else "lake"
 */
export function computeWaterComponentsTopo({
  polygons, width, height,
  seaLevel = 0.10,
  seaAreaPx = null,   // absolute threshold in px^2 (recommended)
  seaFrac   = 0.004,  // fallback: 0.4% of map area if seaAreaPx is null
  quant     = 1       // vertex rounding decimals for adjacency
}) {
  const n = polygons?.length || 0;
  const W = width, H = height;
  const mapArea = W * H;

  // Collect water polys, areas, border flags
  const waterSet = new Set();
  const areas = new Map();
  const border = new Set();

  for (let i = 0; i < n; i++) {
    const poly = polygons[i];
    if (!Array.isArray(poly)) continue;
    if (!isWaterPoly(poly, seaLevel)) continue;
    waterSet.add(i);
    areas.set(i, areaAbs(poly));
    if (touchesBorder(poly, W, H)) border.add(i);
  }

  const totalWaterPolys = waterSet.size;
  if (!totalWaterPolys) {
    return { components: [], classByPoly: new Map(), metrics: { totalWaterPolys: 0, oceans: 0, inlandComponents: 0 } };
  }

  // Build topology adjacency and BFS components
  const adj = buildWaterAdjacencyByEdges(polygons, waterSet, quant);
  const visited = new Set();
  const classByPoly = new Map();
  const components = [];

  for (const start of waterSet) {
    if (visited.has(start)) continue;

    const queue = [start];
    visited.add(start);

    const indices = [];
    let sumArea = 0;
    let touches = false;

    while (queue.length) {
      const i = queue.pop();
      indices.push(i);
      sumArea += areas.get(i) || 0;
      if (border.has(i)) touches = true;

      for (const nb of (adj.get(i) || [])) {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push(nb);
        }
      }
    }

    // classify this component
    const meetsSea = seaAreaPx != null ? (sumArea >= seaAreaPx) : ((sumArea / mapArea) >= seaFrac);
    const kind = touches ? "ocean" : (meetsSea ? "sea" : "lake");

    indices.forEach(i => classByPoly.set(i, kind));
    components.push({ kind, indices, area: sumArea, areaFrac: sumArea / mapArea, touchesBorder: touches });
  }

  return {
    components,
    classByPoly,
    metrics: {
      totalWaterPolys,
      oceans: components.filter(c => c.kind === "ocean").length,
      inlandComponents: components.filter(c => c.kind !== "ocean").length,
      seaAreaPx, seaFrac
    }
  };
}

export function applyWaterKindsToAnchors(anchors, classByPoly) {
  if (!Array.isArray(anchors)) return [];
  if (!(classByPoly instanceof Map)) return anchors;
  return anchors.map(a => {
    if (a.isWater && a.polyIndex != null && classByPoly.has(a.polyIndex)) {
      return { ...a, kind: classByPoly.get(a.polyIndex) };
    }
    return a;
  });
}
