import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateJson, extractJson, repairJson } from '@/lib/server/generateJson';
import { GenerationError } from '@/lib/server/generator';
import type { Generator } from '@/lib/server/generator';

/**
 * THE RETRY RULES, WHICH WERE PROSE UNTIL THIS FILE EXISTED.
 *
 * This loop lived inside `app/api/daily-content/route.ts`, which a test cannot import, so
 * every claim about it was pinned by grepping the route's own source for an identifier. That
 * catches a deletion and nothing else — it cannot tell whether the error that comes out is the
 * right one, whether a 429 is retried, or whether a cheap failure is being rationed by an
 * expensive budget. All three were wrong at some point and none of them failed anything.
 *
 * The bug that forced this: Google answered 503 twice, the loop swallowed both errors and
 * returned nulls, and the route — with nothing left to report — told the learner their model
 * was not following the format srsly asks for. Key fine, model fine, prompt fine.
 */

/** A generator whose replies are scripted. A string is returned; an Error is thrown. */
function fakeGenerator(script: (string | Error)[]): Generator & { calls: number } {
  const g = {
    name: 'gemini:test-model (user key)',
    operatorPays: false,
    provider: 'gemini' as const,
    calls: 0,
    async complete() {
      const next = script[g.calls] ?? script[script.length - 1];
      g.calls++;
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return g;
}

const busy = () => new GenerationError('server', 'gemini', 'Google Gemini is busy right now');
const badKey = () => new GenerationError('auth', 'gemini', 'Google Gemini rejected the key.');
const rateLimited = () => new GenerationError('rate_limit', 'gemini', "That's the free tier for now.");

const hasPassages = (j: Record<string, unknown>) => Array.isArray(j.passages) && j.passages.length > 0;
const PASSAGE = '{"passages":[{"title":"Un día"}]}';

/** Instant, so a test never actually waits out a backoff. */
const noPause = async () => {};

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe('a usable reply ends it', () => {
  it('returns the first complete reply and stops asking', async () => {
    const g = fakeGenerator([PASSAGE, PASSAGE]);
    const { json, best } = await generateJson(g, 'p', hasPassages, 'passage', noPause);
    expect(json).toEqual({ passages: [{ title: 'Un día' }] });
    expect(best).toEqual(json);
    expect(g.calls).toBe(1);
  });

  it('retries a reply that parses but is missing what was asked for', async () => {
    const g = fakeGenerator(['{"names":[]}', PASSAGE]);
    const { json } = await generateJson(g, 'p', hasPassages, 'passage', noPause);
    expect(json).toEqual({ passages: [{ title: 'Un día' }] });
    expect(g.calls).toBe(2);
  });

  /**
   * DEGRADING TO A PARTIAL ANSWER IS THE BEHAVIOUR THIS FUNCTION WAS BUILT FOR, and it is what
   * separates "the reply was incomplete" from "there was no reply". A caller can render what
   * came back; the route reports `complete: false` beside it.
   */
  it('hands back the last parseable reply when none was complete', async () => {
    const g = fakeGenerator(['{"names":[]}', '{"passages":[]}']);
    const { json, best } = await generateJson(g, 'p', hasPassages, 'passage', noPause);
    expect(json).toBeNull();
    expect(best).toEqual({ passages: [] });
  });
});

describe('a retry that gives up says why it gave up', () => {
  /**
   * THE PRODUCTION BUG, IN ONE ASSERTION. Two 503s, both swallowed, and the learner told their
   * prompt was at fault. `server` is the only kind that gets retried, so it is precisely the
   * kind that can reach the end of the loop still unreported — retrying is what converts a
   * failure carrying a good message into one carrying none.
   */
  it('rethrows the provider error when nothing ever parsed', async () => {
    const g = fakeGenerator([busy(), busy(), busy(), busy()]);
    await expect(generateJson(g, 'p', hasPassages, 'passage', noPause))
      .rejects.toMatchObject({ kind: 'server', message: expect.stringContaining('busy') });
  });

  /**
   * CONTROL, and the line this rule must not cross: a reply that PARSED is a real partial
   * answer, so a later transport failure must not throw it away. Getting this wrong would turn
   * every flaky second request into a total failure.
   */
  it('prefers a partial answer over reporting a later failure', async () => {
    const g = fakeGenerator(['{"passages":[]}', busy(), busy(), busy()]);
    const { json, best } = await generateJson(g, 'p', hasPassages, 'passage', noPause);
    expect(json).toBeNull();
    expect(best).toEqual({ passages: [] });
  });

  /**
   * A parse failure genuinely IS "the reply could not be read", which the route says
   * accurately. Rethrowing a SyntaxError would turn a useful 502 into a bare 500.
   */
  it('does not rethrow when the failure was the parser, not the provider', async () => {
    const g = fakeGenerator(['Sure! Here you go:', 'still not JSON']);
    const { json, best } = await generateJson(g, 'p', hasPassages, 'passage', noPause);
    expect(json).toBeNull();
    expect(best).toBeNull();
  });
});

describe('a definitive failure is not retried', () => {
  /**
   * A rejected key does not become valid on the second attempt, and retrying a 429 is the one
   * thing a 429 asks you to stop doing. Both used to be retried and then reported as a bare
   * 500, so a learner with a wrong key waited through several round trips to be told nothing.
   */
  it.each([
    ['a rejected key', badKey],
    ['a spent rate limit', rateLimited],
  ])('gives up immediately on %s', async (_label, make) => {
    const g = fakeGenerator([make(), PASSAGE, PASSAGE]);
    await expect(generateJson(g, 'p', hasPassages, 'passage', noPause)).rejects.toThrow();
    expect(g.calls, 'it asked again after a definitive answer').toBe(1);
  });
});

describe('the two budgets are separate, because the two failures cost different amounts', () => {
  /**
   * A REPLY THAT ARRIVES AND CANNOT BE PARSED HAS ALREADY BEEN WRITTEN — tokens spent, fifteen
   * seconds waited. A 503 produced nothing at all and comes back in about a second. One
   * counter for both meant the cheap failure was rationed by the expensive one, which on a
   * free tier is most of them: `gemini-3.8-flash` answers 503 often enough that two attempts a
   * second apart is a coin flip.
   */
  it('a transport failure does not spend a generation', async () => {
    const g = fakeGenerator([busy(), busy(), PASSAGE]);
    const { json } = await generateJson(g, 'p', hasPassages, 'passage', noPause);
    expect(json).toEqual({ passages: [{ title: 'Un día' }] });
    expect(g.calls).toBe(3);
  });

  /**
   * CONTROL ON THE OTHER SIDE: the expensive budget stays at two. Raising it is the tempting
   * mistake — three full generations at fifteen seconds each is forty-five, close enough to the
   * route's own 60s timeout to turn a bad reply into a dead request.
   */
  it('stops after two replies that arrived and were unusable', async () => {
    const g = fakeGenerator(['{"a":1}', '{"b":2}', PASSAGE]);
    const { json } = await generateJson(g, 'p', hasPassages, 'passage', noPause);
    expect(json).toBeNull();
    expect(g.calls).toBe(2);
  });

  it('gives up rather than retrying a busy provider for ever', async () => {
    const g = fakeGenerator([busy()]);
    await expect(generateJson(g, 'p', hasPassages, 'passage', noPause)).rejects.toThrow();
    expect(g.calls).toBeLessThanOrEqual(4);
  });

  /** Congestion that has not cleared in a second may clear in three. */
  it('waits longer before each successive retry', async () => {
    const waits: number[] = [];
    const g = fakeGenerator([busy(), busy(), PASSAGE]);
    await generateJson(g, 'p', hasPassages, 'passage', async ms => { waits.push(ms); });
    expect(waits.length).toBe(2);
    expect(waits[1]).toBeGreaterThan(waits[0]);
  });
});

describe('extractJson takes the object out of whatever the model wrapped it in', () => {
  it('reads bare JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips a markdown fence', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('ignores text before the object', () => {
    expect(extractJson('Here you go:\n{"a":1}')).toEqual({ a: 1 });
  });

  /**
   * THE HALF IT COULD NOT SEE. The slice was gated on `jStart > 0`, so a model that APPENDS
   * starts its reply at index 0, skipped the slice, and failed to parse over text sitting
   * after a perfectly good object.
   */
  it('ignores text after the object', () => {
    expect(extractJson('{"a":1}\n\nHope this helps!')).toEqual({ a: 1 });
  });

  it('repairs a trailing comma', () => {
    expect(extractJson('{"a":[1,2,],}')).toEqual({ a: [1, 2] });
  });

  it('throws on a reply with no object in it at all', () => {
    expect(() => extractJson('I cannot help with that.')).toThrow();
  });

  /** A truncated reply is what a model cut off at its output cap returns. */
  it('throws on an unterminated object rather than inventing one', () => {
    expect(() => extractJson('{"passages":[{"title":"Un d')).toThrow();
  });

  it('leaves valid JSON untouched — the control for repairJson', () => {
    const valid = '{"a":"x, y","b":[1,2]}';
    expect(repairJson(valid)).toBe(valid);
  });
});
