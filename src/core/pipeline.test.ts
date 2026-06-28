/**
 * Phase 0 EDD check (documents/plan.md): the reference engine + pipeline must
 * produce a non-empty trace and be deterministic — identical inputs ⇒ identical
 * SVG hash. Runs DOM-free by passing a plain ImageData-shaped object.
 */

import { describe, expect, it } from 'vitest';
import imagetracer from '../tracers/imagetracer';
import { defaultParams } from './types';
import { runTrace } from './pipeline';

function squareImage(size: number): ImageData {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inside = x > size * 0.3 && x < size * 0.7 && y > size * 0.3 && y < size * 0.7;
      const v = inside ? 0 : 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return { data, width: size, height: size, colorSpace: 'srgb' } as ImageData;
}

describe('pipeline + ImageTracer reference engine', () => {
  it('produces a non-empty trace with paths', async () => {
    const img = squareImage(48);
    const out = await runTrace(imagetracer, { imageData: img, width: 48, height: 48 }, defaultParams(imagetracer));
    expect(out.error).toBeUndefined();
    expect(out.svg.length).toBeGreaterThan(0);
    expect(out.metrics.pathCount).toBeGreaterThan(0);
    expect(out.metrics.byteSize).toBeGreaterThan(0);
  });

  it('is deterministic (identical inputs ⇒ identical hash)', async () => {
    const img = squareImage(48);
    const params = defaultParams(imagetracer);
    const a = await runTrace(imagetracer, { imageData: img, width: 48, height: 48 }, params);
    const b = await runTrace(imagetracer, { imageData: img, width: 48, height: 48 }, params);
    expect(a.metrics.hash).toBeDefined();
    expect(a.metrics.hash).toBe(b.metrics.hash);
  });
});
