/**
 * Trace orchestration. Owns timing, metric computation, and error handling so
 * every engine is measured identically. DOM-free: engines return SVG; fidelity
 * (which needs rasterization) is added by the browser layer. See spec.md §7.
 */

import type {
  ParamValues,
  TraceInput,
  TraceMetrics,
  TraceOutcome,
  TracerModule,
} from './types';
import { byteSize, countColors, countNodes, countPaths, sha256 } from './metrics';

const now = (): number =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

/** Run one engine on one input and produce a fully measured outcome. */
export async function runTrace(
  engine: TracerModule,
  input: TraceInput,
  params: ParamValues,
): Promise<TraceOutcome> {
  try {
    if (engine.init) await engine.init();

    const started = now();
    const result = await engine.trace(input, params);
    const durationMs = now() - started;

    const svg = result.svg;
    const metrics: TraceMetrics = {
      durationMs,
      pathCount: result.meta?.paths ?? countPaths(svg),
      nodeCount: countNodes(svg),
      byteSize: byteSize(svg),
      colorCount: result.meta?.colors ?? countColors(svg),
      hash: await sha256(svg),
    };

    return {
      engineId: engine.id,
      svg,
      metrics,
      params,
      warnings: result.meta?.warnings ?? [],
    };
  } catch (err) {
    return {
      engineId: engine.id,
      svg: '',
      metrics: emptyMetrics(),
      params,
      warnings: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function emptyMetrics(): TraceMetrics {
  return { durationMs: 0, pathCount: 0, nodeCount: 0, byteSize: 0, colorCount: 0 };
}
