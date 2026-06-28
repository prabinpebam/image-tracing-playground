# Image Tracing Playground — Design System

> Companion to [spec.md](./spec.md). Implemented in [src/styles/tokens.css](../src/styles/tokens.css) and [src/styles/app.css](../src/styles/app.css).
> Direction set per the `frontend-design` skill: deliberate, subject-grounded choices — not a templated dashboard.

---

## 1. Design direction — "Anchor & Handle"

The subject is the act of turning **pixels into curves**: a marching grid of samples on one side, a smooth Bézier path with anchor points and control handles on the other. The whole interface is built around that **raster → vector duality**, and the iconic glyph of vector editing — the **anchor node with two control handles** — is the signature element.

This is a precision instrument, not a poster. It should feel like a **drafting table / plotter / CAD tool**: exact, quiet, gridded, with two colors that *mean something* — one warm color for the **raster source** (pixels, input) and one cool color for the **vector output** (curves, result). Color encodes the transformation, it does not decorate it.

**What it is not:** not the cream-paper-serif-terracotta look, not the near-black-with-acid-green look, not the broadsheet-hairline look. Those are AI defaults. Where the brief left an axis free, it is spent on the raster/vector duality instead.

### Manifesto (short)
> Every image is already a drawing waiting to be found. The grid is the question; the curve is the answer. We show both at once — the warm pixel and the cool path — and let the anchor point, with its two patient handles, stand for the moment one becomes the other. Restraint everywhere except the trace itself.

---

## 2. Color

A graphite-and-film neutral base, with two semantic accents that map to the duality. All values are tokens in `tokens.css`.

| Token | Hex | Role |
| --- | --- | --- |
| `--graphite` | `#16191D` | Primary ink: text, structure, node squares |
| `--graphite-2` | `#2A2F37` | Secondary ink, strong borders |
| `--slate` | `#5A6470` | Secondary text, captions, axis labels |
| `--film` | `#EAEEEC` | App background (cool drafting film, *not* cream) |
| `--paper` | `#FBFBF9` | Raised panels / canvas surface |
| `--line` | `#CCD4CF` | Hairline grid and dividers |
| `--raster` | `#E08A3C` | **Warm accent — the source/pixels** (input chrome, raster overlays) |
| `--raster-soft` | `#F4D9BE` | Raster tint / fills |
| `--vector` | `#0E8F86` | **Cool accent — the traced output/curves** (paths, handles, primary actions) |
| `--vector-soft` | `#BFE5E0` | Vector tint / selected states |
| `--signal` | `#C8324B` | Error / determinism mismatch only (used sparingly) |

**Usage rules**
- Warm `--raster` only ever appears on **input/source** affordances and raster overlays. Cool `--vector` only ever appears on **output/trace** affordances, paths, and primary CTAs. Never swap them — the color *is* information.
- `--signal` is reserved for genuine errors (failed trace, determinism mismatch). It is not a third accent.
- Dark mode (optional, Phase 6) inverts the neutral ramp (graphite background, film text) and keeps both semantic accents.

---

## 3. Typography

Three roles, chosen for an engineering pedigree rather than neutral defaults.

| Role | Family | Use |
| --- | --- | --- |
| **Display** | `Space Grotesk` | App title, section eyebrows, large headings — technical, slightly mechanical |
| **Body / UI** | `IBM Plex Sans` | Labels, buttons, descriptions (Plex was drawn for an engineering company — on-subject) |
| **Mono / Data** | `IBM Plex Mono` | Metrics, coordinates, parameter values, SVG code, path data — anything numeric or machine-exact |

**Type scale** (1.250 major-third, tokenized as `--text-*`):

| Token | rem | Use |
| --- | --- | --- |
| `--text-xs` | 0.75 | captions, axis ticks |
| `--text-sm` | 0.875 | labels, controls |
| `--text-base` | 1.0 | body |
| `--text-lg` | 1.25 | panel titles |
| `--text-xl` | 1.563 | section headings |
| `--text-2xl` | 1.953 | app title |

**Rules**
- Numbers that the user compares (metrics, params, coordinates) are **always** mono and **tabular** (`font-variant-numeric: tabular-nums`) so columns align — comparison is the product's job.
- Display face used with restraint: title + section eyebrows only.
- Sentence case throughout; no all-caps except small mono eyebrows with tracking.

---

## 4. Spacing, grid, radius

- **Spacing scale** (tokenized `--space-*`): `4, 8, 12, 16, 24, 32, 48, 64`. Everything snaps to this 4px grid — the interface is literally gridded, matching the subject.
- **Layout grid:** three zones (source · output · controls) on desktop; collapses to a single column < 900px. Output zone is the widest (the work happens there).
- **Radius** (tokenized `--radius-*`): `2` (controls), `6` (panels), `10` (modals). Small radii read as instrument-like, not playful. Node squares and the pixel grid are intentionally **sharp** (0 radius).
- **Borders:** hairline `1px solid var(--line)`. Panels are defined by line and surface, not by shadow. Elevation is used sparingly (`--shadow-1` for the active preview only).

---

## 5. Signature element — the anchor & handle

The brand mark and recurring motif is a **Bézier anchor node**: a small filled graphite **square** (the anchor) with a thin tangent line through it ending in two hollow **circular handles**, drawn in `--vector`.

Where it appears:
- **Logo/wordmark** beside the app title.
- **Section eyebrows** use a tiny anchor square as the bullet.
- **Output overlay:** real anchor nodes on the traced path render in exactly this style (the motif is literally the data).
- **Loading state:** the two handles rotate slowly around the anchor (disabled under `prefers-reduced-motion`).
- **Empty state:** a large, faint anchor-and-handle with a marching-squares grid resolving into a curve — the duality, stated once, big.

Spend boldness here and nowhere else (Chanel's rule: remove one accessory). The rest of the UI stays quiet so this motif and the trace itself carry the personality.

---

## 6. The raster/vector duality in the UI

- **Source panel** chrome is tinted with `--raster` (a warm left rail / warm label dots). The pixel grid overlay is warm.
- **Output panel** chrome and the path preview use `--vector`. Anchor handles are `--vector`; anchor squares are `--graphite`.
- The **"Generate sample"** and **export** controls echo this: sample (input) is warm-accented, export-of-vector is cool-accented.
- The **mode toggle** (Single / Compare) sits on the boundary between them, neutral.

---

## 7. Components

| Component | Spec |
| --- | --- |
| **Button (primary)** | `--vector` fill, `--paper` text, radius `--radius-sm`, mono label for actions on data; warm variant for input actions |
| **Button (ghost)** | transparent, `--line` border, `--graphite` text |
| **Slider (param)** | thin track in `--line`, fill in `--vector`, square thumb; value shown in mono to the right, tabular |
| **Toggle / checkbox** | square (never pill), check in `--vector` |
| **Enum select** | segmented control of mono labels for ≤4 options; native `<select>` above that |
| **Panel** | `--paper` surface, hairline border, `--space-16` padding, mono eyebrow title with anchor bullet |
| **Metric chip** | label (sm sans, `--slate`) over value (lg mono, tabular); grid of chips under the preview |
| **Metrics table (compare)** | mono tabular cells; sortable; frontier rows marked with a `--vector` left edge |
| **Code block (SVG)** | `--graphite` surface, `--film` text, mono, copy button |
| **Tooltip** | small, `--graphite` surface, used for param `help` |

---

## 8. Motion

- Purposeful and subtle. Transitions 120–180ms ease-out on hover/focus and panel changes.
- The only ambient motion is the loading anchor-handle rotation; everything else is state-driven.
- Re-trace updates the preview with a quick cross-fade (≤150ms) so parameter sweeps read as continuous.
- All motion gated by `@media (prefers-reduced-motion: reduce)` → none.

---

## 9. Iconography

- Inline SVG glyphs only; **no emoji** anywhere in UI copy, labels, status, or tooltips.
- Glyphs are line icons at `1.5` stroke on a 24px grid, colored by context (warm for source, cool for output, graphite default).
- Core glyphs: load/upload, sample/generate, node-overlay, grid-overlay, ghost-overlay, export, copy, compare, single.

---

## 10. Accessibility & quality floor

- Contrast: body text `--graphite` on `--paper`/`--film` ≥ 7:1; accents used for fills meet ≥ 4.5:1 against their text.
- Color never the sole signal: source/output also differ by position and label; metrics always carry text.
- Visible keyboard focus ring (`2px` `--vector` offset) on every interactive element.
- Hit targets ≥ 32px; sliders keyboard-steppable.
- Respect `prefers-reduced-motion` and `prefers-color-scheme` (Phase 6 dark mode).

---

## 11. Token summary (see `tokens.css`)

```
Color    --graphite --graphite-2 --slate --film --paper --line
         --raster --raster-soft --vector --vector-soft --signal
Type     --font-display --font-body --font-mono
         --text-xs … --text-2xl   --weight-regular/medium/semibold
Space    --space-4 … --space-64
Radius   --radius-sm --radius-md --radius-lg
Motion   --ease --dur-fast --dur-base
Shadow   --shadow-1
```
