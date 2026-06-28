/**
 * EDD for the hybrid (corner-aware) fitting: it must keep sharp turns as
 * straight-line corners and convert gentle turns to Bézier curves, controlled
 * by the corner-angle threshold. Deterministic.
 */

import { describe, expect, it } from 'vitest';
import { hybridLoopsToPath } from './trace-geometry';
import type { Point } from './trace-geometry';

const square: Point[] = [
  { x: 0, y: 0 },
  { x: 20, y: 0 },
  { x: 20, y: 20 },
  { x: 0, y: 20 },
];

// square (90° corners) + one gentle bump vertex at the top edge
const mixed: Point[] = [
  { x: 0, y: 0 },
  { x: 20, y: 0 },
  { x: 20, y: 20 },
  { x: 10, y: 21 },
  { x: 0, y: 20 },
];

describe('hybrid corner-aware fitting', () => {
  it('keeps sharp 90° corners as straight lines below the angle threshold', () => {
    const d = hybridLoopsToPath([square], 100, 100, 80); // 90° > 80 ⇒ corners
    expect(d).toContain('L');
    expect(d).not.toContain('C');
  });

  it('smooths the same corners into curves above the threshold', () => {
    const d = hybridLoopsToPath([square], 100, 100, 100); // 90° < 100 ⇒ curves
    expect(d).toContain('C');
  });

  it('mixes corners and curves on a shape with both', () => {
    const d = hybridLoopsToPath([mixed], 100, 100, 80);
    expect(d).toContain('C'); // the gentle bump
    expect(d).toContain('L'); // the square corners
  });

  it('is deterministic', () => {
    const a = hybridLoopsToPath([mixed], 100, 100, 80);
    const b = hybridLoopsToPath([mixed], 100, 100, 80);
    expect(a).toBe(b);
  });
});
