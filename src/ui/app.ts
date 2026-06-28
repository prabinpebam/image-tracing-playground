/**
 * App shell — composes the three zones (source · output · controls), owns UI
 * state, and drives the trace pipeline. Framework-free; panels re-render from
 * state. See documents/spec.md §9 and documents/design-system.md.
 */

import { defaultParams } from '../core/types';
import type { ParamValue, ParamValues, TraceOutcome } from '../core/types';
import { getEngine, listEngines } from '../core/registry';
import { runTrace } from '../core/pipeline';
import {
  applyPreprocess,
  decodeToImageData,
  defaultPreprocess,
  generateSample,
  imageDataToDataURL,
  rasterizeSvg,
} from '../core/image';
import type { PreprocessOptions, SampleKind } from '../core/image';
import { compareImages } from '../core/metrics';
import { brandMark, emptyArt, icon } from './icons';
import type { IconName } from './icons';
import { getThemeChoice, setThemeChoice } from './theme';
import type { ThemeChoice } from './theme';
import { renderEngineList, renderParams } from './controls';
import { buildPreview, normalizeSvg } from './preview';
import type { Overlays } from './preview';
import { clear, copyText, debounce, download, el, mount } from './dom';

type MetricKey = 'pathCount' | 'nodeCount' | 'byteSize' | 'durationMs' | 'colorCount' | 'fidelity';

interface State {
  source: ImageData | null;
  processed: ImageData | null;
  sourceURL: string | null;
  processedURL: string | null;
  loadError: string | null;
  engineId: string;
  paramsByEngine: Record<string, ParamValues>;
  preprocess: PreprocessOptions;
  mode: 'single' | 'compare';
  overlays: Overlays;
  outcome: TraceOutcome | null;
  compare: TraceOutcome[];
  busy: boolean;
  sampleIndex: number;
  sortKey: MetricKey;
  sortDir: 'asc' | 'desc';
}

const SAMPLE_KINDS: SampleKind[] = ['logo', 'flat', 'line'];

export class App {
  private engines = listEngines();
  private fileInput: HTMLInputElement;
  private sourceHost!: HTMLElement;
  private sourcePreprocess!: HTMLElement;
  private outputHead!: HTMLElement;
  private outputHost!: HTMLElement;
  private outputFoot!: HTMLElement;
  private controlsBody!: HTMLElement;
  private controlsFoot!: HTMLElement;
  private modeHost!: HTMLElement;
  private themeHost!: HTMLElement;
  private scheduleRun = debounce(() => void this.run(), 200);

  private state: State = {
    source: null,
    processed: null,
    sourceURL: null,
    processedURL: null,
    loadError: null,
    engineId: this.engines[0]?.id ?? '',
    paramsByEngine: {},
    preprocess: { ...defaultPreprocess },
    mode: 'single',
    overlays: { nodes: false, grid: false, ghost: false },
    outcome: null,
    compare: [],
    busy: false,
    sampleIndex: 0,
    sortKey: 'nodeCount',
    sortDir: 'asc',
  };

  constructor(private root: HTMLElement) {
    this.fileInput = el('input', {
      type: 'file',
      accept: 'image/*',
      style: 'display:none',
      onChange: (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) void this.loadFile(file);
      },
    }) as HTMLInputElement;
    this.build();
    this.attachDnD();
    this.attachPaste();
    this.renderAll();
  }

  // --------------------------------------------------------------- layout
  private build(): void {
    this.sourceHost = el('div', { class: 'panel__body' });
    this.sourcePreprocess = el('div', { class: 'panel__foot' });
    this.outputHead = el('div', { class: 'panel__head' });
    this.outputHost = el('div', { class: 'panel__body' });
    this.outputFoot = el('div', { class: 'panel__foot' });
    this.controlsBody = el('div', { class: 'panel__body' });
    this.controlsFoot = el('div', { class: 'panel__foot' });
    this.modeHost = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Mode' });
    this.themeHost = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Theme' });

    const appbar = el('header', { class: 'appbar' }, [
      el('div', { class: 'appbar__brand' }, [
        brandMark(28),
        el('div', {}, [
          el('h1', { class: 'appbar__title' }, ['Image Tracing Playground']),
          el('div', { class: 'appbar__sub' }, ['deterministic raster → vector']),
        ]),
      ]),
      el('div', { class: 'appbar__actions' }, [this.modeHost, this.themeHost]),
    ]);

    const sourceActions = el('div', { class: 'head-actions' }, [
      this.iconButton('Load image', 'upload', () => this.fileInput.click()),
      this.iconButton('Sample', 'sample', () => this.useSample()),
    ]);
    const source = el('section', { class: 'panel zone--source' }, [
      el('div', { class: 'panel__head' }, [eyebrow('Source'), sourceActions]),
      this.sourceHost,
      this.sourcePreprocess,
    ]);
    const output = el('section', { class: 'panel zone--output' }, [
      this.outputHead,
      this.outputHost,
      this.outputFoot,
    ]);
    const controls = el('aside', { class: 'panel zone--controls' }, [
      el('div', { class: 'panel__head' }, [eyebrow('Engine & parameters')]),
      this.controlsBody,
      this.controlsFoot,
    ]);

    mount(this.root, appbar, el('main', { class: 'workspace' }, [source, output, controls]), this.fileInput);
    this.renderMode();
    this.renderTheme();
  }

  private iconButton(label: string, name: 'upload' | 'sample', onClick: () => void): HTMLElement {
    return el('button', { class: 'icon-btn', type: 'button', title: label, 'aria-label': label, onClick }, [icon(name)]);
  }

  /** (Re)render the Single/Compare toggle so the active state always reflects mode. */
  private renderMode(): void {
    const make = (mode: 'single' | 'compare', label: string): HTMLElement =>
      el('button', {
        type: 'button',
        'aria-pressed': String(this.state.mode === mode),
        onClick: () => this.setMode(mode),
      }, [label]);
    mount(this.modeHost, make('single', 'Single'), make('compare', 'Compare'));
  }

  private setMode(mode: 'single' | 'compare'): void {
    if (this.state.mode === mode) return;
    this.state.mode = mode;
    this.renderMode();
    this.renderControls();
    void this.run();
  }

  /** Light / dark / system theme selector (icon segmented control). */
  private renderTheme(): void {
    const choice = getThemeChoice();
    const make = (value: ThemeChoice, name: IconName, label: string): HTMLElement =>
      el('button', {
        type: 'button',
        class: 'seg-icon',
        title: label,
        'aria-label': label,
        'aria-pressed': String(choice === value),
        onClick: () => {
          setThemeChoice(value);
          this.renderTheme();
        },
      }, [icon(name)]);
    mount(
      this.themeHost,
      make('light', 'light', 'Light theme'),
      make('dark', 'dark', 'Dark theme'),
      make('system', 'system', 'System theme'),
    );
  }

  // --------------------------------------------------------------- sources
  private async loadFile(file: File): Promise<void> {
    try {
      const img = await decodeToImageData(file, this.state.preprocess.maxDimension);
      this.state.loadError = null;
      this.setSource(img);
    } catch (err) {
      this.state.loadError = err instanceof Error ? err.message : 'Could not load image';
      this.renderOutput();
    }
  }

  private useSample(): void {
    const kind = SAMPLE_KINDS[this.state.sampleIndex % SAMPLE_KINDS.length];
    this.state.sampleIndex++;
    this.state.loadError = null;
    this.setSource(generateSample(kind));
  }

  private setSource(img: ImageData): void {
    this.state.source = img;
    this.state.sourceURL = imageDataToDataURL(img);
    this.reprocess();
    this.renderAll();
    void this.run();
  }

  private reprocess(): void {
    if (!this.state.source) return;
    this.state.processed = applyPreprocess(this.state.source, this.state.preprocess);
    this.state.processedURL = imageDataToDataURL(this.state.processed);
  }

  // ----------------------------------------------------------------- trace
  private paramsFor(id: string): ParamValues {
    let p = this.state.paramsByEngine[id];
    if (!p) {
      const engine = getEngine(id);
      p = engine ? defaultParams(engine) : {};
      this.state.paramsByEngine[id] = p;
    }
    return p;
  }

  private async run(): Promise<void> {
    if (!this.state.processed) return;
    this.state.busy = true;
    this.renderOutputHead();
    await raf(); // let the busy indicator paint before synchronous CPU work
    if (this.state.mode === 'single') await this.runSingle();
    else await this.runCompare();
    this.state.busy = false;
    this.renderOutput();
    this.renderControlsFoot();
  }

  private input() {
    const img = this.state.processed!;
    return { imageData: img, width: img.width, height: img.height };
  }

  private async runSingle(): Promise<void> {
    const engine = getEngine(this.state.engineId);
    if (!engine) return;
    const outcome = await runTrace(engine, this.input(), this.paramsFor(engine.id));
    if (outcome.svg) await this.measureFidelity(outcome);
    this.state.outcome = outcome;
  }

  private async runCompare(): Promise<void> {
    // Render progressively so each engine's card appears as it finishes.
    this.state.compare = [];
    this.renderCompare();
    for (const engine of this.engines) {
      await raf();
      const outcome = await runTrace(engine, this.input(), this.paramsFor(engine.id));
      if (outcome.svg) await this.measureFidelity(outcome);
      this.state.compare.push(outcome);
      this.renderCompare();
    }
  }

  private async measureFidelity(outcome: TraceOutcome): Promise<void> {
    const src = this.state.processed;
    if (!src || !outcome.svg) return;
    const raster = await rasterizeSvg(normalizeSvg(outcome.svg, src.width, src.height), src.width, src.height);
    if (!raster) return;
    const cmp = compareImages(src, raster);
    if (cmp) {
      outcome.metrics.fidelity = cmp.fidelity;
      outcome.metrics.mse = cmp.mse;
    }
  }

  // --------------------------------------------------------------- render
  private renderAll(): void {
    this.renderSource();
    this.renderControls();
    this.renderOutput();
  }

  private renderSource(): void {
    this.updateSourcePreview();
    this.renderPreprocess();
  }

  /** Update only the source preview image, leaving the preprocess controls intact. */
  private updateSourcePreview(): void {
    if (this.state.processedURL) {
      mount(this.sourceHost, el('div', { class: 'preview' }, [el('img', { src: this.state.processedURL, alt: 'Source image' })]));
    } else {
      mount(
        this.sourceHost,
        el('div', { class: 'preview dropzone', 'data-drop': 'true' }, [
          el('div', { class: 'empty__hint' }, ['Drop or paste an image here, or use Load / Generate sample.']),
        ]),
      );
    }
  }

  private renderPreprocess(): void {
    const pp = this.state.preprocess;

    // Reprocess + refresh the preview image only (never rebuild the controls,
    // so a slider drag is not interrupted by DOM replacement).
    const apply = (): void => {
      this.reprocess();
      this.updateSourcePreview();
      this.scheduleRun();
    };

    const checkbox = (label: string, checked: boolean, on: (v: boolean) => void): HTMLElement =>
      el('label', { class: 'checkbox' }, [
        el('input', {
          type: 'checkbox',
          ...(checked ? { checked: 'checked' } : {}),
          onChange: (e: Event) => {
            on((e.target as HTMLInputElement).checked);
            apply();
          },
        }),
        label,
      ]);

    // Keep a ref to the binarize checkbox so the threshold slider can auto-enable it.
    const binarizeInput = el('input', {
      type: 'checkbox',
      ...(pp.thresholdEnabled ? { checked: 'checked' } : {}),
      onChange: (e: Event) => {
        pp.thresholdEnabled = (e.target as HTMLInputElement).checked;
        apply();
      },
    }) as HTMLInputElement;
    const binarizeRow = el('label', { class: 'checkbox' }, [binarizeInput, 'Binarize (threshold)']);

    const valueEl = el('span', { class: 'field__value' }, [String(pp.threshold)]);
    const thresholdRow = el('div', { class: 'field' }, [
      el('label', { class: 'field__label' }, ['Threshold', valueEl]),
      el('input', {
        type: 'range',
        min: '0',
        max: '255',
        step: '1',
        value: String(pp.threshold),
        'aria-label': 'Threshold',
        onInput: (e: Event) => {
          pp.threshold = Number((e.target as HTMLInputElement).value);
          valueEl.textContent = String(pp.threshold);
          // Adjusting the threshold implies you want to binarize — turn it on.
          if (!pp.thresholdEnabled) {
            pp.thresholdEnabled = true;
            binarizeInput.checked = true;
          }
          apply();
        },
      }),
      el('div', { class: 'field__help' }, ['Binarizes the image at this cutoff.']),
    ]);

    mount(this.sourcePreprocess, el('div', { class: 'field-group__title' }, ['Preprocess']), el('div', {}, [
      checkbox('Grayscale', pp.grayscale, (v) => (pp.grayscale = v)),
      binarizeRow,
      thresholdRow,
      checkbox('Invert', pp.invert, (v) => (pp.invert = v)),
    ]));
  }

  private renderControls(): void {
    const engine = getEngine(this.state.engineId);
    const list = renderEngineList(this.engines, this.state.engineId, (id) => {
      this.state.engineId = id;
      this.renderControls();
      if (this.state.mode === 'single') void this.run();
    });
    const params = engine
      ? renderParams(engine, this.paramsFor(engine.id), (key: string, value: ParamValue) => {
          this.paramsFor(this.state.engineId)[key] = value;
          this.scheduleRun();
        })
      : el('div');

    const body: HTMLElement[] = [list];
    if (this.state.mode === 'compare') {
      body.push(el('div', { class: 'banner banner--info' }, ['Compare runs every engine on the current image with these parameters.']));
    }
    body.push(params);
    mount(this.controlsBody, ...body);
    this.renderControlsFoot();
  }

  private renderControlsFoot(): void {
    const hasOutput = Boolean(this.state.outcome?.svg);
    const exportBtn = (label: string, ic: 'export' | 'copy', on: () => void, disabled: boolean) =>
      el('button', { class: 'btn btn--ghost btn__mono', type: 'button', ...(disabled ? { disabled: 'true' } : {}), onClick: on }, [icon(ic), label]);

    mount(
      this.controlsFoot,
      el('div', { class: 'overlay-toggles' }, [
        exportBtn('SVG', 'export', () => this.exportSvg(), !hasOutput),
        exportBtn('PNG', 'export', () => void this.exportPng(), !hasOutput),
        exportBtn('Copy SVG', 'copy', () => this.copySvg(), !hasOutput),
        exportBtn('Params', 'copy', () => this.copyParams(), false),
      ]),
    );
  }

  private renderOutputHead(): void {
    const right = el('div', { class: 'overlay-toggles' });
    if (this.state.busy) right.append(spinner());
    if (this.state.mode === 'single') {
      const toggle = (label: string, ic: 'nodes' | 'grid' | 'ghost', key: keyof Overlays) =>
        el('button', { class: 'toggle-btn', type: 'button', 'aria-pressed': String(this.state.overlays[key]), onClick: () => { this.state.overlays[key] = !this.state.overlays[key]; this.renderOutput(); } }, [icon(ic), label]);
      right.append(toggle('Nodes', 'nodes', 'nodes'), toggle('Grid', 'grid', 'grid'), toggle('Ghost', 'ghost', 'ghost'));
    }
    mount(this.outputHead, eyebrow('Output'), right);
  }

  private renderOutput(): void {
    this.renderOutputHead();

    if (!this.state.source) {
      mount(this.outputHost, this.emptyState());
      clear(this.outputFoot);
      return;
    }
    if (this.state.mode === 'compare') {
      this.renderCompare();
      clear(this.outputFoot);
      return;
    }

    const outcome = this.state.outcome;
    if (outcome?.error) {
      mount(this.outputHost, el('div', { class: 'banner banner--error' }, [outcome.error]));
      clear(this.outputFoot);
      return;
    }
    if (outcome?.svg && this.state.processed) {
      const stack = buildPreview(outcome.svg, this.state.processedURL, this.state.processed.width, this.state.processed.height, this.state.overlays);
      mount(this.outputHost, el('div', { class: 'preview preview--output' }, [stack]));
      this.renderMetrics(outcome);
    } else {
      mount(this.outputHost, el('div', { class: 'empty__hint', style: 'padding:2rem' }, ['Tracing…']));
      clear(this.outputFoot);
    }
  }

  private emptyState(): HTMLElement {
    const sampleBtn = (kind: SampleKind, label: string) =>
      el('button', { class: 'btn btn--ghost', type: 'button', onClick: () => { this.state.sampleIndex = SAMPLE_KINDS.indexOf(kind); this.useSample(); } }, [label]);
    return el('div', { class: 'empty' }, [
      el('div', { class: 'empty__art' }, [emptyArt()]),
      el('h2', { class: 'empty__title' }, ['Drop, paste, or load an image']),
      el('p', { class: 'empty__hint' }, ['Trace a raster image into vectors with deterministic algorithms, then compare them side by side. Paste from the clipboard with Ctrl/Cmd+V.']),
      el('div', { class: 'empty__actions' }, [
        el('button', { class: 'btn btn--raster', type: 'button', onClick: () => this.fileInput.click() }, [icon('upload'), 'Load image']),
        sampleBtn('logo', 'Logo sample'),
        sampleBtn('flat', 'Flat-color sample'),
        sampleBtn('line', 'Line sample'),
      ]),
    ]);
  }

  private renderMetrics(outcome: TraceOutcome): void {
    const m = outcome.metrics;
    const chip = (label: string, value: string, unit?: string) =>
      el('div', { class: 'metric' }, [
        el('div', { class: 'metric__label' }, [label]),
        el('div', { class: 'metric__value' }, [value, unit ? el('span', { class: 'metric__unit' }, [unit]) : null]),
      ]);
    mount(
      this.outputFoot,
      el('div', { class: 'metrics' }, [
        chip('Paths', fmtInt(m.pathCount)),
        chip('Nodes', fmtInt(m.nodeCount)),
        chip('Size', fmtBytes(m.byteSize)),
        chip('Time', m.durationMs.toFixed(1), 'ms'),
        chip('Colors', fmtInt(m.colorCount)),
        chip('SSIM', m.fidelity === undefined ? '—' : m.fidelity.toFixed(3)),
      ]),
    );
  }

  // ------------------------------------------------------------- compare
  private renderCompare(): void {
    const rows = this.state.compare;
    const grid = el(
      'div',
      { class: 'compare-grid' },
      rows.map((o) => this.compareCard(o)),
    );
    mount(this.outputHost, grid, this.compareTable(rows));
  }

  private compareCard(o: TraceOutcome): HTMLElement {
    const engine = getEngine(o.engineId);
    const head = el('div', { class: 'compare-card__head' }, [
      el('span', {}, [engine?.name ?? o.engineId]),
      el('span', { class: 'field__value' }, [o.error ? '—' : `${o.metrics.durationMs.toFixed(0)} ms`]),
    ]);
    const body = o.error
      ? el('div', { class: 'banner banner--error', style: 'margin:0;border-radius:0' }, [o.error])
      : el('div', { class: 'preview compare-card__preview' }, [
          this.state.processed ? buildPreview(o.svg, this.state.processedURL, this.state.processed.width, this.state.processed.height, { nodes: false, grid: false, ghost: false }) : '',
        ]);
    return el('div', { class: 'compare-card' }, [head, body]);
  }

  private compareTable(rows: TraceOutcome[]): HTMLElement {
    const frontier = computeFrontier(rows);
    const cols: { key: MetricKey; label: string }[] = [
      { key: 'pathCount', label: 'paths' },
      { key: 'nodeCount', label: 'nodes' },
      { key: 'byteSize', label: 'bytes' },
      { key: 'durationMs', label: 'ms' },
      { key: 'colorCount', label: 'colors' },
      { key: 'fidelity', label: 'SSIM' },
    ];

    const sorted = [...rows].filter((r) => !r.error).sort((a, b) => {
      const av = a.metrics[this.state.sortKey] ?? 0;
      const bv = b.metrics[this.state.sortKey] ?? 0;
      return this.state.sortDir === 'asc' ? av - bv : bv - av;
    });

    const head = el('thead', {}, [
      el('tr', {}, [
        el('th', {}, ['engine']),
        ...cols.map((c) =>
          el('th', { onClick: () => this.sortBy(c.key) }, [c.label + (this.state.sortKey === c.key ? (this.state.sortDir === 'asc' ? ' ↑' : ' ↓') : '')]),
        ),
      ]),
    ]);

    const body = el(
      'tbody',
      {},
      sorted.map((r) => {
        const engine = getEngine(r.engineId);
        const isFrontier = frontier.has(r.engineId);
        return el('tr', { class: isFrontier ? 'is-frontier' : '' }, [
          el('td', {}, [engine?.name ?? r.engineId]),
          el('td', {}, [fmtInt(r.metrics.pathCount)]),
          el('td', {}, [fmtInt(r.metrics.nodeCount)]),
          el('td', {}, [fmtInt(r.metrics.byteSize)]),
          el('td', {}, [r.metrics.durationMs.toFixed(1)]),
          el('td', {}, [fmtInt(r.metrics.colorCount)]),
          el('td', {}, [r.metrics.fidelity === undefined ? '—' : r.metrics.fidelity.toFixed(3)]),
        ]);
      }),
    );

    return el('table', { class: 'compare-table' }, [head, body]);
  }

  private sortBy(key: MetricKey): void {
    if (this.state.sortKey === key) this.state.sortDir = this.state.sortDir === 'asc' ? 'desc' : 'asc';
    else {
      this.state.sortKey = key;
      this.state.sortDir = 'asc';
    }
    this.renderCompare();
  }

  // -------------------------------------------------------------- export
  private currentSvg(): string | null {
    const o = this.state.outcome;
    if (!o?.svg || !this.state.processed) return null;
    return normalizeSvg(o.svg, this.state.processed.width, this.state.processed.height);
  }

  private exportSvg(): void {
    const svg = this.currentSvg();
    if (!svg) return;
    download(`trace-${this.state.engineId}.svg`, new Blob([svg], { type: 'image/svg+xml' }));
  }

  private async exportPng(): Promise<void> {
    const svg = this.currentSvg();
    const src = this.state.processed;
    if (!svg || !src) return;
    const data = await rasterizeSvg(svg, src.width, src.height);
    if (!data) return;
    const canvas = document.createElement('canvas');
    canvas.width = src.width;
    canvas.height = src.height;
    canvas.getContext('2d')?.putImageData(data, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) download(`trace-${this.state.engineId}.png`, blob);
    });
  }

  private copySvg(): void {
    const svg = this.currentSvg();
    if (svg) void copyText(svg);
  }

  private copyParams(): void {
    void copyText(JSON.stringify({ engine: this.state.engineId, params: this.paramsFor(this.state.engineId) }, null, 2));
  }

  // ----------------------------------------------------------------- DnD
  private attachPaste(): void {
    window.addEventListener('paste', (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            void this.loadFile(file);
            return;
          }
        }
      }
    });
  }

  private attachDnD(): void {
    const onOver = (e: DragEvent) => {
      e.preventDefault();
      this.root.querySelector('.dropzone')?.classList.add('is-dragover');
    };
    const onLeave = () => this.root.querySelector('.dropzone')?.classList.remove('is-dragover');
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      onLeave();
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) void this.loadFile(file);
    };
    this.root.addEventListener('dragover', onOver);
    this.root.addEventListener('dragleave', onLeave);
    this.root.addEventListener('drop', onDrop);
  }
}

// ----------------------------------------------------------------- helpers
function eyebrow(label: string): HTMLElement {
  return el('div', { class: 'panel__eyebrow' }, [el('span', { class: 'anchor-bullet' }), label]);
}

function spinner(): HTMLElement {
  return el('span', { class: 'spin', 'aria-label': 'Working' }, [brandMark(18)]);
}

function raf(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString();
}

function fmtBytes(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`;
}

/** Pareto frontier on (high fidelity, low node count) among successful traces. */
function computeFrontier(rows: TraceOutcome[]): Set<string> {
  const valid = rows.filter((r) => !r.error && r.metrics.fidelity !== undefined);
  const front = new Set<string>();
  for (const r of valid) {
    const dominated = valid.some(
      (o) =>
        o !== r &&
        (o.metrics.fidelity ?? 0) >= (r.metrics.fidelity ?? 0) &&
        o.metrics.nodeCount <= r.metrics.nodeCount &&
        ((o.metrics.fidelity ?? 0) > (r.metrics.fidelity ?? 0) || o.metrics.nodeCount < r.metrics.nodeCount),
    );
    if (!dominated) front.add(r.engineId);
  }
  return front;
}
