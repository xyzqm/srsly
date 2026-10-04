'use client';
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';
import { getSupabaseBrowser, supabaseEnabled } from '@/lib/supabase/client';
import { storage } from '@/lib/storage';
import { SupabaseStorage, migrateLocalToCloud } from '@/lib/storage/supabase';

interface AuthState {
  user: User | null;
  isAnonymous: boolean;
  signedIn: boolean;
  enabled: boolean;
  signInWithEmail: (email: string) => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used within <AuthProvider>');
  return c;
}

/**
 * Does this device hold a Supabase session AT ALL — asked of storage, never of the network.
 *
 * supabase-js persists under `sb-<project-ref>-auth-token`. Matching the shape rather than
 * naming the project means this keeps working if the project ref changes, and it is only ever
 * used to REFUSE a destructive action, so a false positive costs an anonymous session nobody
 * needed and a false negative is the bug this exists to prevent.
 */
function hasPersistedSession(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /^sb-.+-auth-token$/.test(k) && localStorage.getItem(k)) return true;
    }
  } catch { /* storage disabled — then there is nothing to protect */ }
  return false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const sb = getSupabaseBrowser();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(!supabaseEnabled);

  const applyBackend = useCallback(async (u: User | null) => {
    if (sb && u && u.is_anonymous !== true) {
      try { await migrateLocalToCloud(sb, u.id); } catch (e) { console.error('[auth] migrate failed', e); }
      storage.setBackend(new SupabaseStorage(sb, u.id));
    } else {
      storage.resetToLocal();
    }
  }, [sb]);

  useEffect(() => {
    if (!sb) return;
    let active = true;
    (async () => {
      /**
       * ⚠ THIS USED TO SIGN PEOPLE OUT OF THEIR OWN ACCOUNT, AND IT IS THIS FILE'S WORST BUG.
       *
       * It read `(await sb.auth.getUser()).data.user` and DISCARDED THE ERROR. `getUser()` is
       * a network call — it asks `/auth/v1/user` to validate the token — so a dropped
       * connection, a cold start on a slow link, or Supabase being briefly unreachable all
       * return `user: null`. The branch below then read that as "this visitor has no account"
       * and called `signInAnonymously()`, which REPLACES the stored session with a throwaway
       * one. The real session is gone from the device, permanently: reopening the app shows
       * a signed-out guest, and the account's cloud data is unreachable until they sign in
       * again from scratch.
       *
       * It is this file's most-repeated mistake wearing its most expensive face — a value
       * meaning "I could not check" rendered as a value meaning "there is none" — and the
       * service worker made it far easier to reach, because the app now OPENS without a
       * connection. Before, a failed check happened on a screen that never loaded.
       *
       * `getSession()` is the right question and it is answered LOCALLY: supabase-js persists
       * the session itself, so this says whether the device holds one without asking anybody.
       * `getUser()` stays correct where it is used for authorization — lib/supabase/server.ts
       * validates server-side, which is the place a forged token must not be believed. Here
       * the only decision is "is there an account on this device", and destroying one because
       * a fetch failed is never the right answer to it.
       */
      const { data: { session } } = await sb.auth.getSession();
      if (!active) return;
      let u = session?.user ?? null;

      if (!u) {
        // Genuinely no session → create an anonymous one so the server-side guest AI budget
        // (consume_ai_credit) has a user to meter. Without this, guests have no session
        // and generation is effectively unlimited. Requires "Anonymous sign-ins" enabled
        // in the Supabase project (see supabase/schema.sql setup notes).
        //
        // NOT attempted while the browser says it is offline. It would fail anyway, and the
        // point is to keep this path free of anything that could run while the answer to
        // "is there a session" is unknowable.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          storage.resetToLocal();
          setReady(true);
          return;
        }
        /**
         * ⚠ AND THE OFFLINE GUARD ALONE WAS NOT ENOUGH, WHICH IS WHY THIS CAME BACK.
         *
         * `getSession()` reads the persisted session — but if its access token has EXPIRED it
         * first tries to refresh, over the network, and returns null when that cannot complete.
         * A phone opening a home-screen app has a sleeping radio and a token that expired
         * hours ago, so this is the ordinary cold start, not an edge case. `navigator.onLine`
         * is `true` throughout: it reports a link, not reachability.
         *
         * So an empty `getSession()` is still ambiguous, and the previous fix only closed the
         * half of it that announces itself. The unambiguous question is whether supabase-js has
         * a token WRITTEN DOWN, which is answered without asking anybody — and if it has, this
         * device belongs to an account and must not be handed a throwaway one. The refresh will
         * land on its own once the radio is up; `onAuthStateChange` is already listening and
         * will apply it.
         */
        if (hasPersistedSession()) {
          storage.resetToLocal();
          setReady(true);
          return;
        }
        const { data, error } = await sb.auth.signInAnonymously();
        if (error) console.error('[auth] anonymous sign-in failed', error.message);
        if (!active) return;
        u = data?.user ?? null;
      }
      await applyBackend(u);
      setUser(u);
      setReady(true);
    })();
    const { data: sub } = sb.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      const u = session?.user ?? null;
      await applyBackend(u);
      setUser(u);
      if (event === 'SIGNED_IN') {
        // Only redirect if the URL contains auth recovery/access tokens to prevent infinite loops on home page reloads
        if (window.location.hash.includes('access_token') || window.location.search.includes('code')) {
          window.location.href = '/';
        }
      }
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [sb, applyBackend]);

  const isAnonymous = !user || (user.is_anonymous === true && !user.email);
  const signedIn = !!user && !isAnonymous;

  /**
   * ALWAYS A SIGN-IN, never an upgrade of the anonymous user.
   *
   * This used to call `updateUser({ email })` whenever an anonymous session existed — which
   * is always, because the effect above creates one for every visitor. For a NEW user that
   * upgrade is equivalent; for a RETURNING one it is the wrong operation entirely. It tries
   * to attach an already-registered address to this browser's brand-new anonymous user
   * instead of signing into the account that address belongs to, so each device ends up on
   * its own `user.id`, reading and writing its own `user_data` row. Two rows, no shared
   * state, and nothing logs an error — sync appears to work and silently syncs nothing.
   *
   * The upgrade path preserved nothing anyway: `applyBackend` gives an anonymous user
   * `resetToLocal()`, so it has no cloud data to keep, and `migrateLocalToCloud` carries the
   * guest's LOCAL deck up on whichever account they land on. So OTP is correct in both
   * cases — it signs a returning user in, and creates the account for a new one.
   */
  const signInWithEmail = useCallback(async (email: string) => {
    if (!sb) return { error: 'Sign-in isn’t configured yet.' };
    const e = email.trim();
    if (!e) return { error: 'Enter an email address.' };
    const { error } = await sb.auth.signInWithOtp({ email: e });
    return error ? { error: error.message } : {};
  }, [sb]);

  const signInWithGoogle = useCallback(async () => {
    if (!sb) return { error: 'Sign-in isn’t configured yet.' };
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined;
    
    const { error } = await sb.auth.signInWithOAuth({ 
      provider: 'google', 
      options: { redirectTo } 
    });
    return error ? { error: error.message } : {};
  }, [sb]);

  const signOut = useCallback(async () => {
    if (!sb) return;
    await sb.auth.signOut();
    storage.resetToLocal();
    if (typeof window !== 'undefined') window.location.reload();
  }, [sb]);

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--ink-faint)', letterSpacing: '.1em' }}>
        loading…
      </div>
    );
  }

  return (
    <Ctx.Provider value={{ user, isAnonymous, signedIn, enabled: supabaseEnabled, signInWithEmail, signInWithGoogle, signOut }}>
      {children}
    </Ctx.Provider>
  );
}
