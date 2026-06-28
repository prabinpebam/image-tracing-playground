# Image Tracing Playground — Technical Specification

> Status: Draft v1 · Owner: TBD · Last updated: 2026-06-28
> Companion documents: [plan.md](./plan.md) · [design-system.md](./design-system.md) · [reference-research.md](./reference-research.md) · [seed-spec.md](./seed-spec.md)

---

## 1. Overview

The Image Tracing Playground is a **client-side web application for evaluating deterministic raster-to-vector tracing algorithms side by side**. A user loads a raster image, routes it through one or more tracing engines, tunes each engine's parameters live, and compares the resulting SVGs both visually and through objective metrics (path count, node count, byte size, trace time, and reconstruction fidelity).

The product is a **playground and evaluation harness**, not a production tracing service. Its purpose is to let an engineer or designer answer a single question quickly and credibly:

> "For *this* class of image, which algorithm and which parameters give the best trade-off between fidelity, compactness, and editability — so I can pick it for another project?"

Everything in the architecture follows from that purpose: algorithms are **pluggable modules behind one interface**, results are **measured, not just shown**, and the same input can be **fanned out to every engine at once** for direct comparison.

### 1.1 Goals

- **G1 — Pluggable engines.** Every tracing algorithm implements one common `TracerModule` contract. Adding an engine is a single self-contained folder, never a change to the app shell.
- **G2 — Live parameter tuning.** Each engine declares its parameters as data; the UI renders controls automatically and re-traces on change (debounced).
- **G3 — Objective comparison.** Every trace produces a metrics record. A compare mode runs N engines on one image and tabulates the metrics.
- **G4 — Deterministic & reproducible.** Same image + same parameters ⇒ byte-identical SVG. No hidden randomness, no network calls during tracing.
- **G5 — Zero backend.** Runs fully in the browser. All engines ship as JS or WebAssembly. The app can be deployed as static files.
- **G6 — Faithful, distinctive UI.** The interface is grounded in the subject (vectors, anchors, Bézier handles, the raster→vector duality) per the [design system](./design-system.md), not a templated dashboard.

### 1.2 Non-goals

- **NG1** — Not a general-purpose AI image generator or a "describe an SVG" tool.
- **NG2** — Not a vector *editor*. Output SVGs are previewed and exported, not node-edited in app.
- **NG3** — Not a hosted batch service or API. Single image, interactive.
- **NG4** — Optimization-based and learned methods (DiffVG, LIVE, Im2Vec, VLM SVG generation) are **out of scope for v1** — they are non-deterministic and/or require Python/GPU runtimes. They are captured as a future research track (§16).

### 1.3 Success criteria

The playground is successful when:

1. A user can load an image and produce a vector in **one click** with sensible defaults.
2. A user can run **at least four deterministic engines** on the same image and see a metrics comparison table.
3. Adjusting any parameter re-traces and updates the preview and metrics without a page reload.
4. Re-running an identical trace yields an **identical SVG** (verified by hashing the output).
5. A new engine can be added by creating one folder under `src/tracers/` and registering it — with **no edits to UI or pipeline code**.

---

## 2. Users & use cases

| Persona | Need | Primary flow |
| --- | --- | --- |
| **Pipeline engineer** | Pick an algorithm + params for a production feature | Load representative image → compare engines → read metrics → export the winning params as JSON |
| **Designer / illustrator** | Convert a specific asset and judge it by eye | Load asset → try Potrace vs VTracer → toggle node/grid overlays → export SVG |
| **Algorithm author** | Validate a new tracer against existing ones | Implement `TracerModule` → register → run compare mode against the suite |

### 2.1 Representative use cases

- **UC1 — Logo cleanup.** Black-and-white logo scan → Potrace with threshold tuning → compact single-path SVG.
- **UC2 — Flat illustration.** Multi-color cartoon → VTracer / ImageTracer color-region tracing → layered SVG; compare path counts.
- **UC3 — Technical line drawing.** Schematic → OpenCV contour pipeline with corner preservation, or centerline tracing for single-stroke output.
- **UC4 — Side-by-side bake-off.** One image, all engines, default params → metrics table → identify the fidelity/compactness frontier.

---

## 3. Background: algorithm taxonomy (deterministic focus)

Condensed from [reference-research.md](./reference-research.md). v1 targets the **deterministic** half of the spectrum because the playground's value proposition is reproducible, explainable, "pick-and-ship" evaluation.

| Category | What it does | Representative engines | Shipped? |
| --- | --- | --- | --- |
| **Binary boundary tracing** | Binarize, trace fg/bg boundary, fit curves | **Contour Trace** (built-in); Potrace optional | ✅ |
| **Color-region tracing** | Quantize colors, trace + stack region contours | **Color Regions** + **ImageTracer** | ✅ |
| **Contour pipelines** | Threshold/edges → boundary loops → simplify | **Contour Trace** (marching squares); OpenCV.js optional | ✅ |
| **Centerline / skeleton** | Recover stroke centerline, fit polylines | **Centerline** (Zhang–Suen thinning) | ✅ (experimental) |
| **Classic alt tracers** | Older deterministic tracers | AutoTrace, Potrace (GPL) | ⏳ optional add-on |
| **Optimization / differentiable** | Optimize vector primitives to match pixels | DiffVG, LIVE | ❌ out of scope (§16) |
| **Learned / neural** | Predict SVG from image | Im2Vec, VLM SVG | ❌ out of scope (§16) |

---

## 4. Scope — engine suite

Each engine is a self-contained module under `src/tracers/<id>/`. v0.2 ships four working, deterministic, dependency-light engines:

| id | Name | Category | Runtime | Method | Status |
| --- | --- | --- | --- | --- | --- |
| `contour` | Contour Trace | binary | built-in TS | marching-squares boundaries → Douglas–Peucker → optional Catmull–Rom Bézier | **Working** |
| `color-regions` | Color Regions | color-region | built-in TS | median-cut quantization → per-color contours → stacked layers | **Working** |
| `imagetracer` | ImageTracer | color-region | `imagetracerjs` (MIT) | color quantization + interval tracing | **Working** |
| `centerline` | Centerline | centerline | built-in TS | Zhang–Suen thinning → skeleton polyline tracing | **Working** (experimental) |

The built-in tracers share [src/core/trace-geometry.ts](../src/core/trace-geometry.ts) (binarize, marching squares, RDP, median-cut, thinning, path builders) and are pure/deterministic with no DOM or network dependency.

### Optional engines (architecture-ready, not bundled by default)

| Name | Why not default |
| --- | --- |
| **Potrace** (`esm-potrace-wasm`) | Best-in-class smooth binary tracing, but **GPL-2.0** — undesirable for a tool whose output is "pick this for another (possibly proprietary) project". Add it if GPL is acceptable. |
| **VTracer** (Rust/WASM) | Excellent color tracer; adds a WASM runtime + build complexity. |
| **OpenCV.js** contours | Powerful, but an ~8 MB WASM payload for what Contour Trace already covers. |

Each can be dropped in as a new `TracerModule` without touching the UI or pipeline.

---

## 5. Architecture

### 5.1 Shape of the system

```
                       ┌──────────────────────────────────────────────┐
                       │                   App Shell                   │
                       │  (layout, source panel, controls, compare)    │
                       └───────────────┬──────────────────────────────┘
                                       │ calls
                                       ▼
   ImageSource ──▶ Preprocess ──▶  Pipeline.run(engine, params)  ──▶ TraceResult ──▶ Metrics
   (File/canvas)   (grayscale,        │                                  │              │
                    threshold,        │ looks up                         │ SVG +        │ path/node
                    blur, quantize)   ▼                                  │ stats        │ count,
                                 TracerRegistry                          │              │ bytes,
                                      │                                  │              │ time,
                                      ▼                                  ▼              ▼ fidelity
                              TracerModule.trace()  ───────────────▶  SVG string ──▶ Compare table
                              (potrace | vtracer | imagetracer | …)
```

### 5.2 Principles

- **One direction of data flow.** UI → pipeline → engine → result → UI. Engines never reach back into the UI.
- **Engines are data + one function.** A module declares its identity, its parameters (as data), and a single async `trace()` function. The UI is generated from the declared parameters.
- **The pipeline owns orchestration.** Preprocessing, timing, metric computation, and error handling live in the pipeline — not duplicated inside each engine. Engines receive clean input and return raw SVG.
- **No cross-engine coupling.** Engines do not know about each other. Compare mode is the pipeline running the same input through several engines.
- **Heavy work is interruptible.** WASM/CPU-bound traces run in a Web Worker so the UI stays responsive and a superseded trace can be cancelled (§13).

### 5.3 Module boundaries

| Layer | Folder | Responsibility | Must NOT |
| --- | --- | --- | --- |
| Core | `src/core/` | Types, registry, pipeline, image utils, metrics | Touch the DOM |
| Engines | `src/tracers/` | One folder per algorithm implementing `TracerModule` | Import the UI or another engine |
| UI | `src/ui/` | Render shell, controls, previews, compare table | Contain algorithm logic |
| Styles | `src/styles/` | Design tokens + component styles | Hardcode values that exist as tokens |
| Entry | `src/main.ts` | Compose core + engines + UI | Contain business logic |

---

## 6. The Tracer module contract

This is the load-bearing interface. It is defined in [src/core/types.ts](../src/core/types.ts).

```ts
export type ParamType = 'number' | 'boolean' | 'enum' | 'color';

export interface TracerParam {
  key: string;                 // unique within the engine
  label: string;               // human label shown in UI
  type: ParamType;
  default: number | boolean | string;
  min?: number;                // number only
  max?: number;                // number only
  step?: number;               // number only
  options?: { value: string; label: string }[]; // enum only
  group?: string;              // optional UI grouping ("Preprocess", "Curves"…)
  help?: string;               // tooltip / description
  advanced?: boolean;          // hide behind "advanced" disclosure
}

export type ParamValues = Record<string, number | boolean | string>;

export interface TraceInput {
  imageData: ImageData;        // RGBA pixels AFTER global preprocessing
  width: number;
  height: number;
}

export interface TraceResult {
  svg: string;                 // complete <svg>…</svg> markup
  meta?: {
    paths?: number;            // engine-reported if known; else derived in pipeline
    colors?: number;
    warnings?: string[];
  };
}

export interface TracerModule {
  id: string;                  // 'potrace'
  name: string;                // 'Potrace'
  category: 'binary' | 'color-region' | 'contour' | 'centerline';
  blurb: string;               // one line shown in the picker
  bestFor: string[];           // ['logos', 'line art', 'signatures']
  params: TracerParam[];       // declared, rendered automatically
  init?(): Promise<void>;      // one-time WASM/asset load (idempotent)
  trace(input: TraceInput, params: ParamValues): Promise<TraceResult>;
}
```

Rules for an engine:

1. `trace()` must be **pure with respect to its inputs** — identical `(input, params)` ⇒ identical `svg`.
2. `init()` is optional, idempotent, and the only place async asset loading is allowed.
3. An engine returns the **SVG string only**; timing, byte size, and node counting are the pipeline's job (so they are measured identically for every engine).
4. An engine never imports from `src/ui/` or another engine.

---

## 7. Image pipeline

Defined in [src/core/pipeline.ts](../src/core/pipeline.ts). Stages:

1. **Decode** — `File`/`Blob`/sample → `HTMLImageElement` → `<canvas>` → `ImageData`.
2. **Preprocess (global)** — applied once, shared by all engines so comparisons are fair:
   - resize / max-dimension clamp (performance guard)
   - grayscale
   - blur (Gaussian radius) — denoise
   - threshold (for binary engines) with adjustable cutoff + invert
   - color quantization (k colors) for color engines
   - despeckle (drop components below N px)
3. **Trace** — `await engine.init?.()` then `engine.trace(input, params)`, wrapped in a timer.
4. **Measure** — compute the metrics record (§8) from the returned SVG.
5. **Emit** — return `{ engineId, svg, metrics, params, preprocess }` to the UI.

Preprocessing is split into **global** (shared, on the pipeline) and **engine-local** (declared in the engine's `params`, e.g. Potrace's `turdSize`). Global preprocessing keeps the bake-off fair; engine params capture each algorithm's own knobs.

---

## 8. Metrics & evaluation

Defined in [src/core/metrics.ts](../src/core/metrics.ts). Every trace yields:

| Metric | Definition | Why it matters |
| --- | --- | --- |
| `durationMs` | Wall-clock time of `trace()` | Batch/throughput feasibility |
| `pathCount` | Number of `<path>`/shape elements | Editability & complexity |
| `nodeCount` | Total anchor points parsed from path data | Curve density / file weight |
| `byteSize` | UTF-8 length of the SVG | Payload size |
| `colorCount` | Distinct fill/stroke colors | Output structure |
| `fidelity` | Similarity of rasterized SVG vs source | Visual accuracy |

### 8.1 Fidelity measurement

To measure fidelity deterministically in-browser:

1. Rasterize the output SVG to a canvas at the source resolution (`Image` from a `blob:`/`data:` SVG URL).
2. Compare against the **preprocessed** source `ImageData`.
3. Report **MSE** and a normalized **SSIM** (structural similarity, grayscale, windowed). Higher SSIM = closer.

Fidelity is reported as a 0–1 score plus raw MSE. It is approximate (depends on SVG rasterization) and labeled as such in the UI.

### 8.2 Determinism check

The pipeline can hash (`SHA-256` via `crypto.subtle`) the output SVG. Re-running with identical inputs must reproduce the hash; a mismatch surfaces a warning. This guards G4.

### 8.3 The frontier

Compare mode plots/tabulates engines on the **fidelity ↔ compactness** trade-off. There is no single winner; the table lets the user pick the point on the frontier that fits their project.

---

## 9. UX & interaction design

Visual language is specified in [design-system.md](./design-system.md). This section covers layout and behavior.

### 9.1 Layout (single view, three zones)

```
┌───────────────────────────────────────────────────────────────────────┐
│  APP BAR   Image Tracing Playground         [Load image] [Sample ▾]    │
├───────────────┬───────────────────────────────────┬───────────────────┤
│  SOURCE       │   OUTPUT                           │  ENGINE & PARAMS  │
│               │                                    │                   │
│  ┌─────────┐  │   ┌────────────────────────────┐   │  ◉ ImageTracer    │
│  │ raster  │  │   │                            │   │  ○ Potrace        │
│  │ preview │  │   │     vector preview         │   │  ○ VTracer        │
│  └─────────┘  │   │  (overlay: nodes / grid /  │   │  ○ OpenCV         │
│               │   │   original ghost)          │   │  ○ Centerline     │
│  Preprocess   │   │                            │   │                   │
│  • grayscale  │   └────────────────────────────┘   │  Parameters       │
│  • threshold  │   [ Single | Compare ]  [Export ▾] │  (auto-rendered   │
│  • blur       │                                    │   from engine)    │
│  • quantize   │   METRICS                          │   ───────         │
│  • despeckle  │   paths · nodes · bytes · ms · SSIM│  [ Trace ]        │
└───────────────┴───────────────────────────────────┴───────────────────┘
```

### 9.2 Modes

- **Single mode** — one engine, full parameter panel, large preview, live metrics.
- **Compare mode** — a grid of engine outputs (default params or last-used) over the same source, plus a metrics table sorted by any column. This is the playground's headline feature.

### 9.3 Interaction rules

- Changing a parameter re-traces (debounced ~200 ms); heavy engines show a non-blocking progress indicator.
- The vector preview supports overlays: **anchor nodes**, **pixel grid** (marching-squares motif), and a **ghost of the original raster** for alignment.
- Pan/zoom on the preview is shared between source and output so they stay registered.
- Export offers: **SVG file**, **copy SVG**, **copy params as JSON**, **PNG of preview**.
- Empty state is an invitation: a drop target plus "generate a sample" that draws a known test pattern on a canvas (so the app is usable with zero assets on disk).

### 9.4 Accessibility / quality floor

- Responsive to a single-column layout on narrow viewports.
- Visible keyboard focus; all controls operable by keyboard.
- `prefers-reduced-motion` respected (node/handle animation disabled).
- No emoji in UI copy; iconography uses inline SVG glyphs. Color is never the only signal (metrics carry text labels).

---

## 10. Tech stack & dependencies

| Concern | Choice | Rationale |
| --- | --- | --- |
| Language | **TypeScript** (strict) | Typed engine contract; safer plugin surface |
| Build/dev | **Vite** | Fast HMR, static output, first-class WASM + Web Worker support |
| UI | **Vanilla TS + lit-html-style templating via small helpers** (no framework) | Keep the surface minimal; the app is panels + canvas, not a SPA |
| Styling | **Plain CSS with custom properties (design tokens)** | Tokens are the single source of truth; no build-time CSS deps |
| Engines | `imagetracerjs`, `esm-potrace-wasm`, vtracer wasm, `opencv.js` | Deterministic browser-capable ports (see §4) |
| Workers | Native Web Workers | Keep WASM traces off the main thread |
| Tests | **Vitest** (unit) + a lightweight EDD harness | Verify contract + determinism, not just rendering |

> No UI framework is intentional: the product is a small number of panels around a canvas. A framework would add weight without buying much. If the UI grows, this decision is revisited in the plan, not assumed away.

---

## 11. Project structure

```
image-tracing-experiment/
├─ documents/
│  ├─ seed-spec.md            # original brief (input)
│  ├─ reference-research.md   # algorithm research (input)
│  ├─ spec.md                 # this document
│  ├─ plan.md                 # phased implementation plan
│  └─ design-system.md        # visual language
├─ public/
│  └─ samples/                # optional sample images (generated at runtime if absent)
├─ src/
│  ├─ main.ts                 # entry: compose core + engines + UI
│  ├─ core/
│  │  ├─ types.ts             # TracerModule contract + shared types
│  │  ├─ registry.ts          # engine registry
│  │  ├─ pipeline.ts          # decode → preprocess → trace → measure
│  │  ├─ image.ts             # decode, resize, grayscale, threshold (DOM)
│  │  ├─ trace-geometry.ts    # binarize, marching squares, RDP, median-cut, thinning, path builders
│  │  └─ metrics.ts           # path/node/byte/color counts, SSIM/MSE, hashing
│  ├─ tracers/
│  │  ├─ index.ts             # registers all engines
│  │  ├─ contour/index.ts     # Contour Trace (built-in, binary)
│  │  ├─ color-regions/index.ts # Color Regions (built-in, color)
│  │  ├─ imagetracer/index.ts # ImageTracer (imagetracerjs, color)
│  │  └─ centerline/index.ts  # Centerline (built-in, experimental)
│  ├─ ui/
│  │  ├─ dom.ts               # tiny DOM/template helpers
│  │  ├─ icons.ts             # inline SVG glyphs + brand/empty-state art
│  │  ├─ controls.ts          # engine picker + auto-rendered params
│  │  ├─ preview.ts           # layered preview (ghost · vector · grid · nodes)
│  │  └─ app.ts               # shell: source/output panels, compare, export
│  ├─ workers/                # (planned, Phase 2) off-thread WASM tracing
│  │  └─ trace.worker.ts      # runs engine.trace() off main thread
│  └─ styles/
│     ├─ tokens.css           # design tokens (color, type, space, motion)
│     └─ app.css              # component styles built on tokens
├─ index.html
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ .gitignore
└─ README.md
```

> Phase 0 consolidates the source/output panels and the compare grid/table into `ui/app.ts`. As the UI grows they may be split into `source-panel.ts` / `output-panel.ts` / `compare.ts`; the `workers/` folder arrives in Phase 2 with the first WASM engine. The structure above reflects the scaffold as built plus clearly-marked planned additions.

---

## 12. Sample data

- The app must be usable **without any committed binary assets**. A "Generate sample" action draws known test patterns on a canvas at runtime: a hard-edged logo glyph, a flat-color illustration, and a thin-stroke line drawing. These exercise the binary, color-region, and centerline engines respectively.
- Users may drag-and-drop or pick their own PNG/JPG/WebP/BMP/SVG. SVGs are rasterized to a canvas before tracing.
- Any committed sample images live in `public/samples/` and must be license-clean.

---

## 13. Performance

- **Off-thread tracing.** WASM and CPU-heavy engines run in `src/workers/trace.worker.ts`. The main thread posts `{ imageData, engineId, params }` and receives `{ svg }` (or an error). `ImageData` is transferred where possible.
- **Cancellation.** A new trace supersedes an in-flight one; the worker result for a stale request is discarded (request id check). This keeps live tuning responsive.
- **Input clamp.** A configurable max dimension (default 1024 px longest side) bounds worst-case time; the original resolution is retained for export-time fidelity scoring.
- **Lazy engine init.** `init()` (WASM fetch/compile) runs on first use of an engine, not at app start.

---

## 14. Error handling & edge cases

- Engine `trace()` rejections are caught by the pipeline and surfaced as an inline, plain-language message in the output panel ("Potrace could not trace this image at the current threshold — try lowering it"). The app never crashes on a bad trace.
- Stub engines (not yet implemented) declare their params and throw a friendly "not yet implemented — see plan Phase N" from `trace()`, so they appear in the UI but clearly signal status.
- Oversized images are clamped with a visible notice.
- Unsupported file types are rejected at decode with guidance.

---

## 15. Security & privacy

- **Local-only processing.** Images never leave the browser. No upload endpoint, no telemetry, no third-party calls during tracing.
- WASM assets are bundled/self-hosted (no runtime CDN dependency for engines), so the app works offline and has no supply-chain surprise at runtime.
- SVG output is treated as data: when rendered for preview it is sanitized / rendered via `<img>`/`srcdoc` sandboxing to avoid executing any script that an engine could theoretically emit.

---

## 16. Future / research track (out of scope for v1)

Captured so the architecture leaves room, but explicitly **not** built in v1:

- **Optimization-based** (DiffVG, LIVE, Optimize-&-Reduce): require differentiable rasterization and iterative GPU/CPU optimization; non-trivial to make deterministic and to run in-browser. Candidate for a server-backed "lab" mode later.
- **Learned / neural** (Im2Vec, VLM-to-SVG): non-deterministic, model hosting and licensing concerns, can hallucinate geometry. Conflicts with G4 (determinism).
- **Library engines (Potrace, VTracer, OpenCV.js, AutoTrace)**: drop-in `TracerModule`s, omitted by default for license (Potrace is GPL-2.0), runtime, or bundle-size reasons (see §4). Opt-in, not research.
- **Centerline** quality: shipped experimental; medial-axis robustness is a known hard problem and a future deepening area.
- **AutoTrace**: no maintained browser/WASM port; revisit if one appears or via a native sidecar.

The `TracerModule` contract is deliberately runtime-agnostic about *how* `trace()` produces SVG, so a future worker could proxy to a server-side engine without changing the UI.

---

## 17. Open questions

1. Do we want a persisted "saved comparisons" feature (localStorage) in v1, or is export-to-JSON enough? *(Default: export only.)*
2. Should fidelity scoring compare against the **original** or the **preprocessed** source? *(Default: preprocessed, since that is what the engine actually saw; expose a toggle.)*
3. Is centerline tracing valuable enough to ship experimental in v1, or defer entirely? *(Default: ship experimental, clearly labeled.)*

---

## 18. Traceability to the brief

| Brief statement (seed-spec.md) | Where addressed |
| --- | --- |
| "various deterministic approaches to tracing" | §3, §4 engine suite |
| "playground to evaluate different algorithms" | §1, §9.2 compare mode, §8 metrics |
| "picked for use in other projects" | §8.3 frontier, export params (JSON), pluggable contract §6 |
| "design the UX and project structure accordingly" | §9 UX, §11 structure |
| "use canvas-design / frontend-design skills" | [design-system.md](./design-system.md) |
| "deep research on approaches" | [reference-research.md](./reference-research.md), summarized §3 |
