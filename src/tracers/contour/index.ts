/**
 * Contour Trace — built-in binary boundary tracer.
 *
 * Binarize → marching-squares boundary loops → Douglas–Peucker simplify →
 * corner-aware hybrid fitting (sharp corners stay crisp, gentle bends become
 * Béziers — Potrace-style). Deterministic, dependency-free, MIT-clean. Covers
 * the niche of Potrace/OpenCV outline tracing without their licenses or WASM
 * runtimes (those can be added later as alternative engines).
 */

import type { ParamValues, TraceInput, TraceResult, TracerModule, TracerParam } from '../../core/types';
import {
  binarize,
  hybridLoopsToPath,
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
  { key: 'epsilon', label: 'Simplify', type: 'number', default: 1, min: 0, max: 8, step: 0.1, group: 'Curves', help: 'Douglas–Peucker tolerance. Higher = fewer nodes.' },
  {
    key: 'output',
    label: 'Output',
    type: 'enum',
    default: 'hybrid',
    group: 'Curves',
    options: [
      { value: 'hybrid', label: 'Hybrid (corner-aware)' },
      { value: 'smooth', label: 'Smooth (Bézier)' },
      { value: 'polygon', label: 'Polygon' },
    ],
  },
  {
    key: 'cornerThreshold',
    label: 'Corner angle',
    type: 'number',
    default: 80,
    min: 0,
    max: 180,
    step: 1,
    group: 'Curves',
    help: 'Hybrid mode: turns sharper than this angle stay as crisp corners; gentler bends become Béziers.',
  },
];

export const contour: TracerModule = {
  id: 'contour',
  name: 'Contour Trace',
  category: 'binary',
  blurb: 'Built-in boundary tracer: marching-squares contours with corner-aware hybrid (Potrace-style) fitting.',
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

    const output = String(p.output);
    const d =
      output === 'polygon'
        ? loopsToPath(loops, width, height)
        : output === 'smooth'
          ? smoothLoopsToPath(loops, width, height)
          : hybridLoopsToPath(loops, width, height, Number(p.cornerThreshold));

    const body = `<rect width="${width}" height="${height}" fill="#ffffff"/><path d="${d}" fill="#111418" fill-rule="evenodd"/>`;
    return { svg: svgDocument(width, height, body), meta: { paths: loops.length, colors: 1 } };
  },
};

export default contour;
