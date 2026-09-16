import { describe, it, expect, vi, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

/**
 * WHO GETS AI GRADING, ASSERTED AS BEHAVIOUR RATHER THAN AS A SUBSTRING.
 *
 * `tests/aiGate.test.ts` can only check that this route ASKS who is paying. It cannot check
 * that it gets the answer right, and the answer is the whole defect: the route reserved AI
 * grading for signed-in accounts, which quietly refused it to an anonymous learner who had
 * connected their own Anthropic key and was paying for every call themselves. The rule
 * `lib/server/generator.ts` states — `operatorPays` decides metering, not the model — was
 * broken here and nowhere else.
 *
 * It failed invisibly, which is why it needs a test rather than a reading. A grade still came
 * back; it was just a keyword match. The only symptom available to the learner was grading
 * that felt blunt, and they were the one group who had paid specifically to avoid that.
 *
 * So each case below fixes WHOSE KEY and WHETHER THEY ARE SIGNED IN independently, and asserts
 * which of the two graders ran.
 */

const { isAnonymousGuest } = vi.hoisted(() => ({ isAnonymousGuest: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ isAnonymousGuest }));

/** Records the key each constructed client was given, so "billed to whom" is checkable. */
const { create, builtWith } = vi.hoisted(() => ({ create: vi.fn(), builtWith: [] as string[] }));
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create };
    constructor(opts: { apiKey: string }) { builtWith.push(opts.apiKey); }
  },
}));

const { POST } = await import('@/app/api/grade-response/route');

const USER_KEY = 'sk-ant-api03-UUUUUUUUUUUUUUUUUUUUUUUU';
const OPERATOR_KEY = 'sk-ant-api03-OOOOOOOOOOOOOOOOOOOOOOOO';

/** A Spanish answer that a keyword match would happily grade, so a fallback is not a failure. */
const BODY = {
  question: '¿Dónde vive Ana?', model: 'She lives in a big house.',
  key: ['casa'], response: 'Ana vive en una casa grande.',
  language: 'es', hskLevel: 1,
};

function request(userKey?: string): NextRequest {
  return {
    headers: { get: () => userKey ?? null },
    json: async () => BODY,
  } as unknown as NextRequest;
}

function env({ server, stub }: { server?: string; stub?: string } = {}) {
  vi.stubEnv('SRSLY_API_KEY', server);
  vi.stubEnv('ANTHROPIC_API_KEY', undefined);
  vi.stubEnv('SRSLY_STUB_AI', stub);
}

/** What the model would say, distinguishable from anything keywordFallback can produce. */
function aiReplies(message: string) {
  create.mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({ verdict: 'ok', message, wordsHit: ['casa'] }) }],
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  create.mockReset();
  isAnonymousGuest.mockReset();
  builtWith.length = 0;
});

describe('a learner on their own key is never rationed', () => {
  it('GRADES A GUEST WITH THEIR OWN KEY WITH AI — the fix', async () => {
    env({ server: OPERATOR_KEY });
    isAnonymousGuest.mockResolvedValue(true);
    aiReplies('Clear and correct.');

    const body = await (await POST(request(USER_KEY))).json();

    expect(create).toHaveBeenCalledTimes(1);
    expect(body.message).toBe('Clear and correct.');
    // And billed to them, not to the operator whose key is also present.
    expect(builtWith).toEqual([USER_KEY]);
  });

  it('never asks Supabase whether a learner on their own key is a guest', async () => {
    env({ server: OPERATOR_KEY });
    isAnonymousGuest.mockResolvedValue(true);
    aiReplies('Fine.');

    await POST(request(USER_KEY));

    // Not merely an optimisation: asking implies the answer could still matter, and it cannot.
    expect(isAnonymousGuest).not.toHaveBeenCalled();
  });
});

describe('the operator still does not fund strangers', () => {
  it('a guest with no key of their own gets keyword matching, not a model call', async () => {
    env({ server: OPERATOR_KEY });
    isAnonymousGuest.mockResolvedValue(true);

    const body = await (await POST(request())).json();

    expect(create).not.toHaveBeenCalled();
    expect(builtWith).toEqual([]);
    // The keyword grader still answers — degrading is not refusing.
    expect(body.verdict).toBe('ok');
    expect(body.wordsHit).toEqual(['casa']);
  });

  it('a signed-in account is graded on the operator key, as before', async () => {
    env({ server: OPERATOR_KEY });
    isAnonymousGuest.mockResolvedValue(false);
    aiReplies('Nicely put.');

    const body = await (await POST(request())).json();

    expect(create).toHaveBeenCalledTimes(1);
    expect(builtWith).toEqual([OPERATOR_KEY]);
    expect(body.message).toBe('Nicely put.');
  });
});

describe('no key, and the stub, both fall back for free', () => {
  it('with no key at all it does not even ask who is signed in', async () => {
    env({});
    isAnonymousGuest.mockResolvedValue(false);

    const body = await (await POST(request())).json();

    expect(create).not.toHaveBeenCalled();
    expect(isAnonymousGuest).not.toHaveBeenCalled();
    expect(body.verdict).toBe('ok');
  });

  it('SRSLY_STUB_AI never reaches Anthropic, even with the operator key present', async () => {
    // The flag promises "no key, no credit, no cost". This route used to call anyway.
    env({ server: OPERATOR_KEY, stub: '1' });
    isAnonymousGuest.mockResolvedValue(false);

    const body = await (await POST(request())).json();

    expect(create).not.toHaveBeenCalled();
    expect(body.verdict).toBe('ok');
  });
});
