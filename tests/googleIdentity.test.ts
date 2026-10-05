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
