/**
 * The learner's own Anthropic key.
 *
 * srsly is free to run and free to use. The one thing that costs money is generating a
 * passage, so anyone who wants that connects their own key and pays Anthropic directly —
 * about a cent a passage. Everything else works without one: your own text, EPUB books,
 * audio, the whole SRS, every dictionary, blanks, popups, milestones.
 *
 * ## Where it lives, and what that costs
 *
 * Device-local, in its own localStorage entry rather than inside `srsly-prefs`. Two reasons,
 * both deliberate: prefs get exported, synced and logged as one blob in a way a credential
 * must never be, and a key belongs to the device it was typed on rather than to the account.
 *
 * localStorage is readable by any script running on the page, so this is only as safe as the
 * app is free of injected script. srsly loads no third-party JavaScript, which is what makes
 * it acceptable — but the honest advice, which the Settings UI gives, is to use a dedicated
 * key with a spend limit rather than a primary one.
 */

const KEY = 'srsly-anthropic-key';

/** Header name — must match USER_KEY_HEADER in lib/server/generator.ts. */
export const USER_KEY_HEADER = 'x-srsly-anthropic-key';

export function loadUserKey(): string {
  if (typeof localStorage === 'undefined') return '';
  try { return localStorage.getItem(KEY)?.trim() ?? ''; } catch { return ''; }
}

export function saveUserKey(key: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const v = key.trim();
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
  } catch { /* quota or disabled storage — the key simply is not remembered */ }
}

export function clearUserKey(): void {
  saveUserKey('');
}

export function hasUserKey(): boolean {
  return loadUserKey().length > 0;
}

/** Same shape test as the server's, so the UI can reject a bad paste before a round-trip. */
export function looksLikeAnthropicKey(k: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{16,}$/.test(k.trim());
}

/**
 * `sk-ant-…7f3a` — enough to tell two keys apart, not enough to use.
 *
 * Never render the whole key back to the screen. It is shoulder-surfable, it ends up in
 * screenshots and screen shares, and there is no reason to show something the learner already
 * has a copy of.
 */
export function maskKey(k: string): string {
  const v = k.trim();
  if (v.length < 12) return 'sk-ant-…';
  return `sk-ant-…${v.slice(-4)}`;
}

/**
 * Headers for a request that may spend AI credit.
 *
 * Returns the key header only when one is set, so a learner without a key sends nothing and
 * falls through to whatever the server is configured with (or to the no-key error, which
 * points them at the free reading paths).
 */
export function aiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = loadUserKey();
  return key ? { ...extra, [USER_KEY_HEADER]: key } : extra;
}
