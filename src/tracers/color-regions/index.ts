/**
 * Color Regions — built-in color tracer.
 *
 * Deterministic median-cut quantization → per-color marching-squares contours →
 * stacked layers painted largest-area first. Dependency-free, MIT-clean. A
 * distinct algorithm from ImageTracer for like-for-like comparison; VTracer
 * (Rust/WASM) can be added later as another color engine.
 */

import type { ParamValues, TraceInput, TraceResult, TracerModule, TracerParam } from '../../core/types';
import type { Point } from '../../core/trace-geometry';
import {
  loopArea,
  loopsToPath,
  marchingSquaresLoops,
  quantize,
  rgb,
  simplifyClosed,
  smoothLoopsToPath,
  svgDocument,
} from '../../core/trace-geometry';

const params: TracerParam[] = [
  { key: 'colors', label: 'Colors', type: 'number', default: 12, min: 2, max: 32, step: 1, help: 'Palette size (median-cut).' },
  { key: 'minArea', label: 'Despeckle', type: 'number', default: 16, min: 0, max: 300, step: 1, group: 'Preprocess', help: 'Drop regions smaller than this area.' },
  { key: 'epsilon', label: 'Simplify', type: 'number', default: 1, min: 0, max: 8, step: 0.1, group: 'Curves', help: 'Douglas–Peucker tolerance per region.' },
  {
    key: 'output',
    label: 'Output',
    type: 'enum',
    default: 'polygon',
    group: 'Curves',
    options: [
      { value: 'polygon', label: 'Polygon' },
      { value: 'smooth', label: 'Smooth (Bézier)' },
    ],
  },
];

interface Layer {
  color: number[];
  loops: Point[][];
  area: number;
}

export const colorRegions: TracerModule = {
  id: 'color-regions',
  name: 'Color Regions',
  category: 'color-region',
  blurb: 'Built-in color tracer: median-cut palette, per-color contours, stacked layers.',
  bestFor: ['flat illustrations', 'posters', 'icons', 'cartoons'],
  params,
  async trace(input: TraceInput, p: ParamValues): Promise<TraceResult> {
    const { imageData, width, height } = input;
    const k = Number(p.colors);
    const minArea = Number(p.minArea);
    const epsilon = Number(p.epsilon);
    const smooth = String(p.output) === 'smooth';

    const { palette, labels } = quantize(imageData, k);
    const counts = new Array<number>(palette.length).fill(0);
    for (let i = 0; i < labels.length; i++) counts[labels[i]]++;

    const layers: Layer[] = [];
    for (let c = 0; c < palette.length; c++) {
      if (counts[c] === 0) continue;
      const mask = new Uint8Array(width * height);
      for (let i = 0; i < mask.length; i++) if (labels[i] === c) mask[i] = 1;
      const loops = marchingSquaresLoops(mask, width, height)
        .filter((l) => loopArea(l) >= minArea)
        .map((l) => simplifyClosed(l, epsilon));
      if (!loops.length) continue;
      const area = loops.reduce((s, l) => s + loopArea(l), 0);
      layers.push({ color: palette[c], loops, area });
    }
    layers.sort((a, b) => b.area - a.area);

    // opaque background = dominant palette color
    let dominant = 0;
    for (let c = 1; c < counts.length; c++) if (counts[c] > counts[dominant]) dominant = c;
    let body = `<rect width="${width}" height="${height}" fill="${rgb(palette[dominant])}"/>`;

    let totalLoops = 0;
    for (const layer of layers) {
      const d = smooth ? smoothLoopsToPath(layer.loops, width, height) : loopsToPath(layer.loops, width, height);
      body += `<path d="${d}" fill="${rgb(layer.color)}" fill-rule="evenodd"/>`;
      totalLoops += layer.loops.length;
    }

    return { svg: svgDocument(width, height, body), meta: { paths: totalLoops, colors: layers.length } };
  },
};

export default colorRegions;
