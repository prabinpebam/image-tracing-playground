/**
 * Icons. Functional glyphs use Fluent System Icons from the jsDelivr CDN,
 * rendered as CSS masks so they inherit `currentColor` and scale with font
 * size. The brand mark and empty-state art stay custom (the anchor-handle
 * motif is part of the product identity). No emoji anywhere.
 */

import { el, fromHTML } from './dom';

const CDN = 'https://cdn.jsdelivr.net/gh/microsoft/fluentui-system-icons/assets';

// semantic name → Fluent asset path (24px regular)
const FLUENT = {
  upload: 'Arrow%20Upload/SVG/ic_fluent_arrow_upload_24_regular.svg',
  sample: 'Shapes/SVG/ic_fluent_shapes_24_regular.svg',
  nodes: 'Pen/SVG/ic_fluent_pen_24_regular.svg',
  grid: 'Grid/SVG/ic_fluent_grid_24_regular.svg',
  ghost: 'Eye/SVG/ic_fluent_eye_24_regular.svg',
  export: 'Arrow%20Download/SVG/ic_fluent_arrow_download_24_regular.svg',
  copy: 'Copy/SVG/ic_fluent_copy_24_regular.svg',
  chevron: 'Chevron%20Down/SVG/ic_fluent_chevron_down_24_regular.svg',
  light: 'Weather%20Sunny/SVG/ic_fluent_weather_sunny_24_regular.svg',
  dark: 'Weather%20Moon/SVG/ic_fluent_weather_moon_24_regular.svg',
  system: 'Desktop/SVG/ic_fluent_desktop_24_regular.svg',
} as const;

export type IconName = keyof typeof FLUENT;

/** A themeable Fluent icon (CSS mask painted with currentColor). */
export function icon(name: IconName): HTMLElement {
  return el('span', {
    class: 'ficon',
    'aria-hidden': 'true',
    style: `--fi:url("${CDN}/${FLUENT[name]}")`,
  });
}

/** The signature anchor-and-handle brand mark (custom, theme-aware). */
export function brandMark(size = 28): HTMLElement {
  return fromHTML(`
    <svg viewBox="0 0 28 28" width="${size}" height="${size}" fill="none" aria-hidden="true">
      <line x1="6.5" y1="20" x2="21.5" y2="8" style="stroke:var(--vector)" stroke-width="1.5"/>
      <rect x="11" y="11" width="6" height="6" style="fill:var(--graphite)"/>
      <circle cx="6.5" cy="20" r="2.6" style="fill:var(--paper);stroke:var(--vector)" stroke-width="1.5"/>
      <circle cx="21.5" cy="8" r="2.6" style="fill:var(--paper);stroke:var(--vector)" stroke-width="1.5"/>
    </svg>`);
}

/** Large empty-state art: marching grid resolving into an anchored curve (custom, theme-aware). */
export function emptyArt(): HTMLElement {
  return fromHTML(`
    <svg viewBox="0 0 220 140" width="220" height="140" fill="none" aria-hidden="true">
      <g style="stroke:var(--line)" stroke-width="1">
        ${gridLines(220, 140, 20)}
      </g>
      <g opacity="0.85">
        <path d="M20 110 C 60 110, 70 30, 110 30 S 170 60, 200 30" style="stroke:var(--vector)" stroke-width="2" fill="none"/>
        <line x1="20" y1="110" x2="44" y2="92" style="stroke:var(--vector)" stroke-width="1.2"/>
        <line x1="200" y1="30" x2="176" y2="44" style="stroke:var(--vector)" stroke-width="1.2"/>
        <rect x="16" y="106" width="8" height="8" style="fill:var(--graphite)"/>
        <rect x="106" y="26" width="8" height="8" style="fill:var(--graphite)"/>
        <rect x="196" y="26" width="8" height="8" style="fill:var(--graphite)"/>
        <circle cx="44" cy="92" r="3" style="fill:var(--paper);stroke:var(--vector)" stroke-width="1.2"/>
        <circle cx="176" cy="44" r="3" style="fill:var(--paper);stroke:var(--vector)" stroke-width="1.2"/>
      </g>
      <g style="fill:var(--raster)" opacity="0.5">
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
