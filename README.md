# Image Tracing Playground

A client-side playground for evaluating **deterministic raster-to-vector tracing algorithms** side by side. Load an image, route it through one or more tracing engines, tune each engine's parameters live, and compare the resulting SVGs both visually and by objective metrics (path count, node count, byte size, trace time, and reconstruction fidelity).

It is an **evaluation harness**, not a production service — the goal is to pick the right algorithm and parameters for another project, with reproducible results and no backend.

> Design direction "Anchor & Handle": the UI is built around the raster→vector duality (warm = source pixels, cool = traced curves) with the Bézier anchor-and-handle as its signature motif. See [documents/design-system.md](documents/design-system.md).

## Documents

| Doc | Purpose |
| --- | --- |
| [documents/spec.md](documents/spec.md) | Detailed technical specification |
| [documents/plan.md](documents/plan.md) | Phased implementation plan |
| [documents/design-system.md](documents/design-system.md) | Visual language and tokens |
| [documents/reference-research.md](documents/reference-research.md) | Algorithm research (input) |
| [documents/seed-spec.md](documents/seed-spec.md) | Original brief (input) |

## Quick start

```bash
npm install
npm run dev        # start the dev server
npm run build      # type-check + production build to dist/
npm run test       # run the EDD/determinism tests
npm run preview    # preview the production build
```

Open the dev URL, then **Load image**, **drag-and-drop**, or **paste** (Ctrl/Cmd+V) an image — or click **Generate sample** (works with no assets on disk). Pick an engine and tune its parameters, then switch to **Compare** to run every engine on the same image at once.

## Engine status

Four deterministic, dependency-light engines ship and work today:

| Engine | Category | Method | Status |
| --- | --- | --- | --- |
| Contour Trace | binary | marching-squares boundaries → Douglas–Peucker → optional Bézier | Working |
| Color Regions | color-region | median-cut quantization → per-color contours, stacked | Working |
| ImageTracer | color-region | `imagetracerjs` quantization + tracing (MIT) | Working |
| Centerline | centerline | Zhang–Suen thinning → skeleton polylines | Working (experimental) |

The three built-in tracers share `src/core/trace-geometry.ts` and have no DOM or network dependency. **Optional add-ons** the architecture supports but does not bundle: **Potrace** (smooth binary, but GPL-2.0), **VTracer** (Rust/WASM color), **OpenCV.js** contour pipelines — omitted by default to keep the bundle MIT-clean, light, and backend-free.

## Architecture

```
UI (src/ui) ──▶ Pipeline (src/core) ──▶ Tracer engine (src/tracers/<id>) ──▶ SVG ──▶ Metrics
```

- **Engines are pluggable modules behind one interface** (`TracerModule` in [src/core/types.ts](src/core/types.ts)). They declare their parameters as data; the UI renders the controls automatically.
- **The pipeline owns orchestration** — timing, metric computation, and error handling — so every engine is measured identically.
- **Deterministic**: identical image + parameters ⇒ identical SVG (verified by SHA-256 hashing).
- **No backend**: everything runs in the browser; the build is static files.

### Add a new engine

1. Create `src/tracers/<id>/index.ts` exporting a `TracerModule`:

   ```ts
   import type { TracerModule } from '../../core/types';
   export const myEngine: TracerModule = {
     id: 'my-engine',
     name: 'My Engine',
     category: 'contour',
     blurb: 'One-line description.',
     bestFor: ['icons'],
     params: [ /* declared params → auto-rendered controls */ ],
     async trace(input, params) {
       return { svg: '<svg>…</svg>' };
     },
   };
   export default myEngine;
   ```

2. Register it in [src/tracers/index.ts](src/tracers/index.ts).

No changes to the UI or pipeline are required.

## Project structure

```
documents/        specs, plan, design system, research
src/
  core/           types, registry, pipeline, image utils, metrics
  tracers/        one folder per engine (imagetracer is the working reference)
  ui/             app shell, controls, previews, compare table
  styles/         design tokens + component styles
index.html
```

See [documents/spec.md §11](documents/spec.md) for the full target structure.

## Privacy

Images are processed entirely in the browser. There is no upload, no telemetry, and no third-party network call during tracing.
