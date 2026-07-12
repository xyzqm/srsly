import type { Theme } from '../types';
import { storage } from '../storage';

// Port of hooks/useTheme.ts (theme only — the PoC ships the six themes, one font).
export const THEMES: Theme[] = ['paper', 'ink', 'tea', 'slate', 'bone', 'dusk'];

class ThemeStore {
  theme = $state<Theme>('paper');

  async load() {
    const prefs = await storage.getPrefs();
    this.theme = prefs.theme ?? 'paper';
    this.apply();
  }

  private apply() {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', this.theme);
    }
  }

  async set(theme: Theme) {
    this.theme = theme;
    this.apply();
    const prefs = await storage.getPrefs();
    await storage.savePrefs({ ...prefs, theme });
  }
}

let store: ThemeStore | null = null;
export function getThemeStore(): ThemeStore {
  if (!store) store = new ThemeStore();
  return store;
}
