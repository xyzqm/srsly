import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * TWO WAYS THE APP COULD THROW AWAY SOMETHING THE LEARNER HAD EARNED, both reported from a
 * real device and both the same mistake: a value meaning "I could not check" or "this
 * arrived" treated as a value meaning "this just happened".
 *
 * Asserted against the source, comment-stripped, for the reason tests/writingState.test.ts
 * gives — these files name the very identifiers being searched for while explaining why they
 * are forbidden, so a raw substring check would pass on the documentation.
 */

const ROOT = resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

/** Strip block and line comments, so prose about a rule cannot satisfy the rule. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const AUTH = 'lib/auth/AuthProvider.tsx';
const TOASTS = 'components/shared/ToastHost.tsx';

describe('a failed session check must never destroy a session', () => {
  const src = code(read(AUTH));

  it('decides whether a session exists with getSession, not getUser', () => {
    // getSession reads what supabase-js persisted — locally, with no network. getUser asks
    // the server to validate the token, so it fails when the network does.
    expect(src).toContain('getSession');
  });

  it('does not reach signInAnonymously off the back of a getUser result', () => {
    // The bug: `let u = (await sb.auth.getUser()).data.user; if (!u) signInAnonymously()`.
    // A dropped connection then replaced a real account with a throwaway one, permanently.
    const getUserIdx = src.indexOf('auth.getUser(');
    expect(getUserIdx, 'AuthProvider should not call auth.getUser at all').toBe(-1);
    expect(src).toContain('signInAnonymously');
  });

  it('does not attempt an anonymous sign-in while the browser reports itself offline', () => {
    const anonIdx = src.indexOf('signInAnonymously');
    const guard = src.slice(0, anonIdx);
    expect(guard).toMatch(/navigator\.onLine === false/);
  });

  it('server-side authorization still validates with getUser', () => {
    // The distinction is the point: a forged token must not be believed where it grants
    // access. lib/supabase/server.ts is that place and must keep asking.
    expect(code(read('lib/supabase/server.ts'))).toContain('auth.getUser()');
  });
});

describe('a deck arriving from the cloud must not replay old milestones', () => {
  const src = code(read(TOASTS));

  it('the deck-swap branch leaves a flag, not just an acknowledge', () => {
    // acknowledge() calls setFresh([]), which is a state update and so cannot be seen by the
    // announcer effect running later in the SAME commit. A ref can.
    expect(src).toMatch(/swallowed\s*=\s*useRef\(false\)/);
    const swapBranch = src.slice(src.indexOf('prev.loadSeq !== loadSeq'));
    expect(swapBranch.slice(0, 300)).toContain('swallowed.current = true');
  });

  it('the announcer reads and clears the flag before pushing anything', () => {
    const announcer = src.slice(src.lastIndexOf('useEffect(() => {'));
    const readIdx = announcer.indexOf('swallowed.current');
    const pushIdx = announcer.indexOf('push({');
    expect(readIdx, 'announcer never reads the flag').toBeGreaterThan(-1);
    expect(pushIdx).toBeGreaterThan(-1);
    expect(readIdx, 'the flag must be read BEFORE a toast is pushed').toBeLessThan(pushIdx);
    // Cleared, or one swap silences every future milestone.
    expect(announcer).toContain('swallowed.current = false');
  });

  it('still acknowledges on a swap, so the milestones are not announced later either', () => {
    const swapBranch = src.slice(src.indexOf('prev.loadSeq !== loadSeq'));
    expect(swapBranch.slice(0, 300)).toContain('acknowledge()');
  });
});

/** Controls: each reintroduces the bug and asserts the rule above would catch it. */
describe('controls', () => {
  it('the old getUser-then-anonymous shape fails the auth rule', () => {
    const broken = code(`
      const u = (await sb.auth.getUser()).data.user;
      if (!u) { await sb.auth.signInAnonymously(); }
    `);
    expect(broken.indexOf('auth.getUser(')).toBeGreaterThan(-1);   // the rule asserts -1
    expect(broken.slice(0, broken.indexOf('signInAnonymously'))).not.toMatch(/navigator\.onLine === false/);
  });

  it('acknowledge() without the flag fails the toast rule', () => {
    const broken = code(`
      if (prev.lang !== language || prev.loadSeq !== loadSeq) {
        if (fresh.length > 0) acknowledge();
        return;
      }
    `);
    const swapBranch = broken.slice(broken.indexOf('prev.loadSeq !== loadSeq'));
    expect(swapBranch.slice(0, 300)).not.toContain('swallowed.current = true');
  });

  it('comment-stripping is real — prose naming the identifier does not satisfy the rule', () => {
    expect(code('/* we never call auth.getUser() here */ const x = 1;')).not.toContain('auth.getUser(');
  });
});
