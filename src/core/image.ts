/**
 * Image decode, global preprocessing, sample generation, and browser-only
 * rasterization helpers. DOM-bound (uses canvas) — runs in the browser, not in
 * the DOM-free core trace path. See documents/spec.md §7.
 */

export interface PreprocessOptions {
  /** Clamp the longest side to this many pixels (performance guard). */
  maxDimension: number;
  grayscale: boolean;
  /** Binarize using `threshold` when true. */
  thresholdEnabled: boolean;
  /** 0–255 cutoff. */
  threshold: number;
  invert: boolean;
}

export const defaultPreprocess: PreprocessOptions = {
  maxDimension: 1024,
  grayscale: false,
  thresholdEnabled: false,
  threshold: 128,
  invert: false,
};

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

/** Decode a Blob/File/URL into ImageData, clamped to `maxDimension`. */
export async function decodeToImageData(
  source: Blob | string,
  maxDimension = defaultPreprocess.maxDimension,
): Promise<ImageData> {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = createCanvas(width, height);
    const ctx = get2d(canvas);
    ctx.drawImage(img, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
  } finally {
    if (typeof source !== 'string') URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = url;
  });
}

function get2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
}

/** Apply shared global preprocessing. Returns a new ImageData. */
export function applyPreprocess(src: ImageData, opts: PreprocessOptions): ImageData {
  const out = new Uint8ClampedArray(src.data);
  const { grayscale, thresholdEnabled, threshold, invert } = opts;

  for (let i = 0; i < out.length; i += 4) {
    let r = out[i];
    let g = out[i + 1];
    let b = out[i + 2];

    if (grayscale || thresholdEnabled) {
      // Rec. 601 luma
      const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      r = g = b = y;
    }
    if (thresholdEnabled) {
      const v = r >= threshold ? 255 : 0;
      r = g = b = v;
    }
    if (invert) {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
  }
  return new ImageData(out, src.width, src.height);
}

/** Render ImageData to a data URL for preview. */
export function imageDataToDataURL(img: ImageData): string {
  const canvas = createCanvas(img.width, img.height);
  get2d(canvas).putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

export type SampleKind = 'logo' | 'flat' | 'line';

/**
 * Draw a deterministic test pattern so the app is usable with zero committed
 * assets. Each kind exercises a different engine category.
 */
export function generateSample(kind: SampleKind, size = 480): ImageData {
  const canvas = createCanvas(size, size);
  const ctx = get2d(canvas);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  const u = size / 12;

  if (kind === 'logo') {
    // hard-edged monochrome glyph — for binary tracing (Potrace)
    ctx.fillStyle = '#16191d';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, u * 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, u * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16191d';
    ctx.fillRect(size / 2 - u * 0.6, size / 2 - u * 5.4, u * 1.2, u * 4);
  } else if (kind === 'flat') {
    // overlapping flat-color shapes — for color-region tracing (VTracer)
    ctx.fillStyle = '#e08a3c';
    ctx.fillRect(u * 1.5, u * 1.5, u * 6, u * 6);
    ctx.fillStyle = '#0e8f86';
    ctx.beginPath();
    ctx.arc(u * 8, u * 8, u * 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16191d';
    ctx.beginPath();
    ctx.moveTo(u * 7, u * 2);
    ctx.lineTo(u * 11, u * 6);
    ctx.lineTo(u * 7, u * 6);
    ctx.closePath();
    ctx.fill();
  } else {
    // thin strokes — for centerline / contour tracing
    ctx.strokeStyle = '#16191d';
    ctx.lineWidth = Math.max(2, u * 0.18);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(u * 2, u * 2);
    ctx.bezierCurveTo(u * 6, u * 1, u * 6, u * 11, u * 10, u * 10);
    ctx.moveTo(u * 2, u * 9);
    ctx.lineTo(u * 10, u * 3);
    ctx.stroke();
  }
  return ctx.getImageData(0, 0, size, size);
}

/**
 * Rasterize an SVG string to ImageData at the given size (browser only).
 * Used for fidelity scoring. Returns null if the SVG cannot be rendered.
 */
export async function rasterizeSvg(
  svg: string,
  width: number,
  height: number,
): Promise<ImageData | null> {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = createCanvas(width, height);
    const ctx = get2d(canvas);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
