// src/labels/style-tokens.js
// Initial, conservative tokens. Edit freely as we evolve.
// Water: italicized; Areas: caps; Settlements: mixed case.

export const STYLE_TOKENS = {
  tiers: ["t1", "t2", "t3", "t4"],

  categories: {
    landArea: {
      fontFamily: "Georgia, 'Times New Roman', serif",
      weight: 600,
      italic: false,
      caps: "upper",          // UPPERCASE for regions/areas
      fill: "#222",
      stroke: "#fff",
      letterSpacing: 0.04,    // loose tracking for caps
      size: { t1: 24, t2: 18, t3: 14, t4: 12 }
    },
    waterArea: {
      fontFamily: "Georgia, 'Times New Roman', serif",
      weight: 500,
      italic: true,           // water italic
      caps: "title",          // Title Case for water
      fill: "#22344a",
      stroke: "#f7fbff",
      letterSpacing: 0.02,
      size: { t1: 24, t2: 18, t3: 14, t4: 12 }
    },
    settlement: {
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      weight: 600,
      italic: false,
      caps: "normal",
      fill: "#111",
      stroke: "#fff",
      letterSpacing: 0,
      size: { t1: 18, t2: 15, t3: 13, t4: 11 }
    }
  },

  // Minimal seed rules; we'll expand as we add kinds.
  rules: [
    // Water hierarchy
    { kind: "ocean", category: "waterArea", tier: "t1" },
    { kind: "sea",   category: "waterArea", tier: "t2" },
    { kind: "lake",  category: "waterArea", tier: "t3" },

    // Land/areas hierarchy
    { kind: "continent", category: "landArea", tier: "t1" },
    { kind: "country",   category: "landArea", tier: "t2" },
    { kind: "region",    category: "landArea", tier: "t3" },
    { kind: "island",    category: "landArea", tier: "t4" },

    // Settlements
    { kind: "city", category: "settlement", tier: "t2" },
    { kind: "town", category: "settlement", tier: "t3" },
    { kind: "village", category: "settlement", tier: "t4" }
  ]
};
