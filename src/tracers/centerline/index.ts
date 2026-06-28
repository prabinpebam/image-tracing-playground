/**
 * Centerline — built-in skeleton/stroke tracer.
 *
 * Binarize → Zhang–Suen thinning → trace the 1px skeleton into open polylines →
 * Douglas–Peucker simplify → stroked SVG. Produces single-stroke (open) paths,
 * unlike outline tracers that double every stroke into a filled contour.
 * Deterministic and dependency-free.
 */

import type { ParamValues, TraceInput, TraceResult, TracerModule, TracerParam } from '../../core/types';
import {
  binarize,
  polylineLength,
  polylinesToPath,
  simplifyOpen,
  svgDocument,
  traceSkeleton,
  zhangSuenThin,
} from '../../core/trace-geometry';

const params: TracerParam[] = [
  { key: 'threshold', label: 'Threshold', type: 'number', default: 128, min: 0, max: 255, step: 1, help: 'Black/white cutoff.' },
  { key: 'invert', label: 'Invert', type: 'boolean', default: false },
  { key: 'pruneLength', label: 'Prune spurs', type: 'number', default: 6, min: 0, max: 50, step: 1, group: 'Preprocess', help: 'Drop strokes shorter than this length.' },
  { key: 'simplify', label: 'Simplify', type: 'number', default: 1.2, min: 0, max: 8, step: 0.1, group: 'Curves', help: 'Douglas–Peucker tolerance.' },
  { key: 'strokeWidth', label: 'Stroke width', type: 'number', default: 1.5, min: 0.5, max: 8, step: 0.5, group: 'Curves' },
];

export const centerline: TracerModule = {
  id: 'centerline',
  name: 'Centerline',
  category: 'centerline',
  blurb: 'Built-in skeleton tracer: thinning + polyline tracing for single-stroke output.',
  bestFor: ['handwriting', 'maps', 'thin line drawings', 'pen-plotter paths'],
  params,
  experimental: true,
  async trace(input: TraceInput, p: ParamValues): Promise<TraceResult> {
    const { imageData, width, height } = input;
    const mask = binarize(imageData, Number(p.threshold), Boolean(p.invert));
    const skeleton = zhangSuenThin(mask, width, height);
    const pruneLength = Number(p.pruneLength);
    const simplify = Number(p.simplify);

    const lines = traceSkeleton(skeleton, width, height)
      .filter((l) => polylineLength(l) >= pruneLength)
      .map((l) => simplifyOpen(l, simplify));

    const d = polylinesToPath(lines, width, height);
    const sw = Number(p.strokeWidth);
    const body =
      `<rect width="${width}" height="${height}" fill="#ffffff"/>` +
      `<path d="${d}" fill="none" stroke="#111418" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;

    return { svg: svgDocument(width, height, body), meta: { paths: lines.length, colors: 1 } };
  },
};

export default centerline;
