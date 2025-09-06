import { runHydrology } from "./orchestrator.js";
import type { HydroParams, HydroOutputs } from "./types.js";

type LegacyHydroBlob = {
  model?: "legacy" | string;
  seed?: number;
  width?: number;
  height?: number;
  options?: Record<string, unknown>;
};

export function migrateLegacyHydrology(doc: any): any {
  if (!doc?.hydrology) return doc;

  const h = doc.hydrology as LegacyHydroBlob;
  if (h.model !== "legacy") return doc;

  // Map a few common legacy options into new params (best effort)
  const width  = (h.width  as number) ?? doc.canvas?.width  ?? 640;
  const height = (h.height as number) ?? doc.canvas?.height ?? 360;
  const seed   = (h.seed   as number) ?? doc.seed ?? 1337;

  // Heuristics for option names that used to exist; adjust if your legacy keys differ
  const o = (h.options ?? {}) as Record<string, any>;
  const params: HydroParams = {
    width,
    height,
    rngSeed: seed,
    poissonRadius: pickNum(o.cellRadius, 4),
    seaLevel:      clamp01(pickNum(o.seaLevel, 0.2)),
    precip:        pickNum(o.rainfall, 7),
    downcut:       pickNum(o.erosion?.downcutting, 0.1),
    winds: {
      N: !!o.windN, E: !!o.windE, S: !!o.windS, W: !!o.windW,
      randomize: o.randomWinds ?? true
    }
  };

  const outputs: HydroOutputs = runHydrology(params);

  // Write back in the new shape; keep old blob for provenance if you like
  doc.hydrology = {
    model: "azgaar",
    version: 1,
    seedUsed: outputs.meta.seedUsed,
    riversCount: outputs.meta.riversCount,
    // You may not want to embed full geometry; if you do, save what you need:
    riverSegments: outputs.riverSegments,
    coastIslands: outputs.coastIslands,
    coastLakes: outputs.coastLakes,
  };

  doc._legacyHydrologyBackup = h; // optional: keep for one release
  return doc;
}

function pickNum(v: any, def: number): number {
  const n = typeof v === "number" ? v : def;
  return Number.isFinite(n) ? n : def;
}

function clamp01(n: number) { return n < 0 ? 0 : n > 1 ? 1 : n; }
