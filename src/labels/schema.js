// src/labels/schema.js
// Ultra-light runtime validators (no libraries)

/**
 * @typedef {Object} StyleTokens
 * @property {string[]} tiers             // e.g., ["t1","t2","t3","t4"]
 * @property {Object}   categories        // map of category -> base style
 * @property {Object[]} rules             // per-kind rules (kind, category, tier, overrides...)
 */

export function validateStyleTokens(tokens) {
  const errors = [];

  // presence
  if (!tokens || typeof tokens !== 'object') errors.push('tokens must be an object');
  if (!Array.isArray(tokens?.tiers) || tokens.tiers.length === 0) errors.push('tiers[] required');
  if (!tokens?.categories || typeof tokens.categories !== 'object') errors.push('categories{} required');
  if (!Array.isArray(tokens?.rules) || tokens.rules.length === 0) errors.push('rules[] required');

  // tiers shape
  const tierRe = /^t[1-9]\d*$/;
  for (const t of tokens.tiers || []) {
    if (!tierRe.test(t)) errors.push(`invalid tier name: "${t}"`);
  }

  // categories shape (light checks)
  for (const [cat, def] of Object.entries(tokens.categories || {})) {
    if (!def || typeof def !== 'object') errors.push(`category "${cat}" must be an object`);
    // allowed fields (lenient): fontFamily, weight, italic, caps, fill, stroke, letterSpacing, size
  }

  // rules shape
  for (const [i, r] of (tokens.rules || []).entries()) {
    if (!r.kind) errors.push(`rules[${i}].kind missing`);
    if (!r.category) errors.push(`rules[${i}].category missing`);
    if (!r.tier) errors.push(`rules[${i}].tier missing`);
    if (r.category && !tokens.categories[r.category]) errors.push(`rules[${i}] references unknown category "${r.category}"`);
    if (r.tier && !tokens.tiers.includes(r.tier)) errors.push(`rules[${i}] references unknown tier "${r.tier}"`);
  }

  return { ok: errors.length === 0, errors };
}

/** Build a kind->style map by merging category base + rule overrides. */
export function buildStyleLookup(tokens) {
  const out = new Map();
  for (const rule of tokens.rules) {
    const base = tokens.categories[rule.category] || {};
    // shallow merge (overrides win)
    out.set(rule.kind, { ...base, ...rule, category: rule.category, tier: rule.tier });
  }
  return out;
}
