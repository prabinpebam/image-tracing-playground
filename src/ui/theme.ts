/** Theme manager: light / dark / system, persisted to localStorage. */

export type ThemeChoice = 'light' | 'dark' | 'system';

const KEY = 'itp-theme';
const mql = (): MediaQueryList => window.matchMedia('(prefers-color-scheme: dark)');

export function getThemeChoice(): ThemeChoice {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

/** Resolve `system` to the OS preference and set `data-theme` on <html>. */
export function applyTheme(choice: ThemeChoice = getThemeChoice()): void {
  const resolved = choice === 'system' ? (mql().matches ? 'dark' : 'light') : choice;
  document.documentElement.setAttribute('data-theme', resolved);
}

export function setThemeChoice(choice: ThemeChoice): void {
  localStorage.setItem(KEY, choice);
  applyTheme(choice);
}

/** Apply the stored theme and keep `system` in sync with OS changes. */
export function initTheme(): void {
  applyTheme();
  mql().addEventListener('change', () => {
    if (getThemeChoice() === 'system') applyTheme('system');
  });
}
