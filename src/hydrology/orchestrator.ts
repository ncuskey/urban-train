import { SeededRandom } from "./rng.js";
import { BezierSegment, HydroOutputs, HydroParams, Path } from "./types.js";
import {
  seaLevel, defaultPoissonRadius, defaultPrecip, defaultDowncut,
  sourceFluxThreshold
} from "./constants.js";
import { poissonDisc, buildDelaunay, buildCells, makeFindCellAt, makeGetEdgeMidpoint, makeGetSharedEdge } from "./graph.js";
import { addBlob } from "./heightSeeds.js";
import { downcutCoastline, downcutRivers } from "./erosion.js";
import { calculatePrecipitation } from "./precipitation.js";
import { resolveDepressions } from "./depressions.js";
import { markFeatures } from "./features.js";
import { buildCoastlines } from "./coast.js";
import { routeFluxAndRivers } from "./flux.js";
import { buildRiverSegments } from "./rivers.js";

/**
 * End-to-end hydrology run, mirroring Azgaar's pipeline.
 * Returns compute-only geometry + per-cell fields. Rendering is separate.
 */
export function runHydrology(params: HydroParams): HydroOutputs {
  const width  = params.width;
  const height = params.height;
  const poissonRadius = params.poissonRadius ?? defaultPoissonRadius;
  const precipValue   = params.precip       ?? defaultPrecip;
  const downcut       = params.downcut      ?? defaultDowncut;
  const SL            = params.seaLevel     ?? seaLevel;

  // 0) RNG
  const rng = new SeededRandom(params.rngSeed ?? 1234);

  // 1) Points → Delaunay/Voronoi → Cells
  // Ensure reasonable poisson radius to prevent grid overflow
  const safePoissonRadius = Math.max(poissonRadius, Math.min(width, height) / 100);
  const points = poissonDisc(width, height, safePoissonRadius, () => rng.float());
  const { delaunay, voronoi } = buildDelaunay(points);
  const cells = buildCells(points, voronoi);

  // local helpers
  const findCellAt = makeFindCellAt(voronoi);
  const getEdgeMidpoint = makeGetEdgeMidpoint(voronoi);
  const getSharedEdge   = makeGetSharedEdge(voronoi);

  // 2) Height seeding (randomMap behavior):
  //    - One big "island" blob around map center-ish
  //    - Then several "hill" blobs in land-friendly places
  // First island seed: center-ish random
  const cx = width  * (0.5 + rng.floatIn(-0.1, 0.1));
  const cy = height * (0.5 + rng.floatIn(-0.1, 0.1));
  const startIsland = findCellAt(cx, cy)!;

  addBlob(cells, startIsland, {
    height: 0.9,
    radius: 0.99,
    sharpness: 0.2,
    type: "island",
    rng
  });

  // Secondary hills: try ~10 seeds (similar to count=11 fiddle)
  const hillCount = 10;
  for (let h = 0; h < hillCount; h++) {
    let tries = 0, id: number | null = null;
    do {
      const x = rng.floatIn(width * 0.25, width * 0.75);
      const y = rng.floatIn(height * 0.2, height * 0.75);
      id = findCellAt(x, y);
      tries++;
    } while (id != null && cells[id].height > SL + 0.05 && tries < 50);

    if (id != null) {
      const heightSeed = +(rng.floatIn(0.1, 0.5).toFixed(2));
      addBlob(cells, id, {
        height: heightSeed,
        radius: 0.99,
        sharpness: 0.2,
        type: "hill",
        rng
      });
    }
  }

  // 3) Erosion, precip, depressions, river downcut (Azgaar order)
  downcutCoastline(cells, downcut);
  calculatePrecipitation({
    cells, width, height,
    precipValue,
    winds: params.winds,
    rng,
    findCellAt
  });
  resolveDepressions(cells);
  downcutRivers(cells, downcut);

  // 4) Features (Ocean/Lake/Island) and coastlines
  markFeatures(cells, {
    width, height,
    nameProvider: () => undefined
  });
  const { coastIslands, coastLakes } = buildCoastlines({
    cells,
    getSharedEdge
  });

  // 5) Rivers: routing + geometry
  const { riversData, riversCount } = routeFluxAndRivers({
    cells,
    getEdgeMidpoint
  });

  // Filter out trivial 1-point rivers
  const nonTrivial = groupCount(riversData).filter(([id, n]) => n > 1).map(([id]) => id);
  const filtered = riversData.filter(r => nonTrivial.includes(r.river));

  const riverSegments: BezierSegment[] = buildRiverSegments({
    cells,
    riversData: filtered,
    rng,
    findCellAt
  });

  // 6) Done
  return {
    cells,
    coastIslands: coastIslands as Path[],
    coastLakes: coastLakes as Path[],
    riverSegments,
    meta: {
      riversCount,
      seedUsed: (params.rngSeed ?? 1234)
    }
  };
}

function groupCount<T extends { river: number }>(arr: T[]): [number, number][] {
  const m = new Map<number, number>();
  for (const a of arr) m.set(a.river, (m.get(a.river) ?? 0) + 1);
  return Array.from(m.entries());
}
