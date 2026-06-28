/**
 * ImageTracer — reference engine (working).
 *
 * Pure-JS, deterministic color-region tracer. It is the reference because it
 * needs no WASM bootstrap, so it proves the end-to-end pipeline (decode →
 * preprocess → trace → measure → export) with the fewest moving parts.
 * Library: https://github.com/jankovicsandras/imagetracerjs
 */

import ImageTracer from 'imagetracerjs';
import type { ParamValues, TraceInput, TraceResult, TracerModule, TracerParam } from '../../core/types';

const params: TracerParam[] = [
  {
    key: 'numberofcolors',
    label: 'Colors',
    type: 'number',
    default: 16,
    min: 2,
    max: 64,
    step: 1,
    help: 'Palette size after color quantization.',
  },
  {
    key: 'pathomit',
    label: 'Path omit',
    type: 'number',
    default: 8,
    min: 0,
    max: 32,
    step: 1,
    group: 'Preprocess',
    help: 'Discard paths shorter than this many pixels (despeckle).',
  },
  {
    key: 'ltres',
    label: 'Line threshold',
    type: 'number',
    default: 1,
    min: 0.01,
    max: 10,
    step: 0.01,
    group: 'Curves',
    help: 'Straight-line error tolerance. Lower = more faithful, more nodes.',
  },
  {
    key: 'qtres',
    label: 'Curve threshold',
    type: 'number',
    default: 1,
    min: 0.01,
    max: 10,
    step: 0.01,
    group: 'Curves',
    help: 'Quadratic-spline error tolerance. Lower = more faithful, more nodes.',
  },
  {
    key: 'colorquantcycles',
    label: 'Quant cycles',
    type: 'number',
    default: 3,
    min: 1,
    max: 10,
    step: 1,
    group: 'Curves',
    advanced: true,
    help: 'Color quantization iterations.',
  },
  {
    key: 'strokewidth',
    label: 'Stroke width',
    type: 'number',
    default: 1,
    min: 0,
    max: 5,
    step: 0.5,
    advanced: true,
  },
  {
    key: 'roundcoords',
    label: 'Coord precision',
    type: 'number',
    default: 1,
    min: 0,
    max: 3,
    step: 1,
    advanced: true,
    help: 'Decimal places for path coordinates.',
  },
];

function buildOptions(p: ParamValues): Record<string, number | boolean> {
  return {
    numberofcolors: Number(p.numberofcolors),
    pathomit: Number(p.pathomit),
    ltres: Number(p.ltres),
    qtres: Number(p.qtres),
    colorquantcycles: Number(p.colorquantcycles),
    strokewidth: Number(p.strokewidth),
    roundcoords: Number(p.roundcoords),
    // deterministic palette sampling so identical inputs ⇒ identical SVG (spec G4)
    colorsampling: 2,
    viewbox: true,
    linefilter: true,
  };
}

export const imagetracer: TracerModule = {
  id: 'imagetracer',
  name: 'ImageTracer',
  category: 'color-region',
  blurb: 'Pure-JS color-region tracer. Quantizes colors, then traces layered paths.',
  bestFor: ['flat illustrations', 'icons', 'cartoons', 'posters'],
  params,
  async trace(input: TraceInput, p: ParamValues): Promise<TraceResult> {
    const svg = ImageTracer.imagedataToSVG(input.imageData, buildOptions(p));
    return { svg, meta: { colors: Number(p.numberofcolors) } };
  },
};

export default imagetracer;
