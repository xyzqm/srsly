import { storage } from './storage';
import type { UserPrefs } from './types';

/**
 * One field of `srsly-prefs`, read synchronously and written through to the cloud.
 *
 * ── THE SPLIT IS THE WHOLE POINT, AND IT WAS A BUG BEFORE IT WAS A MODULE ──
 * READ from localStorage synchronously, so a toggle paints correctly on the first frame rather
 * than flickering while a network round trip resolves. WRITE through `storage.savePrefs`, so
 * the value actually reaches the row.
 *
 * `lib/flashcardPrefs.ts` did the first half and not the second: it wrote straight to
 * localStorage and stopped, so the field never reached the cloud — and
 * `SupabaseStorage.getPrefs()` mirrors the cloud's prefs down over local WHOLESALE, which
 * `app/page.tsx` triggers on every language change. Toggle on, switch language, toggle off.
 * Invisible signed out, because LocalStorage reads back what it just wrote, which is why it
 * survived a fix and was only ever seen live.
 *
 * Extracted here the moment a SECOND caller wanted it, rather than copied.
 */
const KEY = 'srsly-prefs';

export function readPrefsBlob(): Record<string, unknown> {
  if (typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Write one field, locally now and to the cloud behind it.
 *
 * The cloud write is deliberately not awaited and its failure is swallowed: local is the truth
 * for this device, and a toggle that throws because the network is down would be a worse bug
 * than one that syncs late. `writeQueue` already retries a failed patch, and `mergePrefs`
 * applies only the fields that differ from this device's base — so pushing a toggle cannot
 * revert a level or a theme set on another device.
 */
export function writePrefsField(field: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  const prefs = readPrefsBlob();
  if (value === undefined) delete prefs[field];
  else prefs[field] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* quota — the cloud write below is still worth attempting */
  }
  /**
   * Cast rather than filled in. `UserPrefs` requires `theme` and `font`, and a fresh account
   * may genuinely lack them — but supplying defaults here would be a real bug: `mergePrefs`
   * applies every field that differs from this device's base, so injecting `theme: 'paper'`
   * would push it and revert a theme chosen elsewhere. What is on disk is the honest value.
   */
  void storage.savePrefs(prefs as unknown as UserPrefs).catch(() => {});
}
