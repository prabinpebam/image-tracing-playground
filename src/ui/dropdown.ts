/** Custom dropdown (replaces native <select>): themeable, keyboard-accessible. */

import type { ParamOption } from '../core/types';
import { el } from './dom';
import { icon } from './icons';

export function dropdown(
  options: ParamOption[],
  value: string,
  onChange: (value: string) => void,
): HTMLElement {
  const current = options.find((o) => o.value === value) ?? options[0];
  const label = el('span', { class: 'dropdown__label' }, [current?.label ?? '']);
  const btn = el('button', {
    type: 'button',
    class: 'dropdown__btn',
    'aria-haspopup': 'listbox',
    'aria-expanded': 'false',
  }, [label, icon('chevron')]);
  const list = el('div', { class: 'dropdown__list', role: 'listbox' });
  const root = el('div', { class: 'dropdown' }, [btn, list]);

  let selected = value;
  let open = false;

  const onDocClick = (e: MouseEvent): void => {
    if (!root.contains(e.target as Node)) close();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      close();
      btn.focus();
    }
  };

  function setOpen(next: boolean): void {
    open = next;
    btn.setAttribute('aria-expanded', String(open));
    if (open) {
      root.setAttribute('data-open', 'true');
      document.addEventListener('click', onDocClick, true);
      document.addEventListener('keydown', onKey);
    } else {
      root.removeAttribute('data-open');
      document.removeEventListener('click', onDocClick, true);
      document.removeEventListener('keydown', onKey);
    }
  }
  function close(): void {
    if (open) setOpen(false);
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!open);
  });

  for (const o of options) {
    const opt = el('button', {
      type: 'button',
      class: 'dropdown__opt',
      role: 'option',
      'aria-selected': String(o.value === selected),
    }, [o.label]);
    opt.dataset.value = o.value;
    opt.addEventListener('click', () => {
      selected = o.value;
      label.textContent = o.label;
      for (const c of Array.from(list.children)) {
        c.setAttribute('aria-selected', String((c as HTMLElement).dataset.value === selected));
      }
      close();
      btn.focus();
      onChange(o.value);
    });
    list.append(opt);
  }

  return root;
}
