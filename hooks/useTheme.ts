'use client';
import { useState, useEffect, useCallback } from 'react';
import type { Theme, Font, Texture, BlankStyle } from '@/lib/types';
import { storage } from '@/lib/storage';
import { safeAccent } from '@/lib/cosmetics';

/**
 * Theme, type, paper, blanks and a custom accent — everything that changes how the app LOOKS.
 *
 * **IT DOES NOT IMPORT lib/cosmetics.ts TO DECIDE WHETHER IT MAY APPLY SOMETHING**, and that
 * is the "never revoke what someone is wearing" half of the unlock rule, enforced by doing
 * nothing. Whatever prefs say gets applied. The gate lives in `ThemeSheet`, on CHOOSING — so a
 * milestone that lapses (mastery falls when cards lapse; a finished book can be deleted) can
 * never repaint somebody's app one morning because a card slipped below a month of stability.
 *
 * `safeAccent` is the one exception and is not a gate: it is a VALIDATOR. The accent is written
 * into an inline style and prefs SYNC, so a value arriving from another device or from a
 * hand-edited blob must be a literal hex colour before it goes anywhere near `style`.
 */

/** The accent, and the two tokens derived from it so a learner sets one colour and not three. */
function applyAccent(hex: string | null): void {
  const root = document.body;
  if (!hex) {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-deep');
    root.style.removeProperty('--accent-soft');
    return;
  }
  root.style.setProperty('--accent', hex);
  // DERIVED, not asked for. Three colour pickers is three ways to produce an unreadable
  // button; `color-mix` keeps the shadow and the tint in a fixed relationship to the one
  // colour the learner actually chose.
  root.style.setProperty('--accent-deep', `color-mix(in srgb, ${hex} 72%, black)`);
  root.style.setProperty('--accent-soft', `color-mix(in srgb, ${hex} 12%, transparent)`);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('paper');
  const [font, setFontState] = useState<Font>('editorial-warm');
  const [texture, setTextureState] = useState<Texture>('grain');
  const [blankStyle, setBlankStyleState] = useState<BlankStyle>('dotted');
  const [accentColor, setAccentColorState] = useState<string | null>(null);

  useEffect(() => {
    storage.getPrefs().then(p => {
      setThemeState(p.theme);
      setFontState(p.font);
      document.body.setAttribute('data-theme', p.theme);
      document.body.setAttribute('data-font', p.font);

      const tex = p.texture ?? 'grain';
      const blank = p.blankStyle ?? 'dotted';
      setTextureState(tex);
      setBlankStyleState(blank);
      document.body.setAttribute('data-texture', tex);
      document.body.setAttribute('data-blank', blank);

      const accent = safeAccent(p.accentColor);
      setAccentColorState(accent);
      applyAccent(accent);
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

  const setTexture = useCallback((t: Texture) => {
    setTextureState(t);
    document.body.setAttribute('data-texture', t);
    storage.getPrefs().then(p => storage.savePrefs({ ...p, texture: t }));
  }, []);

  const setBlankStyle = useCallback((b: BlankStyle) => {
    setBlankStyleState(b);
    document.body.setAttribute('data-blank', b);
    storage.getPrefs().then(p => storage.savePrefs({ ...p, blankStyle: b }));
  }, []);

  /**
   * Set or clear the custom accent. `null` puts the theme's own colour back.
   *
   * Applied immediately and saved after, so dragging a colour picker is live rather than
   * arriving a round trip later — the whole point of choosing a colour is watching it land.
   */
  const setAccentColor = useCallback((hex: string | null) => {
    const safe = safeAccent(hex);
    setAccentColorState(safe);
    applyAccent(safe);
    storage.getPrefs().then(p => storage.savePrefs({ ...p, accentColor: safe ?? undefined }));
  }, []);

  return {
    theme, font, texture, blankStyle, accentColor,
    setTheme, setFont, setTexture, setBlankStyle, setAccentColor,
  };
}
