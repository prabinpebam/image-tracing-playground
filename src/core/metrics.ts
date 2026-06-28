/**
 * Pure, portable metrics over an SVG string and image comparison helpers.
 * No DOM dependency (regex parsing) so these run in the core trace path, in a
 * worker, and in Node tests. See documents/spec.md §8.
 */

const SHAPE_RE = /<(path|polygon|polyline|rect|circle|ellipse|line)\b/gi;
const D_ATTR_RE = /\sd="([^"]*)"/gi;
const PATH_CMD_RE = /[mlcsqtahv]/gi;
const POINTS_RE = /\spoints="([^"]*)"/gi;
const FILL_RE = /\sfill="([^"]*)"/gi;
const STROKE_RE = /\sstroke="([^"]*)"/gi;

const NON_COLORS = new Set(['none', 'transparent', '']);

/** UTF-8 byte length of the SVG. */
export function byteSize(svg: string): number {
  return new TextEncoder().encode(svg).length;
}

/** Count drawable shape elements. */
export function countPaths(svg: string): number {
  return (svg.match(SHAPE_RE) ?? []).length;
}

/** Approximate anchor/node count: path commands + polygon/polyline vertices. */
export function countNodes(svg: string): number {
  let nodes = 0;

  let m: RegExpExecArray | null;
  D_ATTR_RE.lastIndex = 0;
  while ((m = D_ATTR_RE.exec(svg)) !== null) {
    nodes += (m[1].match(PATH_CMD_RE) ?? []).length;
  }

  POINTS_RE.lastIndex = 0;
  while ((m = POINTS_RE.exec(svg)) !== null) {
    const coords = m[1].trim().split(/[\s,]+/).filter(Boolean);
    nodes += Math.floor(coords.length / 2);
  }

  return nodes;
}

/** Distinct fill/stroke colors (excluding none/transparent). */
export function countColors(svg: string): number {
  const colors = new Set<string>();
  for (const re of [FILL_RE, STROKE_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(svg)) !== null) {
      const v = m[1].trim().toLowerCase();
      if (!NON_COLORS.has(v)) colors.add(v);
    }
  }
  return colors.size;
}

/** SHA-256 hex digest of the SVG, for determinism checks. */
export async function sha256(svg: string): Promise<string> {
  const bytes = new TextEncoder().encode(svg);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toGray(data: Uint8ClampedArray): Float64Array {
  const g = new Float64Array(data.length / 4);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    g[j] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return g;
}

export interface ImageComparison {
  mse: number;
  ssim: number;
  /** 0–1 fidelity score (clamped SSIM). */
  fidelity: number;
}

/**
 * Compare two equally sized images on grayscale. Reports MSE and a global SSIM.
 * Returns null if dimensions differ.
 */
export function compareImages(a: ImageData, b: ImageData): ImageComparison | null {
  if (a.width !== b.width || a.height !== b.height) return null;

  const ga = toGray(a.data);
  const gb = toGray(b.data);
  const n = ga.length;

  let se = 0;
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < n; i++) {
    const d = ga[i] - gb[i];
    se += d * d;
    meanA += ga[i];
    meanB += gb[i];
  }
  const mse = se / n;
  meanA /= n;
  meanB /= n;

  let varA = 0;
  let varB = 0;
  let cov = 0;
  for (let i = 0; i < n; i++) {
    const da = ga[i] - meanA;
    const db = gb[i] - meanB;
    varA += da * da;
    varB += db * db;
    cov += da * db;
  }
  varA /= n;
  varB /= n;
  cov /= n;

  const L = 255;
  const c1 = (0.01 * L) ** 2;
  const c2 = (0.03 * L) ** 2;
  const ssim =
    ((2 * meanA * meanB + c1) * (2 * cov + c2)) /
    ((meanA * meanA + meanB * meanB + c1) * (varA + varB + c2));

  return { mse, ssim, fidelity: Math.max(0, Math.min(1, ssim)) };
}
