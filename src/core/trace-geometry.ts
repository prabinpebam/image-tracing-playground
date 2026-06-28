/**
 * Deterministic raster→vector geometry primitives shared by the built-in
 * tracers. Pure (typed arrays + math), no DOM — runs in the trace path and in
 * Node tests. Identical inputs ⇒ identical output (spec G4).
 */

export interface Point {
  x: number;
  y: number;
}

export type Mask = Uint8Array; // length w*h, 1 = foreground

const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;

/** Binarize by luma. Foreground (1) = ink (dark) unless inverted. */
export function binarize(img: ImageData, threshold: number, invert: boolean): Mask {
  const { data, width, height } = img;
  const mask = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const y = LUMA_R * data[p] + LUMA_G * data[p + 1] + LUMA_B * data[p + 2];
    let fg = y < threshold ? 1 : 0;
    if (invert) fg = fg ? 0 : 1;
    mask[i] = fg;
  }
  return mask;
}

// ----------------------------------------------------------- marching squares
// edge midpoints within a cell at (cx,cy): 0=T 1=R 2=B 3=L
const EDGE_TABLE: number[][][] = [
  [], // 0
  [[3, 0]], // 1  TL
  [[0, 1]], // 2  TR
  [[3, 1]], // 3  TL TR
  [[1, 2]], // 4  BR
  [[3, 0], [1, 2]], // 5  TL BR (saddle)
  [[0, 2]], // 6  TR BR
  [[3, 2]], // 7  TL TR BR
  [[2, 3]], // 8  BL
  [[0, 2]], // 9  TL BL
  [[0, 1], [2, 3]], // 10 TR BL (saddle)
  [[1, 2]], // 11 TL TR BL
  [[3, 1]], // 12 BR BL
  [[0, 1]], // 13 TL BR BL
  [[3, 0]], // 14 TR BR BL
  [], // 15
];

function edgePoint(edge: number, cx: number, cy: number): Point {
  switch (edge) {
    case 0:
      return { x: cx + 0.5, y: cy };
    case 1:
      return { x: cx + 1, y: cy + 0.5 };
    case 2:
      return { x: cx + 0.5, y: cy + 1 };
    default:
      return { x: cx, y: cy + 0.5 };
  }
}

const keyOf = (p: Point): string => `${p.x * 2}_${p.y * 2}`;
const edgeKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Extract closed boundary loops between foreground and background at the 0.5
 * iso-level. Holes appear as separate loops (use fill-rule="evenodd").
 */
export function marchingSquaresLoops(mask: Mask, w: number, h: number): Point[][] {
  const at = (x: number, y: number): number => (x >= 0 && x < w && y >= 0 && y < h ? mask[y * w + x] : 0);

  const nodes = new Map<string, Point>();
  const adj = new Map<string, string[]>();
  const segs: [string, string][] = [];

  const addNode = (p: Point): string => {
    const k = keyOf(p);
    if (!nodes.has(k)) {
      nodes.set(k, p);
      adj.set(k, []);
    }
    return k;
  };

  for (let cy = -1; cy < h; cy++) {
    for (let cx = -1; cx < w; cx++) {
      const tl = at(cx, cy);
      const tr = at(cx + 1, cy);
      const br = at(cx + 1, cy + 1);
      const bl = at(cx, cy + 1);
      const b = tl | (tr << 1) | (br << 2) | (bl << 3);
      const pairs = EDGE_TABLE[b];
      if (pairs.length === 0) continue;
      for (const [e0, e1] of pairs) {
        const ka = addNode(edgePoint(e0, cx, cy));
        const kb = addNode(edgePoint(e1, cx, cy));
        adj.get(ka)!.push(kb);
        adj.get(kb)!.push(ka);
        segs.push([ka, kb]);
      }
    }
  }

  const seen = new Set<string>();
  const loops: Point[][] = [];

  for (const [sa, sb] of segs) {
    const startEdge = edgeKey(sa, sb);
    if (seen.has(startEdge)) continue;
    seen.add(startEdge);

    const loop: Point[] = [nodes.get(sa)!, nodes.get(sb)!];
    let prev = sa;
    let cur = sb;
    while (cur !== sa) {
      const neighbors = adj.get(cur)!;
      let next: string | undefined;
      for (const n of neighbors) {
        if (n === prev) continue;
        if (!seen.has(edgeKey(cur, n))) {
          next = n;
          break;
        }
      }
      if (next === undefined) break;
      seen.add(edgeKey(cur, next));
      loop.push(nodes.get(next)!);
      prev = cur;
      cur = next;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

/** Signed-area magnitude of a closed loop (shoelace). */
export function loopArea(loop: Point[]): number {
  let a = 0;
  for (let i = 0, n = loop.length; i < n; i++) {
    const p = loop[i];
    const q = loop[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

// ---------------------------------------------------------------------- RDP
function perpDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}

/** Iterative Ramer–Douglas–Peucker on an open polyline. */
export function simplifyOpen(points: Point[], epsilon: number): Point[] {
  if (points.length < 3 || epsilon <= 0) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop()!;
    let maxD = -1;
    let idx = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = perpDist(points[i], points[lo], points[hi]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > epsilon && idx !== -1) {
      keep[idx] = 1;
      stack.push([lo, idx], [idx, hi]);
    }
  }
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  return out;
}

/** Simplify a closed loop without collapsing the seam. */
export function simplifyClosed(loop: Point[], epsilon: number): Point[] {
  if (loop.length < 4 || epsilon <= 0) return loop.slice();
  let far = 1;
  let farD = -1;
  for (let i = 1; i < loop.length; i++) {
    const d = Math.hypot(loop[i].x - loop[0].x, loop[i].y - loop[0].y);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = simplifyOpen(loop.slice(0, far + 1), epsilon);
  const b = simplifyOpen(loop.slice(far).concat(loop[0]), epsilon);
  const merged = a.concat(b.slice(1, -1));
  return merged.length >= 3 ? merged : loop.slice();
}

// ------------------------------------------------------------- color quantize
interface Bin {
  r: number;
  g: number;
  b: number;
  c: number;
}

export interface Quantized {
  palette: number[][]; // [r,g,b]
  labels: Int32Array; // palette index per pixel
}

function channelRange(box: Bin[]): { r: number; g: number; b: number } {
  let rmin = 256;
  let rmax = -1;
  let gmin = 256;
  let gmax = -1;
  let bmin = 256;
  let bmax = -1;
  for (const e of box) {
    const ar = e.r / e.c;
    const ag = e.g / e.c;
    const ab = e.b / e.c;
    if (ar < rmin) rmin = ar;
    if (ar > rmax) rmax = ar;
    if (ag < gmin) gmin = ag;
    if (ag > gmax) gmax = ag;
    if (ab < bmin) bmin = ab;
    if (ab > bmax) bmax = ab;
  }
  return { r: rmax - rmin, g: gmax - gmin, b: bmax - bmin };
}

/** Deterministic median-cut quantization to (at most) k colors. */
export function quantize(img: ImageData, k: number): Quantized {
  const { data, width, height } = img;
  const n = width * height;
  const bins = new Map<number, Bin>();
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    let e = bins.get(key);
    if (!e) {
      e = { r: 0, g: 0, b: 0, c: 0 };
      bins.set(key, e);
    }
    e.r += r;
    e.g += g;
    e.b += b;
    e.c++;
  }

  let boxes: Bin[][] = [[...bins.values()]];
  while (boxes.length < k) {
    let target = -1;
    let bestScore = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue;
      const rng = channelRange(boxes[i]);
      const score = Math.max(rng.r, rng.g, rng.b);
      if (score > bestScore) {
        bestScore = score;
        target = i;
      }
    }
    if (target < 0) break;
    const box = boxes[target];
    const rng = channelRange(box);
    const ch: keyof Bin = rng.r >= rng.g && rng.r >= rng.b ? 'r' : rng.g >= rng.b ? 'g' : 'b';
    box.sort((a, b) => a[ch] / a.c - b[ch] / b.c);
    const total = box.reduce((s, e) => s + e.c, 0);
    let acc = 0;
    let split = 0;
    for (; split < box.length - 1; split++) {
      acc += box[split].c;
      if (acc >= total / 2) break;
    }
    // keep both halves non-empty even when one color dominates the box
    if (split > box.length - 2) split = box.length - 2;
    boxes.splice(target, 1, box.slice(0, split + 1), box.slice(split + 1));
  }

  const palette = boxes
    .filter((box) => box.length > 0)
    .map((box) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let c = 0;
    for (const e of box) {
      r += e.r;
      g += e.g;
      b += e.b;
      c += e.c;
    }
    return [Math.round(r / c), Math.round(g / c), Math.round(b / c)];
  });

  const labels = new Int32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    let bestD = Infinity;
    let bestI = 0;
    for (let pi = 0; pi < palette.length; pi++) {
      const dr = r - palette[pi][0];
      const dg = g - palette[pi][1];
      const db = b - palette[pi][2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) {
        bestD = d;
        bestI = pi;
      }
    }
    labels[i] = bestI;
  }
  return { palette, labels };
}

// ------------------------------------------------------------------ thinning
/** Zhang–Suen thinning to a 1px skeleton. */
export function zhangSuenThin(mask: Mask, w: number, h: number): Mask {
  const img = Uint8Array.from(mask);
  const idx = (x: number, y: number): number => y * w + x;
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 200) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      const clear: number[] = [];
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (!img[idx(x, y)]) continue;
          const p2 = img[idx(x, y - 1)];
          const p3 = img[idx(x + 1, y - 1)];
          const p4 = img[idx(x + 1, y)];
          const p5 = img[idx(x + 1, y + 1)];
          const p6 = img[idx(x, y + 1)];
          const p7 = img[idx(x - 1, y + 1)];
          const p8 = img[idx(x - 1, y)];
          const p9 = img[idx(x - 1, y - 1)];
          const bSum = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (bSum < 2 || bSum > 6) continue;
          const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
          let a = 0;
          for (let i = 0; i < 8; i++) if (seq[i] === 0 && seq[i + 1] === 1) a++;
          if (a !== 1) continue;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0) continue;
            if (p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0) continue;
            if (p2 * p6 * p8 !== 0) continue;
          }
          clear.push(idx(x, y));
        }
      }
      if (clear.length) {
        changed = true;
        for (const id of clear) img[id] = 0;
      }
    }
  }
  return img;
}

const NEIGHBORS: [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

/** Trace a 1px skeleton into open polylines (chains between nodes/junctions). */
export function traceSkeleton(skel: Mask, w: number, h: number): Point[][] {
  const idx = (x: number, y: number): number => y * w + x;
  const neighborsAt = (x: number, y: number): number[] => {
    const out: number[] = [];
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < w && ny >= 0 && ny < h && skel[idx(nx, ny)]) out.push(idx(nx, ny));
    }
    return out;
  };
  const xOf = (id: number): number => id % w;
  const yOf = (id: number): number => (id / w) | 0;
  const ek = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

  const seen = new Set<string>();
  const lines: Point[][] = [];
  const toPt = (id: number): Point => ({ x: xOf(id) + 0.5, y: yOf(id) + 0.5 });

  const walk = (startId: number, firstId: number, stopAtNodes: boolean): void => {
    const pts = [toPt(startId), toPt(firstId)];
    let prev = startId;
    let cur = firstId;
    for (;;) {
      const ns = neighborsAt(xOf(cur), yOf(cur));
      if (stopAtNodes && ns.length !== 2) break;
      let next = -1;
      for (const n of ns) {
        if (n === prev) continue;
        if (!seen.has(ek(cur, n))) {
          next = n;
          break;
        }
      }
      if (next === -1) break;
      seen.add(ek(cur, next));
      pts.push(toPt(next));
      prev = cur;
      cur = next;
      if (cur === startId) break;
    }
    if (pts.length >= 2) lines.push(pts);
  };

  // chains starting from endpoints/junctions
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!skel[idx(x, y)]) continue;
      if (neighborsAt(x, y).length === 2) continue;
      for (const n of neighborsAt(x, y)) {
        const e = ek(idx(x, y), n);
        if (seen.has(e)) continue;
        seen.add(e);
        walk(idx(x, y), n, true);
      }
    }
  }
  // closed loops with no node (all degree 2)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!skel[idx(x, y)]) continue;
      for (const n of neighborsAt(x, y)) {
        const e = ek(idx(x, y), n);
        if (seen.has(e)) continue;
        seen.add(e);
        walk(idx(x, y), n, false);
      }
    }
  }
  return lines;
}

export function polylineLength(pts: Point[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

// ------------------------------------------------------------- path builders
const clamp = (v: number, max: number): number => (v < 0 ? 0 : v > max ? max : v);

function fmt(n: number, d: number): string {
  return String(Number(n.toFixed(d)));
}

/** Closed loops → straight-edged path data (use fill-rule evenodd). */
export function loopsToPath(loops: Point[][], w: number, h: number, decimals = 1): string {
  let d = '';
  for (const loop of loops) {
    if (loop.length < 3) continue;
    d += `M${fmt(clamp(loop[0].x, w), decimals)} ${fmt(clamp(loop[0].y, h), decimals)}`;
    for (let i = 1; i < loop.length; i++) {
      d += `L${fmt(clamp(loop[i].x, w), decimals)} ${fmt(clamp(loop[i].y, h), decimals)}`;
    }
    d += 'Z';
  }
  return d;
}

/** Closed loops → smooth cubic path data via closed Catmull–Rom. */
export function smoothLoopsToPath(loops: Point[][], w: number, h: number, decimals = 1): string {
  let d = '';
  for (const loop of loops) {
    const n = loop.length;
    if (n < 3) continue;
    const cx = (i: number): number => clamp(loop[((i % n) + n) % n].x, w);
    const cy = (i: number): number => clamp(loop[((i % n) + n) % n].y, h);
    d += `M${fmt(cx(0), decimals)} ${fmt(cy(0), decimals)}`;
    for (let i = 0; i < n; i++) {
      const c1x = cx(i) + (cx(i + 1) - cx(i - 1)) / 6;
      const c1y = cy(i) + (cy(i + 1) - cy(i - 1)) / 6;
      const c2x = cx(i + 1) - (cx(i + 2) - cx(i)) / 6;
      const c2y = cy(i + 1) - (cy(i + 2) - cy(i)) / 6;
      d += `C${fmt(c1x, decimals)} ${fmt(c1y, decimals)} ${fmt(c2x, decimals)} ${fmt(c2y, decimals)} ${fmt(cx(i + 1), decimals)} ${fmt(cy(i + 1), decimals)}`;
    }
    d += 'Z';
  }
  return d;
}

/** Turn angle (degrees) at b between edges a→b and b→c. 0 = straight, 180 = reversal. */
function turnAngleDeg(a: Point, b: Point, c: Point): number {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  const lu = Math.hypot(ux, uy);
  const lv = Math.hypot(vx, vy);
  if (lu === 0 || lv === 0) return 180; // degenerate edge ⇒ treat as a corner
  let cos = (ux * vx + uy * vy) / (lu * lv);
  cos = cos < -1 ? -1 : cos > 1 ? 1 : cos;
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Corner-aware hybrid fitting (Potrace-style). The path runs through edge
 * midpoints; at each polygon vertex the turn angle decides the treatment:
 *  - turn angle ≥ cornerThresholdDeg  → sharp CORNER (straight lines to the vertex)
 *  - turn angle <  cornerThresholdDeg → smooth CURVE (cubic Bézier tangent to both
 *    edges at the midpoints, bulging toward the vertex)
 * cornerThresholdDeg = 0 ⇒ all corners (polygon); 180 ⇒ all smooth.
 * Smooth segments use the cubic equivalent of a quadratic through the vertex
 * (control handles at 2/3 toward the vertex), so curves never overshoot.
 */
export function hybridLoopsToPath(
  loops: Point[][],
  w: number,
  h: number,
  cornerThresholdDeg: number,
  decimals = 1,
): string {
  const mid = (p: Point, q: Point): Point => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
  const X = (v: number): string => fmt(clamp(v, w), decimals);
  const Y = (v: number): string => fmt(clamp(v, h), decimals);

  let d = '';
  for (const loop of loops) {
    const n = loop.length;
    if (n < 3) continue;
    const V = (i: number): Point => loop[((i % n) + n) % n];
    const edgeMid = (i: number): Point => mid(V(i), V(i + 1)); // midpoint of edge V[i]→V[i+1]

    const start = edgeMid(-1); // midpoint of the edge entering V[0]
    d += `M${X(start.x)} ${Y(start.y)}`;

    for (let i = 0; i < n; i++) {
      const b = V(i);
      const mOut = edgeMid(i);
      const theta = turnAngleDeg(V(i - 1), b, V(i + 1));

      if (theta >= cornerThresholdDeg) {
        // sharp corner: straight to the vertex, then to the outgoing midpoint
        d += `L${X(b.x)} ${Y(b.y)}L${X(mOut.x)} ${Y(mOut.y)}`;
      } else {
        // smooth: cubic from current point (incoming midpoint) to mOut
        const mIn = edgeMid(i - 1);
        const c1x = mIn.x + (2 / 3) * (b.x - mIn.x);
        const c1y = mIn.y + (2 / 3) * (b.y - mIn.y);
        const c2x = mOut.x + (2 / 3) * (b.x - mOut.x);
        const c2y = mOut.y + (2 / 3) * (b.y - mOut.y);
        d += `C${X(c1x)} ${Y(c1y)} ${X(c2x)} ${Y(c2y)} ${X(mOut.x)} ${Y(mOut.y)}`;
      }
    }
    d += 'Z';
  }
  return d;
}

/** Open polylines → path data (for stroked centerline output). */
export function polylinesToPath(lines: Point[][], w: number, h: number, decimals = 1): string {
  let d = '';
  for (const pts of lines) {
    if (pts.length < 2) continue;
    d += `M${fmt(clamp(pts[0].x, w), decimals)} ${fmt(clamp(pts[0].y, h), decimals)}`;
    for (let i = 1; i < pts.length; i++) {
      d += `L${fmt(clamp(pts[i].x, w), decimals)} ${fmt(clamp(pts[i].y, h), decimals)}`;
    }
  }
  return d;
}

export const rgb = (c: number[]): string =>
  `#${c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;

/** Wrap body markup in a sized SVG document with a viewBox in pixel space. */
export function svgDocument(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}
