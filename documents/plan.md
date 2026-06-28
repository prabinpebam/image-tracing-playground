# Image Tracing Playground — Implementation Plan

> Status: Draft v1 · Companion to [spec.md](./spec.md) · Design language in [design-system.md](./design-system.md)

This plan sequences the build into phases. Each phase has **deliverables**, **acceptance criteria**, and an **EDD check** (eval-driven: prove the product claim, not just that code runs). Phases are ordered so the architecture is validated end-to-end as early as possible (Phase 1) before heavier engines are added.

Guiding rule (from architecture lessons): **validate the hot path and the contract first with the simplest real engine, then add engines behind the unchanged interface.** Do not optimize or add engines until the pipeline is proven with one working tracer.

---

## Current status (v0.2)

Implemented and verified (production build + unit tests + browser smoke test):

- **Core**: pluggable `TracerModule` contract, registry, pipeline, metrics (paths, nodes, bytes, time, colors, SSIM fidelity, SHA-256 determinism), shared `trace-geometry.ts`.
- **Engines (4, all deterministic)**: Contour Trace, Color Regions, ImageTracer, Centerline (experimental).
- **Workflow**: upload, drag-and-drop, and clipboard **paste**; runtime sample generator; live parameter tuning; Single mode; **Compare mode** (progressive multi-engine grid + sortable metrics table with Pareto-frontier marking); export SVG / PNG / params JSON.

Deferred: **Potrace / VTracer / OpenCV.js** are now *optional* library engines (spec §4) rather than required phases — the built-in tracers cover their niches license-free. **Web Workers** remain a future responsiveness enhancement; traces currently run on the main thread with progressive rendering and a render yield.

---

## Phase 0 — Scaffold & foundations  ✅ (delivered by this scaffold)

**Deliverables**
- Repo config: `package.json`, `tsconfig.json` (strict), `vite.config.ts`, `.gitignore`, `index.html`, `README.md`.
- Design system: `src/styles/tokens.css`, `src/styles/app.css` implementing [design-system.md](./design-system.md).
- Core architecture: `src/core/types.ts` (the `TracerModule` contract), `registry.ts`, `pipeline.ts`, `image.ts`, `metrics.ts`.
- App shell: `src/main.ts`, `src/ui/*` rendering the three-zone layout, empty state, and a working "Generate sample" action.
- Reference engine: `src/tracers/imagetracer/` wired end-to-end.
- Stub engines: `potrace`, `vtracer`, `opencv-contours`, `centerline` declaring params and signaling "not yet implemented".

**Acceptance**
- `npm install` succeeds; `npm run build` produces a static bundle with no type errors.
- App loads, shows the empty state, "Generate sample" draws a test image, and ImageTracer produces a visible SVG with live metrics.

**EDD check**
- A test loads a fixed sample `ImageData`, runs the pipeline with ImageTracer, and asserts: SVG is non-empty, `pathCount > 0`, and a second identical run produces an **identical SHA-256** (determinism).

---

## Phase 1 — Core pipeline hardening + reference engine

Goal: make the single-engine loop excellent before multiplying engines.

**Deliverables**
- Full global preprocessing in `image.ts`: resize/clamp, grayscale, Gaussian blur, threshold (+invert), color quantization (k-means or median-cut), despeckle.
- Pipeline timing, error capture, and SVG hashing wired into `TraceResult` metrics.
- Output panel overlays: anchor nodes, pixel grid, original ghost; shared pan/zoom with source.
- Debounced live re-trace on parameter and preprocess changes.
- Export: SVG file, copy SVG, copy params JSON, PNG of preview.

**Acceptance**
- Adjusting any preprocess control updates the source preview and re-traces.
- Metrics (paths, nodes, bytes, ms, colors) populate for ImageTracer.
- Export produces a valid downloadable SVG that re-opens identically.

**EDD check**
- Determinism test across 3 sample patterns (logo / flat-color / line) — identical hashes on repeat.
- Metrics test: node count parsed from SVG matches an independent count of path commands within tolerance.

---

## Phase 2 — Potrace (binary boundary tracing)

**Deliverables**
- `src/tracers/potrace/` using `esm-potrace-wasm`, loaded via `init()` in the worker.
- Params: `threshold`, `turdSize` (despeckle), `alphaMax` (corner threshold), `optCurve`, `optTolerance`, `turnPolicy`, `invert`.
- Worker path (`trace.worker.ts`) exercised by a real WASM engine for the first time.

**Acceptance**
- A black-and-white logo sample traces to a compact single/low-path SVG.
- Threshold changes visibly change the trace; defaults give a clean result.
- Tracing runs off the main thread (UI stays responsive on a large image).

**EDD check**
- Compare Potrace vs ImageTracer on the logo sample: Potrace yields **lower path/node count** for high-contrast input (proves the engines behave differently, not a shared code path — per the "test semantic invariants" lesson).
- Determinism hash stable across runs.

---

## Phase 3 — VTracer (color-region tracing)

**Deliverables**
- `src/tracers/vtracer/` via a vtracer WASM build (`@neplex/vectorizer` or equivalent browser wasm).
- Params: `colorMode` (color/bw), `hierarchical` (stacked/cutout), `mode` (spline/polygon/pixel), `filterSpeckle`, `colorPrecision`, `layerDifference`, `cornerThreshold`, `lengthThreshold`, `spliceThreshold`, `pathPrecision`.

**Acceptance**
- A flat-color illustration sample produces a layered color SVG.
- Spline vs polygon mode visibly changes curve smoothness/path count.

**EDD check**
- On the flat-color sample, VTracer's `colorCount > 1` and output differs structurally from ImageTracer (distinct path counts/segmentation) — confirms genuinely different algorithms.
- Frontier check: VTracer and ImageTracer occupy different points on fidelity↔compactness.

---

## Phase 4 — OpenCV contours + Centerline (custom pipelines)

**Deliverables**
- `src/tracers/opencv-contours/` using `opencv.js`: threshold/Canny → `findContours` → `approxPolyDP` → SVG path emit, with hierarchy (holes) handling.
- Params: `mode` (threshold/Canny), `cannyLow`, `cannyHigh`, `epsilon` (approx tolerance), `minArea`, `retrievalMode`, `curveFit` (polyline/smoothed).
- `src/tracers/centerline/` (experimental): skeletonization/thinning → graph → polyline fit → stroked SVG.

**Acceptance**
- OpenCV pipeline traces a schematic with corner preservation; `epsilon` visibly trades nodes for fidelity.
- Centerline produces single-stroke paths on a thin-line sample (stroked, not double-outlined).

**EDD check**
- OpenCV `epsilon` sweep: node count decreases monotonically as epsilon rises while fidelity (SSIM) decreases — proves the parameter does what it claims.
- Centerline vs Potrace on a thin-stroke sample: centerline yields **stroked** paths (fewer, open) vs Potrace's filled outlines — distinct topology.

---

## Phase 5 — Metrics & compare mode

**Deliverables**
- `src/core/metrics.ts` complete: `durationMs`, `pathCount`, `nodeCount`, `byteSize`, `colorCount`, `fidelity` (SSIM + MSE), SHA-256 hash.
- `src/ui/compare.ts`: run all (or selected) engines on one source; grid of previews + sortable metrics table; highlight the fidelity↔compactness frontier.
- Export of the full comparison (params + metrics) as JSON.

**Acceptance**
- Compare mode runs ≥4 engines on one image and tabulates all metrics.
- Table sorts by any column; the frontier (best trade-offs) is visually marked.

**EDD check**
- Negative gate: if two named engines produce **identical** SVG/metrics on a non-degenerate fixture, the test fails (guards against accidental shared-implementation regressions).
- Fidelity sanity: a near-trivial high-contrast image scores higher SSIM than a textured photo for every engine.

---

## Phase 6 — Polish, accessibility, packaging

**Deliverables**
- Responsive single-column layout; keyboard operability; visible focus; `prefers-reduced-motion`.
- Friendly empty/error/loading states (no emoji; plain-language guidance).
- The signature node-and-handle motif and overlays refined per the design system.
- Build/deploy docs in README; static hosting verified.

**Acceptance**
- Quality floor met: usable on mobile width, full keyboard nav, reduced motion honored.
- Lighthouse/manual a11y pass on the main flow; no console errors.

**EDD check**
- Visible-paint check (per UI EDD lesson): overlays and the compare grid are asserted as actually painted/hit-testable (real clicks, computed styles, `elementFromPoint`), not merely present in the DOM.

---

## Cross-cutting workstreams

| Stream | Detail |
| --- | --- |
| **Determinism** | Every engine gets a hash-stability test on a fixed fixture; CI fails on drift. |
| **Web Worker** | All WASM engines run via `trace.worker.ts` with request-id cancellation. |
| **Type safety** | `tsconfig` strict; the registry rejects engines that don't satisfy `TracerModule`. |
| **Performance** | Input clamp (default 1024px); lazy `init()`; transfer `ImageData` to worker. |
| **EDD harness** | Fixtures are non-degenerate (distinct image classes) so engine differences are observable. |

---

## Sequencing rationale

1. **Phase 0/1 first, one real engine.** Proves the contract, pipeline, metrics, and UI on the simplest pure-JS tracer. Avoids building five engines against an unproven interface.
2. **Potrace second.** Introduces the WASM + Web Worker path with a single, well-understood engine.
3. **VTracer third.** Adds color-region complexity once the worker path is proven.
4. **OpenCV/centerline fourth.** Custom pipelines that depend on a mature preprocessing layer (built in Phase 1).
5. **Compare/metrics fifth.** Most valuable once ≥3 genuinely different engines exist to compare.
6. **Polish last.** Cheap to do continuously, but formalized at the end against the quality floor.

---

## Definition of done (v1)

- All five engines selectable; ImageTracer, Potrace, VTracer functional; OpenCV functional; centerline experimental.
- Compare mode tabulates metrics for all engines on one image.
- Determinism guaranteed and tested for every functional engine.
- Export of SVG, PNG, and params/metrics JSON.
- Static build deployable with no backend; no runtime third-party calls.
- UX and structure match [spec.md](./spec.md) §9/§11 and [design-system.md](./design-system.md).
