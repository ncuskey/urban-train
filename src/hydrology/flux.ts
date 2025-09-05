import { seaLevel, sourceFluxThreshold, deltaFluxThreshold } from "./constants";
import { Cell, CellId } from "./types";
import { getLandSortedDesc } from "./depressions";

/**
 * A river polyline is built from these points (source, course, delta, estuary),
 * mirroring the JSFiddle's riversData entries.
 */
export type RiverPointType = "source" | "course" | "delta" | "estuary";

export interface RiverPoint {
  river: number;       // river id
  cell: CellId;        // owning land cell (for course/source), or last land cell for outlet
  x: number;
  y: number;
  type: RiverPointType;
  /** For outlets, the ocean neighbor cell id (if available) */
  pour?: CellId;
}

/**
 * Callback to fetch the midpoint of the shared edge between two neighboring cells.
 * This is used to place estuary/delta pour points at the coastline.
 * 
 * IMPORTANT: Both ids are valid neighbor pairs from cells[a].neighbors and cells[b].neighbors.
 */
export type GetEdgeMidpoint = (a: CellId, b: CellId) => { x: number; y: number };

/**
 * Routing output: mutates cells (assigns .river) and returns the river point cloud.
 */
export interface RouteResult {
  riversData: RiverPoint[];
  riversCount: number;
}

/**
 * Route flux downhill over land cells, assign river ids, and create riversData.
 * 
 * Algorithm (near-verbatim from the JSFiddle logic):
 * 1) Iterate land cells in descending height.
 * 2) For each cell:
 *    - Pick the lowest neighbor as downhill target (min height).
 *    - Accumulate flux to the target and propagate precipitation decay (0.9 factor).
 *    - If flux > 0.6 and the cell has no river id, start a new river id (source).
 *    - If the target has no river id, propagate this cell's river id to it.
 *      If the target already has a river, keep the id of the longer river (by segment count).
 *    - If the target is ocean (< seaLevel) and the cell has a river:
 *        If cell.flux > 15 and there are multiple ocean-touching neighbor edges → DELTA
 *        else → ESTUARY
 *      Otherwise (target is land): push a COURSE point at the target cell center.
 */
export function routeFluxAndRivers(params: {
  cells: Cell[];
  getEdgeMidpoint: GetEdgeMidpoint;
}): RouteResult {
  const { cells, getEdgeMidpoint } = params;
  const land = getLandSortedDesc(cells);

  const riversData: RiverPoint[] = [];
  let riverNext = 0;

  // Helper to get a river's current length (number of points)
  const riverLength = (riverId: number): number =>
    riversData.filter(r => r.river === riverId).length;

  // Precompute ocean neighbors per cell (and store pour midpoints)
  // This mirrors how the JSFiddle scans edges to detect ocean adjacency.
  const oceanAdj: Map<CellId, { oceanNeighbor: CellId; mid: {x:number;y:number} }[]> = new Map();
  for (const c of land) {
    const entries: { oceanNeighbor: CellId; mid: {x:number;y:number} }[] = [];
    for (const nbId of c.neighbors) {
      if (nbId == null) continue;
      const nb = cells[nbId];
      if (!nb) continue;
      if (nb.height < seaLevel) {
        const mid = getEdgeMidpoint(c.id, nbId);
        entries.push({ oceanNeighbor: nbId, mid });
      }
    }
    if (entries.length) oceanAdj.set(c.id, entries);
  }

  // Main routing loop: strictly downhill, since Task 4 cleared depressions
  for (const cell of land) {
    const id = cell.id;

    // 1) Find lowest neighbor (min height). If ties, pick the first.
    let minH = Number.POSITIVE_INFINITY;
    let minId: CellId | null = null;

    for (const nbId of cell.neighbors) {
      if (nbId == null) continue;
      const nb = cells[nbId];
      if (!nb) continue;
      if (nb.height < minH) {
        minH = nb.height;
        minId = nbId;
      }
    }

    if (minId == null) {
      // Isolated (shouldn't happen in a well-formed graph), skip
      continue;
    }

    const target = cells[minId];

    // 2) River source spawning: if cell has enough flux and no river yet, start a new river
    if (cell.flux > sourceFluxThreshold && cell.river == null) {
      cell.river = riverNext;
      riversData.push({
        river: cell.river,
        cell: id,
        x: cell.x,
        y: cell.y,
        type: "source",
      });
      riverNext += 1;
    }

    // 3) Accumulate flux downhill & propagate moisture decay
    target.flux += cell.flux;
    if (cell.precipitation * 0.9 > target.precipitation) {
      target.precipitation = cell.precipitation * 0.9;
    }

    // 4) Assign/merge river ids when flowing to a land neighbor
    if (target.height >= seaLevel) {
      if (cell.river != null) {
        if (target.river == null) {
          target.river = cell.river;
        } else {
          // Merge preference: keep the longer river id
          const lenA = riverLength(cell.river);
          const lenB = riverLength(target.river);
          if (lenA >= lenB) {
            target.river = cell.river;
          }
          // else keep target's existing river id
        }
      }

      // If we have a river id, add a course point at the target center
      if (target.river != null) {
        riversData.push({
          river: target.river,
          cell: target.id,
          x: target.x,
          y: target.y,
          type: "course",
        });
      }
      continue; // continue routing to other cells in the loop
    }

    // 5) Target is ocean: handle outlets if current cell has a river
    if (cell.river != null) {
      const pours = oceanAdj.get(id) ?? [];

      if (cell.flux > deltaFluxThreshold && pours.length > 1) {
        // DELTA: create multiple mouths; first uses existing id, others spawn new ids
        for (let pi = 0; pi < pours.length; pi++) {
          const p = pours[pi];
          if (pi === 0) {
            riversData.push({
              river: cell.river,
              cell: id,
              x: p.mid.x,
              y: p.mid.y,
              type: "delta",
              pour: p.oceanNeighbor,
            });
          } else {
            // New tiny river branch for each extra mouth
            const newId = riverNext++;
            riversData.push({
              river: newId,
              cell: id,
              x: cell.x,
              y: cell.y,
              type: "course",
            });
            riversData.push({
              river: newId,
              cell: id,
              x: p.mid.x,
              y: p.mid.y,
              type: "delta",
              pour: p.oceanNeighbor,
            });
          }
        }
      } else {
        // ESTUARY: single mouth slightly nudged toward the ocean midpoint
        const p = pours[0] ?? { oceanNeighbor: minId, mid: getEdgeMidpoint(id, minId) };
        const x = p.mid.x + (p.mid.x - cell.x) / 10;
        const y = p.mid.y + (p.mid.y - cell.y) / 10;

        riversData.push({
          river: cell.river,
          cell: id,
          x,
          y,
          type: "estuary",
          pour: p.oceanNeighbor,
        });
      }
    }
    // If no river id on cell, we do nothing at sea contact (small dry gullies)
  }

  return { riversData, riversCount: riverNext };
}
