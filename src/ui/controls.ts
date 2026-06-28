/** Renders the engine picker and the auto-generated parameter controls. */

import type { ParamValue, ParamValues, TracerModule, TracerParam } from '../core/types';
import { el } from './dom';
import { dropdown } from './dropdown';

export function renderEngineList(
  engines: TracerModule[],
  selectedId: string,
  onSelect: (id: string) => void,
): HTMLElement {
  return el(
    'div',
    { class: 'engine-list', role: 'listbox', 'aria-label': 'Tracing engines' },
    engines.map((e) =>
      el(
        'button',
        {
          class: 'engine',
          role: 'option',
          type: 'button',
          'aria-pressed': String(e.id === selectedId),
          onClick: () => onSelect(e.id),
        },
        [
          el('span', { class: 'engine__cat' }, [e.category]),
          el('span', { class: 'engine__name' }, [e.name]),
          el('span', { class: 'engine__blurb' }, [e.blurb]),
          e.experimental ? el('span', { class: 'engine__status' }, ['experimental']) : null,
        ],
      ),
    ),
  );
}

export function renderParams(
  engine: TracerModule,
  values: ParamValues,
  onChange: (key: string, value: ParamValue) => void,
): HTMLElement {
  const wrap = el('div', { class: 'params' });
  const main = engine.params.filter((p) => !p.advanced);
  const advanced = engine.params.filter((p) => p.advanced);

  // group main params by their `group` (ungrouped first)
  const groups = new Map<string, TracerParam[]>();
  for (const p of main) {
    const key = p.group ?? '';
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }

  for (const [groupName, list] of groups) {
    if (groupName) wrap.append(el('div', { class: 'field-group__title' }, [groupName]));
    for (const p of list) wrap.append(field(p, values[p.key], onChange));
  }

  if (advanced.length) {
    const details = el('details', { class: 'advanced' });
    details.append(el('summary', { class: 'field-group__title' }, ['Advanced']));
    for (const p of advanced) details.append(field(p, values[p.key], onChange));
    wrap.append(details);
  }

  return wrap;
}

function field(
  p: TracerParam,
  value: ParamValue,
  onChange: (key: string, value: ParamValue) => void,
): HTMLElement {
  if (p.type === 'number') return numberField(p, Number(value), onChange);
  if (p.type === 'boolean') return booleanField(p, Boolean(value), onChange);
  return enumField(p, String(value), onChange);
}

function numberField(
  p: TracerParam,
  value: number,
  onChange: (key: string, value: ParamValue) => void,
): HTMLElement {
  const valueEl = el('span', { class: 'field__value' }, [String(value)]);
  const input = el('input', {
    type: 'range',
    min: String(p.min ?? 0),
    max: String(p.max ?? 100),
    step: String(p.step ?? 1),
    value: String(value),
    'aria-label': p.label,
    onInput: (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value);
      valueEl.textContent = String(v);
      onChange(p.key, v);
    },
  });
  return el('div', { class: 'field' }, [
    el('label', { class: 'field__label' }, [p.label, valueEl]),
    input,
    p.help ? el('div', { class: 'field__help' }, [p.help]) : null,
  ]);
}

function booleanField(
  p: TracerParam,
  value: boolean,
  onChange: (key: string, value: ParamValue) => void,
): HTMLElement {
  const input = el('input', {
    type: 'checkbox',
    ...(value ? { checked: 'checked' } : {}),
    onChange: (e: Event) => onChange(p.key, (e.target as HTMLInputElement).checked),
  });
  return el('div', { class: 'field' }, [
    el('label', { class: 'checkbox' }, [input, p.label]),
    p.help ? el('div', { class: 'field__help' }, [p.help]) : null,
  ]);
}

function enumField(
  p: TracerParam,
  value: string,
  onChange: (key: string, value: ParamValue) => void,
): HTMLElement {
  return el('div', { class: 'field' }, [
    el('label', { class: 'field__label' }, [p.label]),
    dropdown(p.options ?? [], value, (v) => onChange(p.key, v)),
    p.help ? el('div', { class: 'field__help' }, [p.help]) : null,
  ]);
}
