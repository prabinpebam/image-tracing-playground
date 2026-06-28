/** Inline SVG glyphs. No emoji anywhere (per design system §9). currentColor-driven. */

import { fromHTML } from './dom';

const NS = 'stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"';

const glyphs: Record<string, string> = {
  upload: `<svg viewBox="0 0 24 24" width="18" height="18" ${NS}><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg>`,
  sample: `<svg viewBox="0 0 24 24" width="18" height="18" ${NS}><rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 14l4-4 4 4 3-3 5 5"/></svg>`,
  nodes: `<svg viewBox="0 0 24 24" width="16" height="16" ${NS}><path d="M5 19 19 5"/><rect x="3" y="17" width="4" height="4" fill="currentColor"/><rect x="17" y="3" width="4" height="4" fill="currentColor"/></svg>`,
  grid: `<svg viewBox="0 0 24 24" width="16" height="16" ${NS}><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>`,
  ghost: `<svg viewBox="0 0 24 24" width="16" height="16" ${NS}><rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 13l4-3 4 3 4-4 4 4"/></svg>`,
  export: `<svg viewBox="0 0 24 24" width="16" height="16" ${NS}><path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" width="16" height="16" ${NS}><rect x="9" y="9" width="11" height="11" rx="1"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>`,
};

/** The signature anchor-and-handle brand mark. */
export function brandMark(size = 28): HTMLElement {
  return fromHTML(`
    <svg viewBox="0 0 28 28" width="${size}" height="${size}" fill="none" aria-hidden="true">
      <line x1="6.5" y1="20" x2="21.5" y2="8" stroke="#0e8f86" stroke-width="1.5"/>
      <rect x="11" y="11" width="6" height="6" fill="#16191d"/>
      <circle cx="6.5" cy="20" r="2.6" fill="#fbfbf9" stroke="#0e8f86" stroke-width="1.5"/>
      <circle cx="21.5" cy="8" r="2.6" fill="#fbfbf9" stroke="#0e8f86" stroke-width="1.5"/>
    </svg>`);
}

/** Large empty-state art: marching grid resolving into an anchored curve. */
export function emptyArt(): HTMLElement {
  return fromHTML(`
    <svg viewBox="0 0 220 140" width="220" height="140" fill="none" aria-hidden="true">
      <g stroke="#ccd4cf" stroke-width="1">
        ${gridLines(220, 140, 20)}
      </g>
      <g opacity="0.85">
        <path d="M20 110 C 60 110, 70 30, 110 30 S 170 60, 200 30" stroke="#0e8f86" stroke-width="2" fill="none"/>
        <line x1="20" y1="110" x2="44" y2="92" stroke="#0e8f86" stroke-width="1.2"/>
        <line x1="200" y1="30" x2="176" y2="44" stroke="#0e8f86" stroke-width="1.2"/>
        <rect x="16" y="106" width="8" height="8" fill="#16191d"/>
        <rect x="106" y="26" width="8" height="8" fill="#16191d"/>
        <rect x="196" y="26" width="8" height="8" fill="#16191d"/>
        <circle cx="44" cy="92" r="3" fill="#fbfbf9" stroke="#0e8f86" stroke-width="1.2"/>
        <circle cx="176" cy="44" r="3" fill="#fbfbf9" stroke="#0e8f86" stroke-width="1.2"/>
      </g>
      <g fill="#e08a3c" opacity="0.5">
        <rect x="20" y="100" width="10" height="10"/>
        <rect x="30" y="90" width="10" height="10"/>
        <rect x="40" y="90" width="10" height="10"/>
      </g>
    </svg>`);
}

function gridLines(w: number, h: number, step: number): string {
  let out = '';
  for (let x = step; x < w; x += step) out += `<line x1="${x}" y1="0" x2="${x}" y2="${h}"/>`;
  for (let y = step; y < h; y += step) out += `<line x1="0" y1="${y}" x2="${w}" y2="${y}"/>`;
  return out;
}

export function icon(name: keyof typeof glyphs): HTMLElement {
  return fromHTML(glyphs[name]);
}
