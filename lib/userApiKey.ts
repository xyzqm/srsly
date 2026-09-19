import {
  AI_PROVIDERS, DEFAULT_PROVIDER, looksLikeKeyFor, maskKeyFor, providerById,
  providerForKey, providerOrDefault, type ProviderId,
} from './aiProviders';

/**
 * The learner's own API key, and which service it belongs to.
 *
 * srsly is free to run and free to use. The one thing that costs anything is generating a
 * passage, so anyone who wants that connects their own key. With Anthropic they pay about a
 * cent a passage; with Google or Groq they pay nothing at all, because both have a real free
 * tier. Everything else works with no key whatsoever: your own text, EPUB books, audio, the
 * whole SRS, every dictionary, blanks, popups, milestones.
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
 * key with a spend limit rather than a primary one. That advice matters LESS on a free tier
 * and is still given, because a leaked key is someone else's rate limit to burn.
 *
 * ## THE STORAGE KEY IS STILL CALLED `srsly-anthropic-key`, AND IT MUST STAY THAT WAY
 *
 * It is historically named — it predates there being a choice. Renaming it to something
 * honest would silently log out every learner who has already connected a key, on every
 * device, with no error and no way to tell what happened: the app would simply go back to
 * saying "add a key in Settings" to someone who had. A stale name is a much smaller cost than
 * that, and this paragraph is the fix for the confusion it causes.
 *
 * ## The provider is a SECOND fact, not a second copy of the first
 *
 * `srsly-ai-provider` records which service the learner said the key is for. That is a choice
 * and it is authoritative; the key's SHAPE is only ever a fallback, used for a key stored
 * before the picker existed — those are all Anthropic, and `providerForKey` resolves them
 * without anybody having to re-enter anything.
 */

const KEY = 'srsly-anthropic-key';
const PROVIDER = 'srsly-ai-provider';

/** Header names — must match the server's in lib/server/generator.ts. */
export const USER_KEY_HEADER = 'x-srsly-anthropic-key';
export const PROVIDER_HEADER = 'x-srsly-ai-provider';

export { AI_PROVIDERS, DEFAULT_PROVIDER, type ProviderId };

export function loadUserKey(): string {
  if (typeof localStorage === 'undefined') return '';
  try { return localStorage.getItem(KEY)?.trim() ?? ''; } catch { return ''; }
}

/**
 * Which service the stored key is for.
 *
 * The recorded choice first; then the key's own shape, which is what migrates every key
 * stored before this setting existed; then the default. Never throws and never returns
 * something absent from `AI_PROVIDERS`, so a hand-edited or corrupted entry degrades to
 * Anthropic rather than to a crash on a screen the learner cannot get past.
 */
export function loadProvider(): ProviderId {
  if (typeof localStorage === 'undefined') return DEFAULT_PROVIDER;
  try {
    const stored = providerById(localStorage.getItem(PROVIDER));
    if (stored) return stored.id;
  } catch { /* fall through to the shape */ }
  return providerForKey(loadUserKey())?.id ?? DEFAULT_PROVIDER;
}

/**
 * Store a key and the provider it belongs to.
 *
 * They are written TOGETHER and cleared together. A key from one service filed under another
 * is a credential sent to a company that was never meant to see it — so there is deliberately
 * no way to change one without the other.
 */
export function saveUserKey(key: string, provider: ProviderId = DEFAULT_PROVIDER): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const v = key.trim();
    if (v) {
      localStorage.setItem(KEY, v);
      localStorage.setItem(PROVIDER, providerOrDefault(provider).id);
    } else {
      localStorage.removeItem(KEY);
      localStorage.removeItem(PROVIDER);
    }
  } catch { /* quota or disabled storage — the key simply is not remembered */ }
}

export function clearUserKey(): void {
  saveUserKey('');
}

export function hasUserKey(): boolean {
  return loadUserKey().length > 0;
}

/** Same shape test as the server's, so the UI can reject a bad paste before a round-trip. */
export function looksLikeProviderKey(provider: ProviderId, key: string): boolean {
  return looksLikeKeyFor(provider, key);
}

/**
 * `sk-ant-…7f3a` — enough to tell two keys apart, not enough to use.
 *
 * The provider is passed rather than read from storage so this stays pure, and so a panel can
 * mask a key the learner is in the middle of typing into a field for a provider they have not
 * saved yet.
 */
export function maskKey(key: string, provider: ProviderId = DEFAULT_PROVIDER): string {
  return maskKeyFor(provider, key);
}

/**
 * Headers for a request that may spend AI credit.
 *
 * The key travels on a HEADER, never in the body or the URL: URLs are logged as a matter of
 * course by proxies, CDNs and platforms, and a logged credential is a leaked one.
 *
 * The provider rides alongside it, and only when there is a key to describe. A provider
 * header with no key would tell the server which service a request it cannot make would have
 * gone to, which is nothing, and it would be sent by every learner who has never opened
 * Settings.
 */
export function aiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = loadUserKey();
  if (!key) return extra;
  return { ...extra, [USER_KEY_HEADER]: key, [PROVIDER_HEADER]: loadProvider() };
}
