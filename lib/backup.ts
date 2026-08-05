import type { DeckWord, UserPrefs } from './types';

/** A full srsly backup: the deck (with all scheduling state) plus preferences. */
export interface Backup {
  version: number;
  exportedAt: string;
  deck: DeckWord[];
  prefs?: UserPrefs;
}

/** Deck → CSV (hanzi, pinyin, meaning) — Anki/Pleco-friendly, re-importable. */
export function toCsv(deck: DeckWord[]): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const head = 'hanzi,pinyin,meaning';
  const rows = deck.map(w => [w.h, w.p, w.m].map(x => esc(String(x ?? ''))).join(','));
  return [head, ...rows].join('\n');
}

/** Trigger a client-side file download. */
export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Parse + validate a backup JSON string. Throws with a friendly message if invalid. */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('That file isn’t valid JSON.'); }
  const d = data as Partial<Backup>;
  if (!d || !Array.isArray(d.deck)) throw new Error('Not a srsly backup — no deck found.');
  for (const w of d.deck) {
    if (!w || typeof (w as DeckWord).h !== 'string') throw new Error('Backup contains an invalid word entry.');
  }
  return { version: d.version ?? 1, exportedAt: d.exportedAt ?? '', deck: d.deck, prefs: d.prefs };
}
