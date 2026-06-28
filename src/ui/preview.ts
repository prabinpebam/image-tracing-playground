/**
 * Output preview helpers: normalize engine SVG to a known coordinate space and
 * build a layered, perfectly-registered preview (ghost · vector · grid · nodes).
 * All layers share one viewBox + contain mapping so overlays align at any size.
 */

import { el, fromHTML } from './dom';

export interface Overlays {
  nodes: boolean;
  grid: boolean;
  ghost: boolean;
}

/** Ensure the root <svg> has an explicit viewBox + width/height, and strip scripts. */
export function normalizeSvg(svg: string, w: number, h: number): string {
  let s = svg.replace(/<script[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<svg\b([^>]*)>/i, (_m, attrs: string) => {
    let a = attrs;
    if (!/viewBox=/i.test(a)) a += ` viewBox="0 0 ${w} ${h}"`;
    a = a.replace(/\swidth="[^"]*"/i, '').replace(/\sheight="[^"]*"/i, '');
    a += ` width="${w}" height="${h}"`;
    return `<svg${a}>`;
  });
  return s;
}

const NUM_RE = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

/** Extract coordinate pairs (anchors + control points) for the node overlay. */
export function extractPoints(svg: string, cap = 1500): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const push = (nums: RegExpMatchArray | null) => {
    if (!nums) return;
    for (let i = 0; i + 1 < nums.length && pts.length < cap; i += 2) {
      pts.push({ x: Number(nums[i]), y: Number(nums[i + 1]) });
    }
  };
  let m: RegExpExecArray | null;
  const dRe = /\sd="([^"]*)"/gi;
  while ((m = dRe.exec(svg)) !== null && pts.length < cap) push(m[1].match(NUM_RE));
  const pRe = /\spoints="([^"]*)"/gi;
  while ((m = pRe.exec(svg)) !== null && pts.length < cap) push(m[1].match(NUM_RE));
  return pts;
}

function gridOverlay(w: number, h: number): HTMLElement {
  const divs = 24;
  const stepX = w / divs;
  const stepY = h / divs;
  let lines = '';
  for (let i = 1; i < divs; i++) {
    lines += `<line x1="${i * stepX}" y1="0" x2="${i * stepX}" y2="${h}"/>`;
    lines += `<line x1="0" y1="${i * stepY}" x2="${w}" y2="${i * stepY}"/>`;
  }
  return fromHTML(
    `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
       <g stroke="#e08a3c" stroke-width="${Math.max(0.5, w / 1600)}" opacity="0.45">${lines}</g>
     </svg>`,
  );
}

function nodesOverlay(svg: string, w: number, h: number): HTMLElement {
  const size = Math.max(2, w / 130);
  const pts = extractPoints(svg);
  const rects = pts
    .map(
      (p) =>
        `<rect x="${p.x - size / 2}" y="${p.y - size / 2}" width="${size}" height="${size}" fill="#0e8f86"/>`,
    )
    .join('');
  return fromHTML(
    `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet"><g opacity="0.9">${rects}</g></svg>`,
  );
}

/** Build the layered preview element. */
export function buildPreview(
  svg: string,
  sourceURL: string | null,
  w: number,
  h: number,
  overlays: Overlays,
): HTMLElement {
  const stack = el('div', { class: 'preview-stack' });

  if (overlays.ghost && sourceURL) {
    stack.append(el('div', { class: 'layer layer--ghost' }, [el('img', { src: sourceURL, alt: '' })]));
  }

  const vector = el('div', { class: 'layer layer--vector' });
  vector.append(fromHTML(normalizeSvg(svg, w, h)));
  stack.append(vector);

  if (overlays.grid) stack.append(el('div', { class: 'layer layer--grid' }, [gridOverlay(w, h)]));
  if (overlays.nodes) stack.append(el('div', { class: 'layer layer--nodes' }, [nodesOverlay(svg, w, h)]));

  return stack;
}
