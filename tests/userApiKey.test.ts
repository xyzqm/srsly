import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * THE CLIENT HALF: what is stored, and what actually goes out on the wire.
 *
 * These are the assertions the browser cannot easily give back. A request's outgoing headers
 * are not readable from the page that sent them, so "does a learner on a Gemini key actually
 * tell the server so" is invisible to any amount of clicking — and it is exactly the kind of
 * wiring that is written once, looks right, and is never exercised until somebody's key goes
 * to the wrong company.
 *
 * `environment: 'node'`, so there is no localStorage; one is stubbed here rather than pulling
 * in jsdom for four functions. That also makes the QUOTA and DISABLED-STORAGE cases testable,
 * which a real browser makes very hard to reach on purpose.
 */

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    api: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, v); },
      removeItem: (k: string) => { map.delete(k); },
    },
  };
}

const ANTHROPIC = 'sk-ant-api03-' + 'A'.repeat(40);
const GEMINI = 'AIza' + 'B'.repeat(35);
const GROQ = 'gsk_' + 'C'.repeat(48);

let store: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  store = fakeStorage();
  vi.stubGlobal('localStorage', store.api);
});
afterEach(() => { vi.unstubAllGlobals(); });

/** Imported inside each test: the module reads `localStorage` at call time, not at import. */
async function mod() {
  return import('@/lib/userApiKey');
}

describe('a key and its provider are written and cleared together', () => {
  it('round-trips both', async () => {
    const { saveUserKey, loadUserKey, loadProvider } = await mod();
    saveUserKey(GEMINI, 'gemini');
    expect(loadUserKey()).toBe(GEMINI);
    expect(loadProvider()).toBe('gemini');
  });

  /**
   * A key filed under the wrong service is a credential sent to a company that was never meant
   * to see it, so there is deliberately no way to change one without the other — including by
   * clearing one and leaving the other behind.
   */
  it('leaves no orphaned provider when the key is removed', async () => {
    const { saveUserKey, clearUserKey, loadUserKey } = await mod();
    saveUserKey(GROQ, 'groq');
    clearUserKey();
    expect(loadUserKey()).toBe('');
    expect([...store.map.keys()]).toEqual([]);
  });

  it('trims what a paste brings with it', async () => {
    const { saveUserKey, loadUserKey } = await mod();
    saveUserKey(`  ${GROQ}\n`, 'groq');
    expect(loadUserKey()).toBe(GROQ);
  });

  it('survives storage that throws, rather than taking the page down with it', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('disabled'); },
      setItem: () => { throw new Error('quota'); },
      removeItem: () => { throw new Error('disabled'); },
    });
    const { saveUserKey, loadUserKey, loadProvider, hasUserKey } = await mod();
    expect(() => saveUserKey(GEMINI, 'gemini')).not.toThrow();
    expect(loadUserKey()).toBe('');
    expect(hasUserKey()).toBe(false);
    expect(loadProvider()).toBe('anthropic');
  });
});

describe('a key stored before the picker existed still works', () => {
  /**
   * THE MIGRATION, AND IT IS WHY THE STORAGE ENTRY KEPT ITS OLD NAME. Every key saved before
   * there was a choice is an Anthropic key under `srsly-anthropic-key` with no provider
   * recorded. Its shape resolves it, so nobody re-enters anything and nobody is quietly
   * signed out of generation by an upgrade.
   */
  it('resolves an unlabelled key by its shape', async () => {
    store.map.set('srsly-anthropic-key', ANTHROPIC);
    const { loadProvider, loadUserKey } = await mod();
    expect(loadUserKey()).toBe(ANTHROPIC);
    expect(loadProvider()).toBe('anthropic');
  });

  it('prefers the recorded choice over the shape', async () => {
    store.map.set('srsly-anthropic-key', GEMINI);
    store.map.set('srsly-ai-provider', 'gemini');
    expect((await mod()).loadProvider()).toBe('gemini');
  });

  /** A hand-edited or corrupted entry degrades rather than crashing a screen. */
  it('ignores a provider that is not one of ours', async () => {
    store.map.set('srsly-anthropic-key', GROQ);
    store.map.set('srsly-ai-provider', 'openai');
    expect((await mod()).loadProvider()).toBe('groq');
  });

  it('defaults when there is nothing at all', async () => {
    expect((await mod()).loadProvider()).toBe('anthropic');
  });
});

describe('what actually goes out on the wire', () => {
  it('sends nothing at all when no key is connected', async () => {
    const { aiHeaders } = await mod();
    expect(aiHeaders({ 'Content-Type': 'application/json' }))
      .toEqual({ 'Content-Type': 'application/json' });
  });

  /**
   * A provider header with no key would tell the server which service a request it cannot make
   * would have gone to — which is nothing — and would be sent by every learner who has never
   * opened Settings.
   */
  it('never sends a provider without a key', async () => {
    store.map.set('srsly-ai-provider', 'groq');
    const { aiHeaders, PROVIDER_HEADER } = await mod();
    expect(aiHeaders()[PROVIDER_HEADER]).toBeUndefined();
  });

  it('sends the key and the provider together', async () => {
    const { saveUserKey, aiHeaders, USER_KEY_HEADER, PROVIDER_HEADER } = await mod();
    saveUserKey(GEMINI, 'gemini');
    const h = aiHeaders({ 'Content-Type': 'application/json' });
    expect(h[USER_KEY_HEADER]).toBe(GEMINI);
    expect(h[PROVIDER_HEADER]).toBe('gemini');
    expect(h['Content-Type']).toBe('application/json');
  });

  /**
   * A header, never a query string. URLs are logged as a matter of course by proxies, CDNs and
   * the platform itself, and a logged credential is a leaked one.
   */
  it('uses lowercase header names that match the server constants', async () => {
    const { USER_KEY_HEADER, PROVIDER_HEADER } = await mod();
    const server = await import('@/lib/server/generator');
    expect(USER_KEY_HEADER).toBe(server.USER_KEY_HEADER);
    expect(PROVIDER_HEADER).toBe(server.PROVIDER_HEADER);
    expect(USER_KEY_HEADER).toBe(USER_KEY_HEADER.toLowerCase());
    expect(PROVIDER_HEADER).toBe(PROVIDER_HEADER.toLowerCase());
  });

  /**
   * THE HEADER NAME IS HISTORICAL AND MUST STAY THAT WAY. Every already-deployed client sends
   * it; renaming it would make every connected key invisible to the server the moment the two
   * halves were a version apart, with no error and nothing to see.
   */
  it('keeps the header and storage names that shipped', async () => {
    const { saveUserKey, USER_KEY_HEADER } = await mod();
    expect(USER_KEY_HEADER).toBe('x-srsly-anthropic-key');
    saveUserKey(ANTHROPIC, 'anthropic');
    expect(store.map.has('srsly-anthropic-key')).toBe(true);
  });
});

describe('the panel can reject a bad paste before a round trip', () => {
  it('accepts a key that matches the chosen provider', async () => {
    const { looksLikeProviderKey } = await mod();
    expect(looksLikeProviderKey('gemini', GEMINI)).toBe(true);
    expect(looksLikeProviderKey('groq', GROQ)).toBe(true);
    expect(looksLikeProviderKey('anthropic', ANTHROPIC)).toBe(true);
  });

  /** The new mistake the picker makes possible: the right key in the wrong field. */
  it('rejects the right key in the wrong field', async () => {
    const { looksLikeProviderKey } = await mod();
    expect(looksLikeProviderKey('gemini', ANTHROPIC)).toBe(false);
    expect(looksLikeProviderKey('anthropic', GROQ)).toBe(false);
  });

  it('masks with the chosen provider prefix and never returns the key', async () => {
    const { maskKey } = await mod();
    expect(maskKey(GEMINI, 'gemini')).toBe(`AIza…${GEMINI.slice(-4)}`);
    expect(maskKey(GEMINI, 'gemini')).not.toBe(GEMINI);
  });
});
