/**
 * EDD: the built-in engines must (a) produce real output, (b) be deterministic,
 * and (c) dispatch to genuinely DIFFERENT algorithms — not one shared helper
 * behind different labels (per the "test semantic invariants" lesson).
 * Runs DOM-free with a synthetic ImageData-shaped object.
 */

import { describe, expect, it } from 'vitest';
import { runTrace } from './pipeline';
import { defaultParams } from './types';
import type { TracerModule } from './types';
import contour from '../tracers/contour';
import colorRegions from '../tracers/color-regions';
import centerline from '../tracers/centerline';
import imagetracer from '../tracers/imagetracer';

const SIZE = 64;

function setRect(data: Uint8ClampedArray, x0: number, y0: number, x1: number, y1: number, v: number[]): void {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * SIZE + x) * 4;
      data[o] = v[0];
      data[o + 1] = v[1];
      data[o + 2] = v[2];
      data[o + 3] = 255;
    }
  }
}

function fixture(): ImageData {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  setRect(data, 0, 0, SIZE, SIZE, [255, 255, 255]); // white bg
  setRect(data, 12, 12, 28, 40, [17, 20, 24]); // dark filled rect
  setRect(data, 36, 12, 52, 28, [120, 120, 120]); // gray block (for color)
  // a thin black diagonal stroke (for centerline)
  for (let t = 0; t <= 20; t++) {
    const x = 38 + t;
    const y = 38 + t;
    if (x < SIZE && y < SIZE) {
      const o = (y * SIZE + x) * 4;
      data[o] = 17;
      data[o + 1] = 20;
      data[o + 2] = 24;
      data[o + 3] = 255;
    }
  }
  return { data, width: SIZE, height: SIZE, colorSpace: 'srgb' } as ImageData;
}

const engines: TracerModule[] = [contour, colorRegions, imagetracer, centerline];

async function trace(engine: TracerModule) {
  return runTrace(engine, { imageData: fixture(), width: SIZE, height: SIZE }, defaultParams(engine));
}

describe('built-in engines', () => {
  it('each produces a non-empty trace with paths', async () => {
    for (const engine of engines) {
      const out = await trace(engine);
      expect(out.error, `${engine.id} errored`).toBeUndefined();
      expect(out.svg.length, `${engine.id} empty svg`).toBeGreaterThan(0);
      expect(out.metrics.pathCount, `${engine.id} no paths`).toBeGreaterThan(0);
    }
  });

  it('each is deterministic (identical inputs ⇒ identical svg)', async () => {
    for (const engine of engines) {
      const a = await trace(engine);
      const b = await trace(engine);
      expect(a.svg, `${engine.id} not deterministic`).toBe(b.svg);
    }
  });

  it('produces distinct output across engines (no shared implementation)', async () => {
    const svgs = await Promise.all(engines.map((e) => trace(e).then((o) => o.svg)));
    const unique = new Set(svgs);
    expect(unique.size).toBe(engines.length);
  });

  it('Color Regions yields multiple colors; Centerline yields strokes', async () => {
    const color = await trace(colorRegions);
    expect(color.metrics.colorCount).toBeGreaterThanOrEqual(2);

    const center = await trace(centerline);
    expect(center.svg).toContain('stroke="#111418"');
    expect(center.svg).toContain('fill="none"');
  });
});
