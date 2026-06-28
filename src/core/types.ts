/**
 * The Tracer module contract — the load-bearing interface of the playground.
 *
 * Every tracing algorithm is a self-contained module that satisfies
 * `TracerModule`. The UI is generated from the declared `params`; the pipeline
 * owns timing and metrics. See documents/spec.md §6.
 */

export type ParamType = 'number' | 'boolean' | 'enum' | 'color';

export type ParamValue = number | boolean | string;

export interface ParamOption {
  value: string;
  label: string;
}

export interface TracerParam {
  /** Unique within the engine. */
  key: string;
  /** Human label shown in the UI. */
  label: string;
  type: ParamType;
  default: ParamValue;
  /** number only */
  min?: number;
  /** number only */
  max?: number;
  /** number only */
  step?: number;
  /** enum only */
  options?: ParamOption[];
  /** optional UI grouping, e.g. "Curves", "Preprocess". */
  group?: string;
  /** tooltip / description. */
  help?: string;
  /** hide behind an "advanced" disclosure. */
  advanced?: boolean;
}

export type ParamValues = Record<string, ParamValue>;

export type TracerCategory = 'binary' | 'color-region' | 'contour' | 'centerline';

/** Input handed to an engine — RGBA pixels after global preprocessing. */
export interface TraceInput {
  imageData: ImageData;
  width: number;
  height: number;
}

/** What an engine returns. Timing/size/node counting is the pipeline's job. */
export interface TraceResult {
  /** Complete `<svg>…</svg>` markup. */
  svg: string;
  meta?: {
    paths?: number;
    colors?: number;
    warnings?: string[];
  };
}

export interface TracerModule {
  /** Stable id, e.g. 'potrace'. */
  id: string;
  /** Display name, e.g. 'Potrace'. */
  name: string;
  category: TracerCategory;
  /** One line shown in the picker. */
  blurb: string;
  /** Image classes this engine is good at. */
  bestFor: string[];
  /** Declared parameters — rendered automatically by the UI. */
  params: TracerParam[];
  /** True while the engine is a stub (declares params, throws on trace). */
  experimental?: boolean;
  /** One-time, idempotent async asset load (WASM, etc.). */
  init?(): Promise<void>;
  /** Pure w.r.t. inputs: identical (input, params) ⇒ identical svg. */
  trace(input: TraceInput, params: ParamValues): Promise<TraceResult>;
}

/** Structural metrics computed by the pipeline for every trace. */
export interface TraceMetrics {
  durationMs: number;
  pathCount: number;
  nodeCount: number;
  byteSize: number;
  colorCount: number;
  /** 0–1 structural similarity vs source; undefined until measured (browser only). */
  fidelity?: number;
  /** raw mean-squared error vs source, when fidelity is measured. */
  mse?: number;
  /** SHA-256 of the SVG, for determinism checks. */
  hash?: string;
}

/** Full outcome of a pipeline trace. */
export interface TraceOutcome {
  engineId: string;
  svg: string;
  metrics: TraceMetrics;
  params: ParamValues;
  warnings: string[];
  error?: string;
}

/** Default values derived from an engine's declared params. */
export function defaultParams(engine: TracerModule): ParamValues {
  const values: ParamValues = {};
  for (const p of engine.params) values[p.key] = p.default;
  return values;
}
