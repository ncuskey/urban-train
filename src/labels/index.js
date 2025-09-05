// src/labels/index.js
import { validateStyleTokens, buildStyleLookup } from "./schema.js";
import { STYLE_TOKENS } from "./style-tokens.js";

let _tokens = null;
let _lookup = null;

/** Initialize the labeling style system (Step 1: style only). */
export function initLabelingStyle(tokens = STYLE_TOKENS) {
  const { ok, errors } = validateStyleTokens(tokens);
  if (!ok) {
    // console.error("[labels:style] Validation failed:", errors);
    throw new Error("Label style validation failed:\n" + errors.join("\n"));
  }
  _tokens = tokens;
  _lookup = buildStyleLookup(tokens);
  if (typeof window !== "undefined") {
    window.LabelStyle = { tokens: _tokens, lookup: _lookup, ok: true }; // handy for Playwright or console
  }
  // console.log(`[labels:style] OK — ${tokens.rules.length} rules, ${tokens.tiers.length} tiers.`);
  return { tokens: _tokens, lookup: _lookup };
}

export function getStyleTokens() {
  if (!_tokens) throw new Error("Style not initialized");
  return _tokens;
}

export function getStyleFor(kind) {
  if (!_lookup) throw new Error("Style not initialized");
  return _lookup.get(kind) || null;
}
