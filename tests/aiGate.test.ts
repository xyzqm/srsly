import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * THE MONEY TEST. It exists because the defect it guards had no symptom.
 *
 * `missed-review` reached Anthropic for two months with no key check and no meter: an
 * anonymous guest's example sentences fell through to `SRSLY_API_KEY` and were billed to the
 * operator, unlimited, and never written to `ai_usage`. Nothing errored, nothing looked
 * wrong, and no screen in the app could have shown it. The only way that class of fault
 * becomes visible is a test that enumerates the routes able to spend and insists each one
 * says how it is paid for.
 *
 * So the first block is a FIREWALL over the filesystem rather than over behaviour, in the
 * shape `tests/writingState.test.ts` already uses: a fourth route that so much as imports the
 * Anthropic SDK fails this file until someone names it and says which rule it follows.
 */

const ROOT = resolve(import.meta.dirname, '..');
const API = resolve(ROOT, 'app/api');

/**
 * Comments are stripped before any check, for the reason the handwriting firewall records:
 * these files EXPLAIN the billing rules at length and name the very identifiers being looked
 * for, so a raw substring search would pass on the documentation and quietly push the next
 * person to delete the explanation to keep the test honest.
 */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(l => !l.trim().startsWith('//'))
    .join('\n');
}

const routes = readdirSync(API, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)
  .sort()
  .map(name => ({ name, src: code(readFileSync(resolve(API, name, 'route.ts'), 'utf8')) }));

/** Anything that could construct an Anthropic client, deliberately over-approximated. */
const reachesAnthropic = routes.filter(r =>
  r.src.includes('@anthropic-ai/sdk') ||
  r.src.includes('@/lib/server/generator') ||
  r.src.includes('@/lib/server/aiGate'));

/** Metered through the gate: an operator-funded call spends a credit or is refused. */
const METERED = ['daily-content', 'missed-review'];

/**
 * The one route that DEGRADES instead of metering, and it is a product decision rather than
 * an oversight: `grade-response` has something free to give, so an operator-funded request it
 * may not make falls back to keyword matching instead of returning 402. A learner never loses
 * their grade over who is paying.
 *
 * Listed here rather than exempted silently, because "degrades deliberately" and "forgot to
 * check" look identical from outside. `tests/gradeResponse.test.ts` pins which of the two
 * graders actually runs for each combination of key and session.
 */
const DEGRADES_FOR_GUESTS = ['grade-response'];

describe('every route that can reach Anthropic says who pays', () => {
  it('finds the routes at all — the control', () => {
    // Without this the two assertions below pass trivially if the scan ever breaks.
    expect(routes.length).toBeGreaterThan(5);
    expect(reachesAnthropic.map(r => r.name)).toContain('daily-content');
  });

  it('is exactly the known list, so a fourth route fails here rather than billing quietly', () => {
    expect(reachesAnthropic.map(r => r.name).sort()).toEqual([...METERED, ...DEGRADES_FOR_GUESTS].sort());
  });

  it.each(METERED)('%s meters through the gate', name => {
    const r = reachesAnthropic.find(x => x.name === name)!;
    expect(r.src).toMatch(/meterOrRefuse\s*\(/);
    expect(r.src).toContain('resolveAiAccess');
  });

  it.each(DEGRADES_FOR_GUESTS)('%s falls back for guests instead of metering', name => {
    const r = reachesAnthropic.find(x => x.name === name)!;
    expect(r.src).toMatch(/isAnonymousGuest\s*\(/);
    expect(r.src).toContain('resolveAiAccess');
  });

  /**
   * THE RULE THAT WAS BROKEN HERE, GUARDED ACROSS EVERY ROUTE AT ONCE.
   *
   * `grade-response` asked "is this an anonymous guest?" and nothing else, so it withheld AI
   * grading from a guest paying with their own key — the one place the codebase broke its own
   * "a learner spending their own money is never rationed" rule. A bare guest check is the
   * shape of that mistake, so any route making one must also name who is paying.
   */
  it('no route decides on the session alone — a guest check is qualified by who pays', () => {
    const asking = reachesAnthropic.filter(r => /isAnonymousGuest\s*\(/.test(r.src));
    expect(asking.length, 'control: some route should be asking').toBeGreaterThan(0);
    for (const r of asking) expect(r.src, r.name).toContain('operatorPays');
  });

  /**
   * The control for the firewall itself. `missed-review` is the route this test was written
   * for, and before the fix its source contained neither call — so asserting the ABSENCE of
   * the old shape is what proves the check can fail.
   */
  it('no metered route still builds its client straight from the environment', () => {
    for (const name of METERED) {
      const r = reachesAnthropic.find(x => x.name === name)!;
      expect(r.src, name).not.toMatch(/process\.env\.(SRSLY|ANTHROPIC)_API_KEY/);
    }
  });
});

// ── The gate's own logic ──────────────────────────────────────────────────────

const { consumeAiCredit } = vi.hoisted(() => ({ consumeAiCredit: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ consumeAiCredit }));

const { resolveAiAccess, meterOrRefuse, generatorFor } = await import('@/lib/server/aiGate');

const KEY = 'sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA';
const req = (userKey?: string) => ({ headers: { get: () => userKey ?? null } });

/** Every case sets all three explicitly — the machine running the suite may have a real key. */
function env({ server, anthropic, stub }: { server?: string; anthropic?: string; stub?: string }) {
  vi.stubEnv('SRSLY_API_KEY', server);
  vi.stubEnv('ANTHROPIC_API_KEY', anthropic);
  vi.stubEnv('SRSLY_STUB_AI', stub);
}

afterEach(() => { vi.unstubAllEnvs(); consumeAiCredit.mockReset(); });

describe('resolveAiAccess decides whose money it is', () => {
  it("the learner's own key wins over the operator's, and is never metered", () => {
    env({ server: 'sk-ant-operator-key-aaaaaaaaaaaaaaaa' });
    const a = resolveAiAccess(req(KEY));
    expect(a).toMatchObject({ apiKey: KEY, operatorPays: false, usable: true });
  });

  it("falls back to the operator's key, which IS metered", () => {
    env({ server: 'sk-ant-operator-key-aaaaaaaaaaaaaaaa' });
    expect(resolveAiAccess(req())).toMatchObject({ operatorPays: true, usable: true });
  });

  it('SRSLY_API_KEY is preferred over ANTHROPIC_API_KEY', () => {
    // Claude Code sets ANTHROPIC_API_KEY='' in its own shell, which would otherwise win.
    env({ server: 'from-srsly', anthropic: 'from-anthropic' });
    expect(resolveAiAccess(req()).apiKey).toBe('from-srsly');
  });

  it('a malformed user key is not a key, and falls through rather than being sent', () => {
    env({ server: 'from-srsly' });
    const a = resolveAiAccess(req('hunter2'));
    expect(a).toMatchObject({ apiKey: 'from-srsly', operatorPays: true });
  });

  it('the placeholder from .env.example is not a usable key', () => {
    env({ server: 'your-api-key-here' });
    expect(resolveAiAccess(req())).toMatchObject({ usable: false, operatorPays: false });
  });

  it('with no key and no stub the route cannot proceed', () => {
    env({});
    expect(resolveAiAccess(req())).toMatchObject({ usable: false, apiKey: '', operatorPays: false });
  });

  it('the stub is usable with no key at all, and nobody pays', () => {
    env({ stub: '1' });
    expect(resolveAiAccess(req())).toMatchObject({ usable: true, stub: true, operatorPays: false });
  });
});

describe('generatorFor cannot disagree with the meter', () => {
  it("carries operatorPays across, both ways", () => {
    env({ server: 'sk-ant-operator-key-aaaaaaaaaaaaaaaa' });
    expect(generatorFor(resolveAiAccess(req())).operatorPays).toBe(true);
    expect(generatorFor(resolveAiAccess(req(KEY))).operatorPays).toBe(false);
  });

  it('builds without throwing when the stub leaves no key to build from', () => {
    env({ stub: '1' });
    expect(() => generatorFor(resolveAiAccess(req()))).not.toThrow();
  });
});

describe('meterOrRefuse spends a credit only when the operator is paying', () => {
  it('never touches the meter for a learner on their own key', async () => {
    env({ server: 'sk-ant-operator-key-aaaaaaaaaaaaaaaa' });
    const r = await meterOrRefuse(resolveAiAccess(req(KEY)), 'nope');
    expect(r.refusal).toBeNull();
    expect(consumeAiCredit).not.toHaveBeenCalled();
  });

  it('never touches the meter under the stub', async () => {
    env({ server: 'sk-ant-operator-key-aaaaaaaaaaaaaaaa', stub: '1' });
    const r = await meterOrRefuse(resolveAiAccess(req()), 'nope');
    expect(r.refusal).toBeNull();
    expect(consumeAiCredit).not.toHaveBeenCalled();
  });

  it('charges the operator once and passes the remaining allowance back', async () => {
    env({ server: 'sk-ant-operator-key-aaaaaaaaaaaaaaaa' });
    consumeAiCredit.mockResolvedValue({ allowed: true, remaining: 3 });
    const r = await meterOrRefuse(resolveAiAccess(req()), 'nope');
    expect(r).toEqual({ refusal: null, remaining: 3 });
    expect(consumeAiCredit).toHaveBeenCalledTimes(1);
  });

  /**
   * The two refusals must not wear each other's clothes. Reporting a missing session as 402
   * once cost a real debugging detour — an auth fault came back reading "You've used your
   * free AI generations" to someone who had used none — and, worse, the client latches a 402
   * into localStorage as a spent budget, which would lock a working account out of generation
   * until storage was cleared.
   */
  it('a missing session is 401 and not a spent budget', async () => {
    env({ server: 'sk-ant-operator-key-aaaaaaaaaaaaaaaa' });
    consumeAiCredit.mockResolvedValue({ allowed: false, reason: 'no_session', remaining: null });
    const { refusal } = await meterOrRefuse(resolveAiAccess(req()), 'BUDGET COPY');
    expect(refusal!.status).toBe(401);
    const body = await refusal!.json();
    expect(body.error).toBe('no_session');
    expect(body.message).not.toBe('BUDGET COPY');
  });

  it('a spent budget is 402, carrying the route’s own wording', async () => {
    env({ server: 'sk-ant-operator-key-aaaaaaaaaaaaaaaa' });
    consumeAiCredit.mockResolvedValue({ allowed: false, reason: 'guest_limit', remaining: 0 });
    const { refusal } = await meterOrRefuse(resolveAiAccess(req()), 'BUDGET COPY');
    expect(refusal!.status).toBe(402);
    expect(await refusal!.json()).toMatchObject({ error: 'guest_limit', message: 'BUDGET COPY', aiRemaining: 0 });
  });
});
