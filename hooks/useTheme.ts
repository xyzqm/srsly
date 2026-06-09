'use client';
import { useState, useEffect, useCallback } from 'react';
import type { Theme, Font } from '@/lib/types';
import { storage } from '@/lib/storage';

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('paper');
  const [font, setFontState] = useState<Font>('editorial-warm');

  useEffect(() => {
    storage.getPrefs().then(p => {
      setThemeState(p.theme);
      setFontState(p.font);
      document.body.setAttribute('data-theme', p.theme);
      document.body.setAttribute('data-font', p.font);
    });
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    document.body.setAttribute('data-theme', t);
    storage.getPrefs().then(p => storage.savePrefs({ ...p, theme: t }));
  }, []);

  const setFont = useCallback((f: Font) => {
    setFontState(f);
    document.body.setAttribute('data-font', f);
    storage.getPrefs().then(p => storage.savePrefs({ ...p, font: f }));
  }, []);

  return { theme, font, setTheme, setFont };
}
