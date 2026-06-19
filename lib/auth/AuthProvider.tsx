'use client';
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';
import { getSupabaseBrowser, supabaseEnabled } from '@/lib/supabase/client';
import { storage } from '@/lib/storage';
import { SupabaseStorage, migrateLocalToCloud } from '@/lib/storage/supabase';

interface AuthState {
  user: User | null;
  isAnonymous: boolean;  // true for guests (and when auth is disabled)
  signedIn: boolean;     // a real (non-anonymous) account
  enabled: boolean;      // Supabase configured
  /** Link an email to the current guest (or sign in). Returns {} or {error}. */
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const sb = getSupabaseBrowser();
  const [user, setUser] = useState<User | null>(null);
  // When Supabase isn't configured we render immediately as a pure-local guest.
  const [ready, setReady] = useState(!supabaseEnabled);

  // Point `storage` at the right backend for the given user (cloud for real accounts).
  const applyBackend = useCallback(async (u: User | null) => {
    if (sb && u && u.is_anonymous !== true) {
      try { await migrateLocalToCloud(sb, u.id); } catch (e) { console.error('[auth] migrate failed', e); }
      storage.setBackend(new SupabaseStorage(sb, u.id));
    } else {
      storage.resetToLocal();
    }
  }, [sb]);

  useEffect(() => {
    if (!sb) return; // disabled: stay pure-local
    let active = true;
    (async () => {
      const { data: { session } } = await sb.auth.getSession();
      if (!active) return;
      if (!session) {
        const { error } = await sb.auth.signInAnonymously();
        if (error) console.error('[auth] anonymous sign-in failed', error.message);
      }
      const u = (await sb.auth.getUser()).data.user;
      if (!active) return;
      await applyBackend(u);          // set backend BEFORE the app reads storage
      setUser(u);
      setReady(true);
    })();

    const { data: sub } = sb.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      const u = session?.user ?? null;
      await applyBackend(u);
      setUser(u);
      // A real sign-in arrives via OAuth/email redirect (fresh load handles the rest).
      if (event === 'SIGNED_IN' && u?.is_anonymous !== true) {
        // ensure already-mounted hooks re-read from the cloud
        if (typeof window !== 'undefined') window.location.reload();
      }
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [sb, applyBackend]);

  const isAnonymous = !user || user.is_anonymous === true;
  const signedIn = !!user && !isAnonymous;

  const signInWithEmail = useCallback(async (email: string) => {
    if (!sb) return { error: 'Sign-in isn’t configured yet.' };
    const e = email.trim();
    if (!e) return { error: 'Enter an email address.' };
    const { error } = isAnonymous
      ? await sb.auth.updateUser({ email: e })          // link email to the guest account
      : await sb.auth.signInWithOtp({ email: e });
    return error ? { error: error.message } : {};
  }, [sb, isAnonymous]);

  const signInWithGoogle = useCallback(async () => {
    if (!sb) return { error: 'Sign-in isn’t configured yet.' };
    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
    const { error } = isAnonymous
      ? await sb.auth.linkIdentity({ provider: 'google', options: { redirectTo } })
      : await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    return error ? { error: error.message } : {};
  }, [sb, isAnonymous]);

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
