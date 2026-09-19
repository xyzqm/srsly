import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * THE METER FAILS CLOSED, AND THIS IS THE TEST FOR THE PATH NOBODY EXERCISES.
 *
 * `consumeAiCredit` returned `{ allowed: true }` whenever the RPC errored — a missing
 * function, a revoked grant, a network blip — which turned every one of those into an
 * UNMETERED generation on the operator's key. The docstring on the function already named
 * that exact shape ("silently fail open, which is the unlimited-for-everyone bug") three
 * lines above the code doing it.
 *
 * It surfaced while weighing whether to revoke EXECUTE from the `anon` role. That looked
 * purely cosmetic — the SQL returns `no_session` for a caller with no JWT anyway — but
 * revoking it would have turned that safe refusal into `permission denied`, an error, and
 * therefore a free generation. The ACL tidy-up would have opened the hole it was meant to
 * close, which is why it is worth a test rather than a comment.
 *
 * `!sb` is deliberately NOT the same case: Supabase unconfigured is an ANSWER — this
 * deployment does not meter — while an error is the absence of one.
 */

const rpc = vi.fn();
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ rpc }) }));

/** Module scope reads the env, so it is stubbed before the import that captures it. */
async function load(configured: boolean) {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', configured ? 'https://x.supabase.co' : undefined);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', configured ? 'anon-key' : undefined);
  return import('@/lib/supabase/server');
}

beforeEach(() => { rpc.mockReset(); vi.unstubAllEnvs(); });

describe('consumeAiCredit', () => {
  it('REFUSES when the meter cannot be read, rather than giving the generation away', async () => {
    const { consumeAiCredit } = await load(true);
    rpc.mockResolvedValue({ data: null, error: { message: 'permission denied for function consume_ai_credit' } });

    expect(await consumeAiCredit()).toEqual({ allowed: false, remaining: null, reason: 'unverified' });
  });

  it('passes a real refusal through with its reason intact', async () => {
    const { consumeAiCredit } = await load(true);
    rpc.mockResolvedValue({ data: { allowed: false, reason: 'guest_limit', remaining: 0 }, error: null });

    expect(await consumeAiCredit()).toMatchObject({ allowed: false, reason: 'guest_limit' });
  });

  it('allows and reports the remaining allowance on success', async () => {
    const { consumeAiCredit } = await load(true);
    rpc.mockResolvedValue({ data: { allowed: true, remaining: 4 }, error: null });

    expect(await consumeAiCredit()).toMatchObject({ allowed: true, remaining: 4 });
  });

  /**
   * The control that keeps the rule narrow. Without it, "fail closed" could be implemented as
   * "always refuse", which would break every deployment that runs srsly without Supabase —
   * the default, and the one this file's Environment section calls local-guest mode.
   */
  it('still does not meter at all when Supabase is not configured', async () => {
    const { consumeAiCredit } = await load(false);

    expect(await consumeAiCredit()).toEqual({ allowed: true, remaining: null });
    expect(rpc).not.toHaveBeenCalled();
  });
});
