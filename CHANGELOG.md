# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **Flexible renderer targeting** - Accepts SVG or G containers, auto-detects #world
- **Mask integration** - Optional mask support for ocean/shallow layers
- **Configurable layer IDs** - Custom layer naming via opts.layerIds
- **TypeScript compilation to browser JS** - No bundler required
- **CDN dependency support** - d3-delaunay loaded from CDN
- **Per-segment river rendering** - Azgaar-accurate river widths
- **True coastal shallows** - Cell-based shallow water rendering
- **Vector-effect controls** - Bullet-proof stroke scaling
- New TypeScript hydrology orchestrator (`runHydrology`)
- Complete SVG renderer for hydrology (`renderHydrology`)
- Save-file migration for legacy hydrology data (`migrateLegacyHydrology`)
- Comprehensive integration tests for hydrology system

### Changed
- **Renderer integration** - Now targets #world group instead of creating .viewbox
- **Container flexibility** - renderHydrology accepts SVG or G containers
- **Layer mounting** - Mounts under provided root with smart element detection
- **Main.js integration** - Calls renderer with #world group for better app integration
- **Build process** - Added `npm run emit:js` for TypeScript compilation
- **Import paths** - Updated to use compiled JS from `/public/vendor/hydrology/`
- **River rendering** - Per-segment rendering with individual stroke widths
- **Shallow water** - True cell-based polygons instead of full-rect hatch
- **Stroke scaling** - Explicit `vector-effect: none` on all water paths
- Hydrology system now uses deterministic, seedable pipeline
- River generation integrated with complete hydrology pipeline
- Improved performance with consolidated river rendering
- Better type safety with full TypeScript implementation

### Removed
- Legacy hydrology engine & flags
- Old river generation system (`buildAzRivers`, `generateRivers`)
- Legacy river rendering (`renderRiversAz`)

### Migration
- Old saves auto-upgrade on load via `migrateLegacyHydrology`
- Legacy hydrology data is preserved as backup during migration
- New hydrology system maintains visual parity with Azgaar's approach
