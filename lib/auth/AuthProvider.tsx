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
      let u = (await sb.auth.getUser()).data.user;
      if (!active) return;
      if (!u) {
        // No session → create an anonymous one so the server-side guest AI budget
        // (consume_ai_credit) has a user to meter. Without this, guests have no session
        // and generation is effectively unlimited. Requires "Anonymous sign-ins" enabled
        // in the Supabase project (see supabase/schema.sql setup notes).
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

  const signInWithEmail = useCallback(async (email: string) => {
    if (!sb) return { error: 'Sign-in isn’t configured yet.' };
    const e = email.trim();
    if (!e) return { error: 'Enter an email address.' };
    
    // Check session before updating
    const { data: { session } } = await sb.auth.getSession();
    const { error } = (isAnonymous && session)
      ? await sb.auth.updateUser({ email: e })
      : await sb.auth.signInWithOtp({ email: e });
      
    return error ? { error: error.message } : {};
  }, [sb, isAnonymous]);

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
