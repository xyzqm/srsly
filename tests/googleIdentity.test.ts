import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeNonce, googleIdentityConfigured, googleClientId } from '@/lib/auth/googleIdentity';

/**
 * THE ID-TOKEN FLOW'S ONE SILENT FAILURE IS THE NONCE.
 *
 * Google is initialised with the SHA-256 hex and embeds it in the token; Supabase is given the
 * RAW value and hashes it to compare. Swap them and the exchange fails with a flat
 * "Invalid token" that names nothing — so the pairing is asserted here rather than discovered
 * against a live provider.
 */

const ROOT = resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

describe('makeNonce', () => {
  it('returns a raw value and the SHA-256 hex OF THAT value', async () => {
    const { raw, hashed } = await makeNonce();
    expect(hashed).toBe(await sha256Hex(raw));
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
    expect(hashed).not.toBe(raw);
  });

  it('is fresh every time — a reused nonce is a replayable token', async () => {
    const a = await makeNonce();
    const b = await makeNonce();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hashed).not.toBe(b.hashed);
  });

  it('is long enough to be worth hashing', async () => {
    const { raw } = await makeNonce();
    expect(raw.length).toBeGreaterThanOrEqual(64);   // two UUIDs
  });
});

describe('the two halves go to the right places', () => {
  it('the button hands Google the HASHED half', () => {
    const src = code(read('components/auth/GoogleIdButton.tsx'));
    const init = src.slice(src.indexOf('id.initialize('), src.indexOf('renderButton'));
    expect(init).toMatch(/nonce:\s*hashed/);
    expect(init).not.toMatch(/nonce:\s*raw/);
  });

  it('the exchange hands Supabase the RAW half', () => {
    const src = code(read('components/auth/GoogleIdButton.tsx'));
    expect(src).toMatch(/signInWithGoogleCredential\(\s*res\.credential\s*,\s*nonceRaw\.current\s*\)/);
    const auth = code(read('lib/auth/AuthProvider.tsx'));
    const fn = auth.slice(auth.indexOf('signInWithGoogleCredential = useCallback'));
    expect(fn.slice(0, 400)).toContain('signInWithIdToken');
    expect(fn.slice(0, 400)).toMatch(/nonce,/);
  });

  it('CONTROL: handing Google the raw half would fail this', () => {
    const broken = code('id.initialize({ client_id: x, nonce: raw, callback: c }); renderButton();');
    const init = broken.slice(broken.indexOf('id.initialize('), broken.indexOf('renderButton'));
    expect(init).toMatch(/nonce:\s*raw/);     // the real rule asserts the opposite
  });
});

describe('it degrades rather than disappearing', () => {
  it('reports unconfigured when no client ID is set', () => {
    // The suite runs with no NEXT_PUBLIC_GOOGLE_CLIENT_ID, which is the deployment default.
    expect(googleClientId()).toBe('');
    expect(googleIdentityConfigured()).toBe(false);
  });

  it('the modal keeps the redirect button when unconfigured', () => {
    const src = code(read('components/auth/SignInModal.tsx'));
    expect(src).toContain('googleIdentityConfigured()');
    // Both arms must exist: the new button AND the old one.
    expect(src).toContain('GoogleIdButton');
    expect(src).toContain('doGoogle');
  });

  it('AuthProvider keeps the redirect flow alongside the token flow', () => {
    const src = code(read('lib/auth/AuthProvider.tsx'));
    expect(src).toContain('signInWithOAuth');
    expect(src).toContain('signInWithIdToken');
  });

  it('never auto-selects a session the learner did not ask for', () => {
    const src = code(read('components/auth/GoogleIdButton.tsx'));
    expect(src).toMatch(/auto_select:\s*false/);
  });

  it('uses renderButton rather than the silently-suppressible One Tap prompt', () => {
    const src = code(read('components/auth/GoogleIdButton.tsx'));
    expect(src).toContain('renderButton');
    expect(src).not.toMatch(/\bid\.prompt\(/);
  });
});

describe('the service worker must never cache the auth script', () => {
  it('accounts.google.com is network-only', () => {
    const sw = readFileSync(resolve(ROOT, 'public/sw.js'), 'utf8');
    const self = { location: { origin: 'https://srsly-zeta.vercel.app' }, addEventListener: () => {}, skipWaiting: () => {}, clients: { claim: async () => {} } } as Record<string, unknown>;
    new Function('self', 'caches', 'fetch', sw)(self, {}, async () => ({}));
    const api = self.__srsly as { classify: (u: string, m: string, mode: string) => string };
    expect(api.classify('https://accounts.google.com/gsi/client', 'GET', 'no-cors')).toBe('network-only');
  });
});

/**
 * THE SILENT FAILURE, WHICH WAS NOT A FAILURE AT ALL.
 *
 * Reported as: the Google popup closes, the sheet stays, no error, not signed in. Three
 * separate gaps, and the first one is why there was no error to show — there was no error.
 * Every earlier sign-in path NAVIGATED (the redirect returned through /auth/callback, an email
 * link is a navigation), so nothing had ever needed to close the sheet or re-read the data.
 * The ID-token flow is the first that completes in place.
 */
describe('a sign-in that never navigates still has to be noticed', () => {
  it('the modal closes itself when signedIn goes true', () => {
    const src = code(read('components/auth/SignInModal.tsx'));
    expect(src).toMatch(/signedIn/);
    expect(src).toMatch(/if \(open && signedIn\) onClose\(\)/);
  });

  it('AuthProvider reloads on an in-place sign-in, so hooks re-read through the new backend', () => {
    const src = code(read('lib/auth/AuthProvider.tsx'));
    const branch = src.slice(src.indexOf("event === 'SIGNED_IN'"));
    expect(branch).toContain('window.location.reload()');
  });

  it('⚠ the reload is guarded by `settled`, or a restored session loops forever', () => {
    // SIGNED_IN also fires when a session is merely restored on load. Without the guard the
    // app would reload, restore, reload — a boot loop shipped to every signed-in device.
    const src = code(read('lib/auth/AuthProvider.tsx'));
    const branch = src.slice(src.indexOf("event === 'SIGNED_IN'"));
    const reloadAt = branch.indexOf('window.location.reload()');
    const guardAt = branch.indexOf('settled.current');
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(reloadAt);
    // and it must only ever fire for a REAL user, never the anonymous one the app mints itself
    expect(branch.slice(guardAt, reloadAt)).toMatch(/is_anonymous !== true/);
  });

  it('`settled` is set on EVERY path out of the initial resolution', () => {
    // Three exits: offline, a stored-but-unrefreshable token, and the ordinary one. Miss any
    // and a later genuine sign-in silently fails to reload — the bug, wearing a third face.
    const src = code(read('lib/auth/AuthProvider.tsx'));
    expect(src.match(/settled\.current = true/g) ?? []).toHaveLength(3);
    expect(src).toMatch(/settled\s*=\s*useRef\(false\)/);
  });
});

describe('nothing in this flow may reject silently', () => {
  it('the exchange catches a throw as well as returning an error', () => {
    const src = code(read('lib/auth/AuthProvider.tsx'));
    const fn = src.slice(src.indexOf('signInWithGoogleCredential = useCallback'));
    const body = fn.slice(0, fn.indexOf('}, [sb]);'));
    expect(body).toContain('try {');
    expect(body).toContain('catch');
    expect(body).toContain('signInWithIdToken');
  });

  it('the button handles a rejection as well as an error field', () => {
    const src = code(read('components/auth/GoogleIdButton.tsx'));
    const call = src.slice(src.indexOf('signInWithGoogleCredential('));
    expect(call).toContain('.then(');
    expect(call).toContain('.catch(');
    expect(call.indexOf('.then(')).toBeLessThan(call.indexOf('.catch('));
  });

  it('CONTROL: a bare `.then` would fail that rule', () => {
    const broken = code('void signIn(c, n).then(r => { if (r.error) onError(r.error); });');
    expect(broken).not.toContain('.catch(');
  });
});
