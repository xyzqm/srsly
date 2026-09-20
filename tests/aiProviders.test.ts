import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  AI_PROVIDERS, DEFAULT_PROVIDER, looksLikeKeyFor, looksLikeAnyKey, maskKeyFor,
  providerById, providerForKey, providerOrDefault,
} from '@/lib/aiProviders';
import { generatorForProvider, GenerationError } from '@/lib/server/generator';

/**
 * THREE PROVIDERS, AND THE ONE THING THAT MUST NEVER HAPPEN.
 *
 * A key belongs to exactly one company. Sending an Anthropic key to Google — because a header
 * said so, because two shape patterns overlapped, because a picker defaulted wrong — hands a
 * live credential to somebody who was never meant to have it, and does it silently: the
 * request just fails with a 401 and the learner is told their key is bad. So the disjointness
 * of the key patterns is not a tidiness property, it is the safety property this whole feature
 * rests on, and it is asserted rather than assumed.
 *
 * The transport tests matter for a second reason: **the Gemini and Groq paths cannot be
 * verified against the live services here.** That needs real keys, which belong to the learner
 * and which this codebase deliberately never handles. What CAN be pinned without one is
 * everything up to the socket — the URL, the auth header, the request body, the token cap, and
 * how each failure status is turned into something a learner can act on. That is where the
 * bugs in an integration like this actually live.
 */

describe('the key patterns are disjoint, which is the safety property', () => {
  const samples: Record<string, string> = {
    anthropic: 'sk-ant-api03-' + 'A'.repeat(40),
    gemini: 'AIza' + 'B'.repeat(35),
    groq: 'gsk_' + 'C'.repeat(48),
  };

  /**
   * GOOGLE'S NEWER FORMAT, AND WHY IT GETS ITS OWN BLOCK.
   *
   * `AQ.…` keys are issued alongside the older `AIza…` ones. The `AQ.` arm of the pattern is
   * deliberately looser than the `AIza` arm, because the exact length and alphabet of that
   * format could not be verified here — so it is worth being explicit about which of the
   * shape check's two jobs that costs. The TYPO check is weakened: a malformed `AQ.` key now
   * reaches Google and returns a 401. The SECURITY property is not, and these assertions are
   * what hold it: a looser pattern is only dangerous if it can swallow another provider's key.
   */
  const NEW_GEMINI = 'AQ.Ab8RN6K' + 'x'.repeat(30);

  it('accepts both live Google formats as Gemini', () => {
    expect(providerForKey(samples.gemini)?.id).toBe('gemini');
    expect(providerForKey(NEW_GEMINI)?.id).toBe('gemini');
    expect(looksLikeKeyFor('gemini', NEW_GEMINI)).toBe(true);
  });

  /**
   * THE OLD FORMAT IS NOT DROPPED. Replacing the pattern rather than widening it would have
   * silently disconnected every learner already holding an `AIza` key — they would open
   * Settings to find a working key rejected as malformed, with nothing to explain it.
   */
  it('still accepts the older format, so nobody is disconnected by the change', () => {
    expect(looksLikeKeyFor('gemini', samples.gemini)).toBe(true);
  });

  it('lets the new format claim nothing but Gemini', () => {
    const claiming = AI_PROVIDERS.filter(p => p.keyPattern.test(NEW_GEMINI)).map(p => p.id);
    expect(claiming).toEqual(['gemini']);
  });

  /** The reverse direction: the widened pattern must not have started swallowing the others. */
  it('does not swallow an Anthropic or Groq key', () => {
    const gem = AI_PROVIDERS.find(p => p.id === 'gemini')!;
    expect(gem.keyPattern.test(samples.anthropic)).toBe(false);
    expect(gem.keyPattern.test(samples.groq)).toBe(false);
  });

  it('is still not a free pass for anything beginning AQ', () => {
    // The dot is part of the prefix, and there is still a length floor under it.
    for (const v of ['AQ', 'AQ.', 'AQ.short', 'AQx' + 'y'.repeat(40)]) {
      expect(looksLikeKeyFor('gemini', v), v).toBe(false);
    }
  });

  it('has a sample for every provider — the control', () => {
    expect(Object.keys(samples).sort()).toEqual(AI_PROVIDERS.map(p => p.id).sort());
  });

  it('never lets two providers claim one key', () => {
    for (const [id, key] of Object.entries(samples)) {
      const claiming = AI_PROVIDERS.filter(p => p.keyPattern.test(key)).map(p => p.id);
      expect(claiming, `${id} sample is claimed by ${claiming.join(' and ')}`).toEqual([id]);
    }
  });

  it('resolves each sample to its own provider', () => {
    for (const [id, key] of Object.entries(samples)) {
      expect(providerForKey(key)?.id).toBe(id);
    }
  });

  it('refuses to guess at junk', () => {
    for (const v of ['', '   ', 'hunter2', 'sk-ant-', 'AIza', 'gsk_', 'Bearer sk-ant-xxxx',
                     null, undefined]) {
      expect(providerForKey(v as string)).toBeUndefined();
      expect(looksLikeAnyKey(v as string)).toBe(false);
    }
  });

  it('accepts surrounding whitespace, which is what a paste carries', () => {
    expect(providerForKey(`  ${samples.gemini}  `)?.id).toBe('gemini');
  });

  it('rejects a key in the wrong provider field', () => {
    expect(looksLikeKeyFor('gemini', samples.anthropic)).toBe(false);
    expect(looksLikeKeyFor('groq', samples.gemini)).toBe(false);
    expect(looksLikeKeyFor('anthropic', samples.groq)).toBe(false);
  });
});

describe('the table is internally consistent', () => {
  it('gives every provider a distinct id and a name', () => {
    expect(new Set(AI_PROVIDERS.map(p => p.id)).size).toBe(AI_PROVIDERS.length);
    for (const p of AI_PROVIDERS) expect(p.name.length).toBeGreaterThan(0);
  });

  it('names a model and a cap for each', () => {
    for (const p of AI_PROVIDERS) {
      expect(p.model, p.id).toMatch(/\S/);
      expect(p.maxOutputTokens, p.id).toBeGreaterThan(0);
    }
  });

  /**
   * ENOUGH FOR A PASSAGE, WHICH IS NOT THE SAME AS THE 16,000 THE ROUTE ASKS FOR.
   *
   * This required 16,000 — the route's ceiling — which was over-strict and written without
   * measuring: it would have rejected `gemini-2.0-flash` at its real 8,192 limit even though
   * that is several times what any passage uses. For es/fr/ja the model writes plain prose and
   * for zh pipe-segmented text, so a title, its sentences, the fill items and a conversation
   * land in the low thousands even at C2.
   *
   * The floor still matters: a provider capping below what the prompt needs returns TRUNCATED
   * JSON, which surfaces as "the reply could not be read" rather than as "too long". 8,000 is
   * generous headroom over the real need and honest about the ceiling being a bound.
   */
  it('can each produce a whole passage', () => {
    for (const p of AI_PROVIDERS) expect(p.maxOutputTokens, p.id).toBeGreaterThanOrEqual(8000);
  });

  it('gives the OpenAI-compatible ones a base URL and Anthropic none', () => {
    for (const p of AI_PROVIDERS) {
      if (p.id === 'anthropic') expect(p.baseUrl).toBeUndefined();
      else expect(p.baseUrl, p.id).toMatch(/^https:\/\//);
    }
  });

  /** A key page nobody can reach is a provider nobody can use. */
  it('says where to get a key, over https', () => {
    for (const p of AI_PROVIDERS) {
      expect(p.consoleUrl, p.id).toMatch(/^https:\/\//);
      expect(p.consoleLabel.length, p.id).toBeGreaterThan(0);
    }
  });

  it('defaults to a provider that exists', () => {
    expect(providerById(DEFAULT_PROVIDER)).toBeDefined();
  });

  /** At least one free option, or the feature this was built for does not exist. */
  it('offers something free', () => {
    expect(AI_PROVIDERS.filter(p => p.freeTier).length).toBeGreaterThan(0);
  });

  it('falls back rather than throwing on an unknown id', () => {
    expect(providerOrDefault('nonsense').id).toBe(DEFAULT_PROVIDER);
    expect(providerOrDefault(null).id).toBe(DEFAULT_PROVIDER);
  });
});

describe('a masked key is unusable and still tells two keys apart', () => {
  it('keeps only the provider prefix and the last four', () => {
    const key = 'sk-ant-api03-' + 'A'.repeat(36) + '7f3a';
    const masked = maskKeyFor('anthropic', key);
    expect(masked).toBe('sk-ant-…7f3a');
    expect(masked).not.toContain('A'.repeat(8));
  });

  it('never returns the key itself, for any provider, prefix or length', () => {
    for (const p of AI_PROVIDERS) {
      for (const prefix of p.keyPrefixes) {
        for (const key of [prefix + 'x'.repeat(40), prefix, 'short']) {
          expect(maskKeyFor(p.id, key)).not.toBe(key);
        }
      }
    }
  });

  /**
   * THE PREFIX COMES FROM THE KEY, NOT THE TABLE.
   *
   * With one hardcoded prefix per provider, a Google key beginning `AQ.` masked as
   * `AIza…7f3a` — a display prefix the key does not have. That is worse than no mask: its
   * entire job is letting someone tell two of their own keys apart, and one that lies about
   * the opening characters cannot do it.
   */
  it('masks each Google format with its own prefix', () => {
    expect(maskKeyFor('gemini', 'AIza' + 'B'.repeat(31) + 'cd12')).toBe('AIza…cd12');
    expect(maskKeyFor('gemini', 'AQ.' + 'B'.repeat(28) + 'ef34')).toBe('AQ.…ef34');
  });

  it('falls back to the commonest prefix for a key matching none', () => {
    const p = AI_PROVIDERS.find(x => x.id === 'gemini')!;
    expect(maskKeyFor('gemini', 'something-else-entirely-abcd')).toBe(`${p.keyPrefixes[0]}…abcd`);
  });

  it('degrades to a bare prefix rather than leaking a short key whole', () => {
    expect(maskKeyFor('groq', 'gsk_abc')).toBe('gsk_…');
  });
});

// ── The transport, which cannot be exercised against the live services ───────

const KEYS = {
  anthropic: 'sk-ant-api03-' + 'A'.repeat(40),
  gemini: 'AIza' + 'B'.repeat(35),
  groq: 'gsk_' + 'C'.repeat(48),
} as const;

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

const ok = (content: string) => ({ choices: [{ message: { content } }] });

afterEach(() => { vi.unstubAllGlobals(); });

describe('the OpenAI-compatible call is shaped the way Google and Groq expect', () => {
  it('posts to the provider chat-completions URL with a bearer key', async () => {
    const fn = mockFetch(200, ok('hello'));
    await generatorForProvider('gemini', KEYS.gemini, false).complete('sys', 'user');

    const [url, init] = fn.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${KEYS.gemini}`);
  });

  /** A key in a URL is logged by every hop between here and the provider. */
  it('never puts the key in the URL', async () => {
    const fn = mockFetch(200, ok('hello'));
    await generatorForProvider('groq', KEYS.groq, false).complete('sys', 'user');
    expect(String(fn.mock.calls[0][0])).not.toContain(KEYS.groq);
  });

  it('sends the system prompt as a system MESSAGE, which is the shape difference', async () => {
    const fn = mockFetch(200, ok('hello'));
    await generatorForProvider('groq', KEYS.groq, false).complete('be terse', 'write a passage');
    const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.messages).toEqual([
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'write a passage' },
    ]);
  });

  /**
   * ASKING FOR JSON IN WORDS IS NOT THE SAME AS REQUIRING IT.
   *
   * Every caller in this app wants JSON, and the only thing saying so was a system prompt —
   * which Haiku honours and a smaller model treats as a suggestion. A learner on a working
   * Gemini key hit exactly that: the request succeeded, nothing threw, and the reply could not
   * be turned into a passage. `response_format` makes the provider guarantee it.
   */
  it('requires JSON of the provider when a route asks for it', async () => {
    const fn = mockFetch(200, ok('{}'));
    await generatorForProvider('gemini', KEYS.gemini, false).complete('s', 'p', { json: true });
    const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  /** Opt-in: `complete()` is general, and a future caller wanting prose must not have to opt out. */
  it('does not ask for JSON when a route has not said so', async () => {
    const fn = mockFetch(200, ok('hello'));
    await generatorForProvider('groq', KEYS.groq, false).complete('s', 'p');
    const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string);
    expect(body).not.toHaveProperty('response_format');
  });

  /**
   * A PROVIDER THAT REJECTS JSON MODE MUST NOT LOSE EVERY GENERATION.
   *
   * `response_format` is part of the OpenAI shape, but "implements the shape" is not "accepts
   * every field of it", and that is not verifiable from here. Without the retry, a provider
   * rejecting the field fails EVERY request — strictly worse than the unreliable JSON it was
   * added to fix.
   */
  it('retries once without JSON mode when the provider names that parameter', async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce({
        ok: false, status: 400,
        clone: () => ({ text: async () => JSON.stringify({ error: { message: 'Unknown name "response_format"' } }) }),
        text: async () => '', json: async () => ({}),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200, json: async () => ok('{"ok":1}'), text: async () => '',
        clone: () => ({ text: async () => '' }),
      });
    vi.stubGlobal('fetch', fn);

    const out = await generatorForProvider('gemini', KEYS.gemini, false)
      .complete('s', 'p', { json: true });

    expect(out).toBe('{"ok":1}');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string))
      .toHaveProperty('response_format');
    expect(JSON.parse((fn.mock.calls[1][1] as RequestInit).body as string))
      .not.toHaveProperty('response_format');
  });

  /** Narrow: any other 400 is reported as itself rather than blamed on the parameter. */
  it('does not retry a 400 that says nothing about JSON mode', async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: false, status: 400,
      clone: () => ({ text: async () => JSON.stringify({ error: { message: 'malformed request' } }) }),
      text: async () => JSON.stringify({ error: { message: 'malformed request' } }),
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fn);

    const g = generatorForProvider('gemini', KEYS.gemini, false);
    await expect(g.complete('s', 'p', { json: true })).rejects.toMatchObject({ kind: 'server' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  /** A blank system turn is still a turn, and some models answer it. */
  it('omits an empty system message rather than sending a blank one', async () => {
    const fn = mockFetch(200, ok('hello'));
    await generatorForProvider('groq', KEYS.groq, false).complete('', 'just this');
    const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.messages).toEqual([{ role: 'user', content: 'just this' }]);
  });

  it('returns the assistant text, trimmed', async () => {
    mockFetch(200, ok('  a passage  '));
    const out = await generatorForProvider('gemini', KEYS.gemini, false).complete('s', 'p');
    expect(out).toBe('a passage');
  });

  /**
   * THIS TEST ASSERTED THE OPPOSITE, AND THE OLD BEHAVIOUR WAS THE BUG.
   *
   * It read "answers empty rather than throwing on a reply it cannot read", on the reasoning
   * that the route turns an empty string into a 502 anyway. It does — but not with anything
   * anyone can act on: `''` goes to a JSON parser, and the learner is told the model is not
   * following the format srsly asks for, which is a sentence about a reply that was never
   * sent. Returning a value meaning "nothing came back" as a value meaning "it came back
   * empty" is the mistake CLAUDE.md names four times over.
   *
   * Kept and inverted rather than deleted, so the change of mind is visible.
   */
  it('throws rather than answering empty on a reply it cannot read', async () => {
    mockFetch(200, { unexpected: true });
    await expect(generatorForProvider('groq', KEYS.groq, false).complete('s', 'p'))
      .rejects.toMatchObject({ kind: 'server', provider: 'groq' });
  });
});

describe('a stale model id is fixable without a deploy', () => {
  /**
   * A PINNED MODEL GOING STALE IS A TOTAL OUTAGE. `gemini-2.5-flash` was pinned and a
   * learner's perfectly good key came back "model not found" — every generation failed, and
   * the error said it was "not something you can fix", which was only true because there was
   * no way to fix it short of editing a source file and redeploying.
   */
  it('asks for the pinned model by default', async () => {
    const fn = mockFetch(200, ok('x'));
    await generatorForProvider('gemini', KEYS.gemini, false).complete('s', 'p');
    const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe(providerOrDefault('gemini').model);
  });

  it('prefers SRSLY_MODEL_<PROVIDER> when it is set', async () => {
    vi.stubEnv('SRSLY_MODEL_GEMINI', 'gemini-something-newer');
    const fn = mockFetch(200, ok('x'));
    await generatorForProvider('gemini', KEYS.gemini, false).complete('s', 'p');
    const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toBe('gemini-something-newer');
    vi.unstubAllEnvs();
  });

  it('ignores an empty or blank override rather than asking for ""', async () => {
    for (const blank of ['', '   ']) {
      vi.stubEnv('SRSLY_MODEL_GEMINI', blank);
      const fn = mockFetch(200, ok('x'));
      await generatorForProvider('gemini', KEYS.gemini, false).complete('s', 'p');
      const body = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string);
      expect(body.model, JSON.stringify(blank)).toBe(providerOrDefault('gemini').model);
      vi.unstubAllEnvs();
    }
  });

  /** The override has to reach the message too, or it names a model nobody asked for. */
  it('names the model actually requested when it is missing', async () => {
    vi.stubEnv('SRSLY_MODEL_GEMINI', 'gemini-typo-here');
    mockFetch(404, { error: { message: 'not found' } });
    const g = generatorForProvider('gemini', KEYS.gemini, false);
    await expect(g.complete('s', 'p')).rejects.toThrow(/gemini-typo-here/);
    vi.unstubAllEnvs();
  });
});

describe('the token cap is honoured and clamped', () => {
  it("passes a route's own cap through", async () => {
    const fn = mockFetch(200, ok('x'));
    await generatorForProvider('groq', KEYS.groq, false).complete('s', 'p', { maxTokens: 300 });
    expect(JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string).max_tokens).toBe(300);
  });

  it('defaults to a whole passage when a route says nothing', async () => {
    const fn = mockFetch(200, ok('x'));
    await generatorForProvider('groq', KEYS.groq, false).complete('s', 'p');
    expect(JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string).max_tokens).toBe(16000);
  });

  /**
   * Asking for more than the model will produce is an error on some gateways and a silent
   * truncation on others. Clamping makes it neither.
   */
  it('never asks for more than the model can produce', async () => {
    const fn = mockFetch(200, ok('x'));
    await generatorForProvider('gemini', KEYS.gemini, false).complete('s', 'p', { maxTokens: 999_999 });
    const asked = JSON.parse((fn.mock.calls[0][1] as RequestInit).body as string).max_tokens;
    expect(asked).toBe(providerOrDefault('gemini').maxOutputTokens);
  });
});

describe('a failure says which of the four things went wrong', () => {
  /**
   * A rejected key, a retired model and a spent rate limit need three different actions from
   * the learner — replace the key, report it, wait. One "generation failed" sends all three to
   * the same dead end, and on a FREE TIER the rate limit is the normal way the free option
   * stops working for the afternoon rather than an edge case.
   */
  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'rate_limit'],
    [404, 'model'],
    [500, 'server'],
    [503, 'server'],
  ])('turns %i into a %s error', async (status, kind) => {
    mockFetch(status, { error: { message: 'nope' } });
    const g = generatorForProvider('gemini', KEYS.gemini, false);
    await expect(g.complete('s', 'p')).rejects.toMatchObject({ kind, provider: 'gemini' });
  });

  it('reads a 400 that names the model as a model problem', async () => {
    mockFetch(400, { error: { message: 'model gemini-x is not found' } });
    const g = generatorForProvider('gemini', KEYS.gemini, false);
    await expect(g.complete('s', 'p')).rejects.toMatchObject({ kind: 'model' });
  });

  /**
   * GOOGLE ANSWERS A REJECTED KEY WITH 400, NOT 401, AND THESE TWO BODIES ARE VERBATIM FROM
   * THE LIVE ENDPOINT — a bad `AIza…` key and a bad `AQ.…` key respectively.
   *
   * Reading the status alone filed both under "server" and told the learner to try again in a
   * moment, which can never work: their key is wrong and retrying will not change that. It is
   * the one failure on this list they can actually fix, reported as the one they cannot.
   */
  it.each([
    ['Please pass a valid API key'],
    ['Invalid Auth key.'],
  ])('reads Google\'s 400 "%s" as a key problem', async message => {
    mockFetch(400, { error: { code: 400, message, status: 'INVALID_ARGUMENT' } });
    const g = generatorForProvider('gemini', KEYS.gemini, false);
    await expect(g.complete('s', 'p')).rejects.toMatchObject({ kind: 'auth' });
  });

  it('tells the learner to check the key rather than to wait', async () => {
    mockFetch(400, { error: { message: 'Invalid Auth key.' } });
    const g = generatorForProvider('gemini', KEYS.gemini, false);
    await g.complete('s', 'p').then(
      () => { throw new Error('should have rejected'); },
      (e: GenerationError) => {
        expect(e.message).toMatch(/rejected the key/i);
        expect(e.message).not.toMatch(/try again/i);
      },
    );
  });

  /** Auth is judged first: a bad key never gets far enough to be judged against a model name. */
  it('calls a 400 naming both a key and a model an auth problem', async () => {
    mockFetch(400, { error: { message: 'API key not valid for model gemini-2.5-flash' } });
    const g = generatorForProvider('gemini', KEYS.gemini, false);
    await expect(g.complete('s', 'p')).rejects.toMatchObject({ kind: 'auth' });
  });

  it('treats an unexplained 400 as the server\'s problem, not the key\'s', async () => {
    mockFetch(400, { error: { message: 'malformed request' } });
    const g = generatorForProvider('groq', KEYS.groq, false);
    await expect(g.complete('s', 'p')).rejects.toMatchObject({ kind: 'server' });
  });

  it('does not blame the key when the request never arrived', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const g = generatorForProvider('groq', KEYS.groq, false);
    await expect(g.complete('s', 'p')).rejects.toMatchObject({ kind: 'server' });
  });

  /**
   * ── THE FOURTH FAILURE, WHICH THE PROVIDER DOES NOT REPORT AS ONE ──────────
   *
   * A reply cut off at the model's output cap comes back 200 OK with a `finish_reason` of
   * `length` and a body that is valid as far as it goes. Every other failure here announces
   * itself with a status code; this one announces itself in a field that was being dropped.
   *
   * It matters because the callers all ask for JSON, so a truncated reply is an unterminated
   * object — which reaches `extractJson` as a syntax error and is reported to the learner as
   * "the model is not following the format srsly asks for". That is the wrong cause, and it
   * points at the one thing the learner cannot check while the actual fix is a number in
   * `lib/aiProviders.ts` or a bigger model in the environment.
   */
  it('calls a reply cut off at the token cap truncated, not malformed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => '', clone: () => ({ text: async () => '' }),
      json: async () => ({
        choices: [{ message: { content: '{"passages": [{"title": "A' }, finish_reason: 'length' }],
        usage: { completion_tokens: 8192 },
      }),
    }));
    const g = generatorForProvider('gemini', KEYS.gemini, false);
    await expect(g.complete('s', 'p', { json: true })).rejects.toMatchObject({
      kind: 'truncated', provider: 'gemini',
    });
  });

  /** It names the action that fixes it, which is a bigger model — never the key. */
  it('points a truncation at the output limit rather than at Settings', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => '', clone: () => ({ text: async () => '' }),
      json: async () => ({ choices: [{ message: { content: 'cut' }, finish_reason: 'length' }] }),
    }));
    await generatorForProvider('gemini', KEYS.gemini, false).complete('s', 'p').then(
      () => { throw new Error('should have rejected'); },
      (e: GenerationError) => {
        expect(e.message).toMatch(/SRSLY_MODEL_GEMINI/);
        expect(e.message).toMatch(String(providerOrDefault('gemini').maxOutputTokens));
        expect(e.message).not.toMatch(/key/i);
      },
    );
  });

  /**
   * CONTROL: a reply that finishes normally is returned, whatever else is on the choice.
   * Without this, "throw when finish_reason is set" would pass the test above and break
   * every successful generation in the app.
   */
  it('returns a reply that stopped because it was finished', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => '', clone: () => ({ text: async () => '' }),
      json: async () => ({ choices: [{ message: { content: '{"ok":1}' }, finish_reason: 'stop' }] }),
    }));
    await expect(generatorForProvider('gemini', KEYS.gemini, false).complete('s', 'p'))
      .resolves.toBe('{"ok":1}');
  });

  /**
   * NOTHING CAME BACK IS NOT THE SAME AS AN EMPTY PASSAGE.
   *
   * Google answers a safety-filtered request with a choice carrying no content at all, rather
   * than with an error status. This returned `''`, which every caller handed to a JSON parser
   * — so the learner was shown a syntax error about position 0 and the server logged nothing
   * that named the cause. Same family as the loading state rendered as an answer.
   */
  it.each([
    ['no content field', { choices: [{ message: {}, finish_reason: 'content_filter' }] }],
    ['no choices at all', { choices: [] }],
    ['whitespace only', { choices: [{ message: { content: '   ' }, finish_reason: 'stop' }] }],
  ])('treats a reply with %s as a failure rather than as empty output', async (_label, body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => '', clone: () => ({ text: async () => '' }),
      json: async () => body,
    }));
    await expect(generatorForProvider('gemini', KEYS.gemini, false).complete('s', 'p'))
      .rejects.toMatchObject({ kind: 'server', provider: 'gemini' });
  });

  /** A finish reason is an enum from a third party, so it is shape-checked before it is shown. */
  it('never echoes a free-text finish reason into the message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => '', clone: () => ({ text: async () => '' }),
      json: async () => ({ choices: [{ message: { content: '' }, finish_reason: '<script>alert(1)</script>' }] }),
    }));
    await generatorForProvider('gemini', KEYS.gemini, false).complete('s', 'p').then(
      () => { throw new Error('should have rejected'); },
      (e: GenerationError) => { expect(e.message).not.toMatch(/script/i); },
    );
  });

  /**
   * THE MESSAGE REACHES A SCREEN AND A LOG. A provider's own error body can echo the request
   * back, so none of it is copied into what is thrown.
   */
  it('never puts the key in the error, whatever the provider said', async () => {
    mockFetch(401, { error: { message: `key ${KEYS.groq} is invalid` } });
    const g = generatorForProvider('groq', KEYS.groq, false);
    await g.complete('s', 'p').then(
      () => { throw new Error('should have rejected'); },
      (e: GenerationError) => {
        expect(e.message).not.toContain(KEYS.groq);
        expect(e.message).not.toContain('gsk_C');
      },
    );
  });

  it('names the provider, so the learner knows whose key to fix', async () => {
    mockFetch(401, {});
    const g = generatorForProvider('gemini', KEYS.gemini, false);
    await expect(g.complete('s', 'p')).rejects.toThrow(/Google Gemini/);
  });
});

describe('who pays survives the second transport', () => {
  /**
   * `operatorPays` is about WHOSE KEY, never about which provider. A free-tier key is still
   * the learner's own key, and metering it would ration somebody on a budget that costs
   * nobody anything.
   */
  it('is carried across for every provider, both ways', () => {
    for (const p of AI_PROVIDERS) {
      expect(generatorForProvider(p.id, KEYS[p.id], false).operatorPays).toBe(false);
      expect(generatorForProvider(p.id, KEYS[p.id], true).operatorPays).toBe(true);
    }
  });

  it('reports the provider it will actually reach', () => {
    for (const p of AI_PROVIDERS) {
      expect(generatorForProvider(p.id, KEYS[p.id], false).provider).toBe(p.id);
    }
  });

  /** The name is the only thing that reaches a log line. */
  it('never puts the key in its own name', () => {
    for (const p of AI_PROVIDERS) {
      const g = generatorForProvider(p.id, KEYS[p.id], false);
      expect(g.name).not.toContain(KEYS[p.id]);
      for (const prefix of p.keyPrefixes) expect(g.name).not.toContain(prefix);
    }
  });
});
