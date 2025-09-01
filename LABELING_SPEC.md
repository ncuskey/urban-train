# LABELING_SPEC.md (Fantasy Map, Interactive)

**Version:** v0.1  
**Scope:** Visual + behavioral rules for all labels (no code).  
**Applies to:** web-based fantasy map (e.g., labels/*.js, main.js, interaction.js, collision.js).

---

## 0) Goals

Deliver a classic fantasy-map feel while keeping on-screen legibility pristine.

Keep sizes fixed in screen space; use fade bands + density budgets to manage clutter.

Make hierarchy and semantics obvious at a glance (water vs land, area vs line vs point).

---

## 1) Typographic system

### Families & roles (max 2–3 total):

- **Serif Upright** → land areas, ranges, roads, settlements.
- **Serif Italic** → all water features (oceans, seas, lakes, rivers, straits, bays).
- **Optional display face** → map title only.

### Case & tracking

- **ALL CAPS + tracking** for area features (continents/realms, major seas/oceans) at broad zooms.
- **Title Case** for settlements and linear features.

### Legibility floor

- Never render < 9–10 px on screen. Use thin halos (≈1–2 px) over busy terrain.

### Color & contrast

- Maintain WCAG-ish contrast where possible; allow subtle tint differences: water labels slightly cooler; land slightly warmer.

---

## 2) Feature classes → visual tokens

| Class | Style | Curvature | Placement |
|-------|-------|-----------|-----------|
| **CONTINENT / REALM** | Caps + wide tracking; largest | Straight (≤3–5° total) | Center within polygon; mostly horizontal |
| **OCEAN / SEA** | Italic + tracking; large | Gentle arc along basin | Spanning centroid; suggest extent |
| **LAKE / GULF / BAY** | Italic; medium | Gentle arc along major axis | Near centroid; avoid land overlap |
| **RANGE (mountains)** | Upright caps + tracking | Mild follow of ridge | Along spine, not on peaks |
| **RIVER (on-path)** | Italic; med→small | On path; segmented | Prefer source→mouth readability |
| **STRAIT / CHANNEL** | Italic; small–med | Along the gap | Center of passage (may repeat) |
| **ROAD / ROUTE** | Upright; small–med | On path; repeat by length | Minimal offset to avoid stroke occlusion |
| **CAPITAL / MAJOR CITY** | Upright; largest settlement size | — | 4-quadrant preference around point |
| **TOWN / VILLAGE** | Upright; two smaller sizes | — | Same 4-quadrant; larger spacing |

### Consistencies

- Water always italic.
- Area names use letterspacing to imply extent.
- Long lines (rivers/roads) use multiple labels, not one stretched label.

---

## 3) LOD tiers & fade bands

### Example scale (tune to your zoom domain):

- **T0 (World):** Continents/realms; major oceans.
- **T1 (Region):** Large seas; ranges; capitals; largest lakes; principal rivers.
- **T2 (Province/Local):** Major cities; large towns; gulfs/bays; secondary rivers; primary roads.
- **T3 (Town):** Towns; villages (sparse); straits/channels; secondary roads.
- **T4 (Close):** Villages (dense); minor creeks/footpaths (only if uncrowded).

### Fade bands

Each class enters with a 0.20–0.30 zoom-width opacity ramp and exits with a similar ramp.

Screen-space font sizes are constant; visibility is controlled by the ramps + budgets.

---

## 4) Collision, density & priority

### Viewport budgets (defaults; tune per map):

- **T0:** max 2 area labels, 1 ocean.
- **T1:** max 4–6 area/water, 6 major settlements, 3 linear (rivers/ranges).
- **T2:** max 10 settlements, 6 linear, 2–4 water.
- **T3–T4:** dynamic; enforce min pixel spacing per class (larger spacing for higher tiers).

### Priority ladder (highest → lowest):

```
OCEAN ≥ CONTINENT/REALM ≥ CAPITAL ≥ SEA/RANGE ≥ MAJOR_CITY ≥ LAKE ≥ PRINCIPAL_RIVER ≥ TOWN ≥ STRAIT ≥ ROAD ≥ VILLAGE ≥ MINOR_CREEK/PATH
```

### Suppression rules

- Prefer suppressing lower tiers before higher ones. Capitals & oceans should almost never vanish; drop neighbors instead.
- Use stable anchors to avoid label jitter on pan; fade only when truly out of room.
- Do not shrink text below the legibility floor to resolve overlap.

---

## 5) Geometry & placement rules

### Areas (continents, realms, seas, lakes)

- Center inside extent, mostly horizontal; wider tracking at broad scales.
- Subtle halo when crossing textured boundaries.

### Rivers

- Text-on-path with a curvature limit (e.g., ≤8–10° heading change per 10 px of path length).
- Segment long courses: repeat labels per major segment; prefer downstream readability.

### Straits / channels

- Label centered in the passage; associate clearly with the gap (repeat if long).

### Roads

- On-path, repeat by length; small offset to avoid stroke occlusion; no artificial letterspacing.

### Settlements (point features)

- Quadrant preference: TR → BR → TL → BL relative to the point.
- Capitals distinguished via size bump or small caps; thin halo over dark terrain.

### Archipelagos

- Mid-zooms: label the group (e.g., "Forbidden Isles"). Reveal individuals only at close zoom.

---

## 6) Interaction & UX

- **Hover focus:** brighten the hovered label; gently dim neighbors.
- **Tooltips:** for tiny/optional features (islets, minor paths), prefer tooltips to always-on text.
- **Toggles:** user switches for small classes (e.g., "Show villages", "Minor paths").
- Keep text upright to the screen if map rotation is supported.

---

## 7) Data schema each label should carry

```javascript
{
  feature_id, feature_class, name,
  geometry (point/line/polygon; centroid or path reference),
  tier, priority_weight, min_zoom, max_zoom, fade_width_zoom,
  style_token_ref (e.g., water.italic.medium),
  anchoring (quadrants / on-path),
  // Optional: group_id (archipelagos), segment_id (long lines), is_capital
}
```

---

## 8) QA checklist (acceptance)

- [ ] No upside-down/vertical-hard-to-read labels; 0 collisions at rest.
- [ ] Oceans & capitals always visible at appropriate tiers.
- [ ] Smallest label ≥ 9–10 px; fade transitions feel silky (no pops).
- [ ] Rivers/roads labeled in segments; archipelagos consolidate at mid zooms.
- [ ] Water is consistently italic; area names are ALL CAPS + tracking.

---

## 9) Module responsibilities (non-binding mapping)

- **labels:** read tokens; assign style per feature_class & tier; apply placement (centroid, on-path, quadrants); enforce curvature/segmenting; output candidate boxes.
- **main / LOD manager:** compute visibility; apply fade bands; enforce budgets; resolve suppression with the priority ladder.
- **collision:** class-aware spacing; stable anchors; jitter minimization.
- **interaction:** hover, tooltips, toggles; label uprightness under rotation.

---

## 10) Versioning & governance

- Keep this spec in the repo root as `LABELING_SPEC.md`.
- All PRs that change label behavior must reference which section(s) they modify.
- Token changes should land with screenshots/gifs at 3–4 canonical zooms.
