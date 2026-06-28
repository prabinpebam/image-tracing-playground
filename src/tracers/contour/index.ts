/**
 * Contour Trace — built-in binary boundary tracer.
 *
 * Binarize → marching-squares boundary loops → Douglas–Peucker simplify →
 * optional Catmull–Rom smoothing. Deterministic, dependency-free, MIT-clean.
 * Covers the niche of Potrace/OpenCV outline tracing without their licenses or
 * WASM runtimes (those can be added later as alternative engines).
 */

import type { ParamValues, TraceInput, TraceResult, TracerModule, TracerParam } from '../../core/types';
import {
  binarize,
  loopArea,
  loopsToPath,
  marchingSquaresLoops,
  simplifyClosed,
  smoothLoopsToPath,
  svgDocument,
} from '../../core/trace-geometry';

const params: TracerParam[] = [
  { key: 'threshold', label: 'Threshold', type: 'number', default: 128, min: 0, max: 255, step: 1, help: 'Black/white cutoff.' },
  { key: 'invert', label: 'Invert', type: 'boolean', default: false },
  { key: 'minArea', label: 'Despeckle', type: 'number', default: 8, min: 0, max: 200, step: 1, group: 'Preprocess', help: 'Drop contours smaller than this area.' },
  { key: 'epsilon', label: 'Simplify', type: 'number', default: 1.2, min: 0, max: 8, step: 0.1, group: 'Curves', help: 'Douglas–Peucker tolerance. Higher = fewer nodes.' },
  {
    key: 'output',
    label: 'Output',
    type: 'enum',
    default: 'smooth',
    group: 'Curves',
    options: [
      { value: 'smooth', label: 'Smooth (Bézier)' },
      { value: 'polygon', label: 'Polygon' },
    ],
  },
];

export const contour: TracerModule = {
  id: 'contour',
  name: 'Contour Trace',
  category: 'binary',
  blurb: 'Built-in boundary tracer: marching-squares contours with optional Bézier smoothing.',
  bestFor: ['logos', 'line art', 'silhouettes', 'high-contrast'],
  params,
  async trace(input: TraceInput, p: ParamValues): Promise<TraceResult> {
    const { imageData, width, height } = input;
    const mask = binarize(imageData, Number(p.threshold), Boolean(p.invert));
    const minArea = Number(p.minArea);
    const epsilon = Number(p.epsilon);

    const loops = marchingSquaresLoops(mask, width, height)
      .filter((l) => loopArea(l) >= minArea)
      .map((l) => simplifyClosed(l, epsilon));

    const d =
      String(p.output) === 'smooth'
        ? smoothLoopsToPath(loops, width, height)
        : loopsToPath(loops, width, height);

    const body = `<rect width="${width}" height="${height}" fill="#ffffff"/><path d="${d}" fill="#111418" fill-rule="evenodd"/>`;
    return { svg: svgDocument(width, height, body), meta: { paths: loops.length, colors: 1 } };
  },
};

export default contour;
