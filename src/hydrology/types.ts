/**
 * Shared hydrology types. These mirror the JSFiddle field semantics,
 * but with clearer names and strict typing for our engine.
 */

export type CellId = number;

export interface WindToggles {
  N: boolean;
  E: boolean;
  S: boolean;
  W: boolean;
  randomize: boolean;
}

export interface HydroParams {
  width: number;
  height: number;

  // sampling / graph
  poissonRadius: number; // px distance for Poisson sampling

  // thresholds & knobs
  seaLevel: number;      // typically 0.2
  precip: number;        // 0..10
  downcut: number;       // coastline erosion
  winds: WindToggles;

  // determinism
  rngSeed?: number;
}

export type FeatureType = "Ocean" | "Lake" | "Island";

export interface Cell {
  id: CellId;
  x: number;
  y: number;
  polygon: [number, number][];     // closed ring
  neighbors: CellId[];

  // Scalar fields
  height: number;                   // 0..1
  precipitation: number;            // seed + smoothed
  flux: number;                     // accumulated runoff (starts ~precip)
  river?: number;                   // river id (if any)
  type?: "shallow";                 // ocean shallows for hatch (from coastline step)

  // Feature labeling (filled by markFeatures())
  featureType?: FeatureType;
  featureName?: string;
  featureNumber?: number;
}

export interface PathPoint {
  x: number;
  y: number;
}

export type Path = PathPoint[];

/**
 * A cubic-bezier segment encoded as an SVG "C" segment starting at (sx,sy).
 * We store both geometry and the computed stroke widths for river rendering.
 */
export interface BezierSegment {
  sx: number; sy: number;
  cx1: number; cy1: number;
  cx2: number; cy2: number;
  ex: number; ey: number;
  width: number;        // main river stroke width
  shadowWidth: number;  // shadow (underlay) width
  riverId: number;
}

/** Outputs from the hydrology pipeline (compute-only; render elsewhere) */
export interface HydroOutputs {
  cells: Cell[];
  coastIslands: Path[];     // island coast rings
  coastLakes: Path[];       // lake coast rings
  riverSegments: BezierSegment[];
  meta: {
    riversCount: number;
    seedUsed: number;
  };
}
