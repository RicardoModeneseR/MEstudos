import { create } from 'zustand';

export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'mestudos:theme';

function read(): ThemePref {
  try {
    return (localStorage.getItem(KEY) as ThemePref) || 'system';
  } catch {
    return 'system';
  }
}

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && !!media?.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const color = dark ? '#1d191c' : '#f5f1ea';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  document
    .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute('content', dark ? 'black-translucent' : 'default');
}

export const useTheme = create<{ pref: ThemePref; set: (p: ThemePref) => void }>((set) => ({
  pref: read(),
  set: (pref) => {
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      /* ignore */
    }
    apply(pref);
    set({ pref });
  },
}));

if (typeof window !== 'undefined') {
  apply(read());
  media?.addEventListener('change', () => apply(useTheme.getState().pref));
}
