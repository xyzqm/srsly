'use client';

/**
 * GOOGLE'S OWN SIGN-IN BUTTON, so the consent screen names this site rather than a hash.
 *
 * ── WHY THE REDIRECT FLOW COULD NEVER FIX THIS ──
 *
 * `signInWithOAuth` sends the browser to `<project-ref>.supabase.co/auth/v1/authorize`, and
 * Google's "to continue to …" line is the REDIRECT URI'S HOST. It shows the configured app
 * name only once the OAuth client passes brand verification — and brand verification requires
 * proving ownership, in Search Console, of every authorized domain, which here means
 * `supabase.co`. Nobody but Supabase can ever verify that. Creating a custom OAuth client
 * changes who the client belongs to and not where the redirect points, so it cannot help; this
 * was tried first and the screen was unchanged.
 *
 * `vercel.app` cannot be verified either — it is on the Public Suffix List, so Google treats it
 * as shared rather than as anybody's.
 *
 * The ID-TOKEN flow removes the redirect entirely. Google issues a credential to THIS page, and
 * `supabase.auth.signInWithIdToken` exchanges it for a session. There is no hop through
 * supabase.co for Google to name, so the prompt refers to this origin.
 *
 * ── THE NONCE IS TWO VALUES AND GETTING THEM ROUND THE WRONG WAY SILENTLY FAILS ──
 *
 * Google is initialised with the **SHA-256 hex** of a random nonce and embeds that hash in the
 * token it issues. Supabase is then given the **raw** nonce and hashes it itself to check they
 * match. That is what stops a token minted for some other site being replayed here. The two are
 * generated as a pair below precisely so no call site has to remember which half goes where.
 *
 * ── IT IS LOADED ON DEMAND, NOT AT STARTUP ──
 *
 * The script is a third party's, so it is fetched when somebody opens the sign-in sheet and
 * never on the landing path — the same discipline the level tables and `hanzi-writer` follow.
 * It is also cross-origin, so `public/sw.js` classifies it `network-only` and it is never
 * cached: an auth script served from disk is not something this app will do.
 */

const GSI_SRC = 'https://accounts.google.com/gsi/client';

/** The client ID is PUBLIC by design — it identifies the app, it does not authorise anything. */
export function googleClientId(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
}

/** True when the ID-token flow is configured. With it false, callers keep the redirect flow. */
export function googleIdentityConfigured(): boolean {
  return googleClientId().length > 0;
}

export interface NoncePair {
  /** Handed to Supabase, which hashes it and compares against the token. */
  raw: string;
  /** Handed to Google, which embeds it in the token. */
  hashed: string;
}

/**
 * A fresh nonce, in both forms.
 *
 * `crypto.randomUUID` rather than `Math.random`: this is the value standing between a token
 * issued for another site and a session here, so it has to come from the CSPRNG.
 */
export async function makeNonce(): Promise<NoncePair> {
  const raw = crypto.randomUUID() + crypto.randomUUID();
  const bytes = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hashed = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return { raw, hashed };
}

/** Minimal shape of the bit of Google Identity Services this file uses. */
interface GsiId {
  initialize(opts: {
    client_id: string;
    callback: (r: { credential?: string }) => void;
    nonce?: string;
    use_fedcm_for_prompt?: boolean;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(parent: HTMLElement, opts: Record<string, unknown>): void;
  disableAutoSelect(): void;
}
declare global {
  var google: { accounts: { id: GsiId } } | undefined;
}

let loading: Promise<GsiId> | null = null;

/** Load the GIS script once. Repeat calls share the one request, the way `getCedict` does. */
export function loadGoogleIdentity(): Promise<GsiId> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (globalThis.google?.accounts?.id) return Promise.resolve(globalThis.google.accounts.id);
  if (loading) return loading;

  loading = new Promise<GsiId>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    const el = existing ?? document.createElement('script');
    const done = () => {
      const api = globalThis.google?.accounts?.id;
      if (api) resolve(api);
      else reject(new Error('Google sign-in loaded but did not initialise.'));
    };
    el.addEventListener('load', done);
    el.addEventListener('error', () => {
      loading = null;      // let a later attempt retry rather than failing for the session
      reject(new Error('Google sign-in could not be reached.'));
    });
    if (!existing) {
      el.src = GSI_SRC;
      el.async = true;
      el.defer = true;
      document.head.appendChild(el);
    } else if (globalThis.google?.accounts?.id) {
      done();
    }
  });
  return loading;
}
