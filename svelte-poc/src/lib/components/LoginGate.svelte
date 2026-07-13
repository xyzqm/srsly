<script lang="ts">
  import type { SupabaseClient } from '@supabase/supabase-js';

  // Shown in place of the whole app when signed out. Passwordless: magic link, Google, or an
  // anonymous guest session. The layout's auth listener re-runs load() on success → tabs appear.
  let { supabase }: { supabase: SupabaseClient } = $props();

  let email = $state('');
  let busy = $state('');
  let message = $state('');

  async function magicLink() {
    if (!email.trim()) return;
    busy = 'email';
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: location.origin },
    });
    message = error ? error.message : 'Check your email for a sign-in link.';
    busy = '';
  }

  async function google() {
    busy = 'google';
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin },
    });
    if (error) { message = error.message; busy = ''; }
  }

  async function guest() {
    busy = 'guest';
    const { error } = await supabase.auth.signInAnonymously();
    if (error) { message = error.message; busy = ''; }
  }
</script>

<div style="min-height:80vh; display:flex; align-items:center; justify-content:center; padding:24px;">
  <div
    class="animate-rise"
    style="width:100%; max-width:400px; background:var(--card); border:1px solid var(--line);
      border-radius:16px; padding:36px 32px; box-shadow:0 1px 0 rgba(0,0,0,.02);"
  >
    <div style="font-family:var(--f-display); font-size:30px; font-weight:500; letter-spacing:-.02em;">srsly</div>
    <p style="color:var(--ink-soft); font-size:14px; line-height:1.6; margin:8px 0 26px;">
      Sign in to load your deck and today's reading. Your progress syncs to your account.
    </p>

    <label for="email" style="font-family:var(--f-mono); font-size:10px; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-faint);">Email</label>
    <input
      id="email"
      type="email"
      bind:value={email}
      onkeydown={(e) => { if (e.key === 'Enter') magicLink(); }}
      placeholder="you@example.com"
      style="width:100%; margin-top:6px; font-size:15px; padding:11px 14px; background:var(--paper);
        border:1px solid var(--line); border-radius:9px; color:var(--ink);"
    />
    <button
      onclick={magicLink}
      disabled={!!busy || !email.trim()}
      style="width:100%; margin-top:10px; font-family:var(--f-mono); font-size:12px; letter-spacing:.08em;
        text-transform:uppercase; font-weight:500; background:var(--accent); color:#fff; border:none;
        border-radius:9px; padding:12px; cursor:pointer; box-shadow:0 2px 0 var(--accent-deep);
        opacity:{busy || !email.trim() ? 0.5 : 1};"
    >{busy === 'email' ? 'Sending…' : 'Email me a magic link'}</button>

    <div style="display:flex; align-items:center; gap:12px; margin:20px 0; color:var(--ink-faint); font-size:11px; font-family:var(--f-mono);">
      <div style="flex:1; height:1px; background:var(--line);"></div>OR<div style="flex:1; height:1px; background:var(--line);"></div>
    </div>

    <button
      onclick={google}
      disabled={!!busy}
      style="width:100%; font-family:var(--f-mono); font-size:12px; letter-spacing:.06em; background:none;
        border:1px solid var(--line); border-radius:9px; padding:11px; color:var(--ink); cursor:pointer; margin-bottom:8px;"
    >{busy === 'google' ? 'Redirecting…' : 'Continue with Google'}</button>
    <button
      onclick={guest}
      disabled={!!busy}
      style="width:100%; font-family:var(--f-mono); font-size:12px; letter-spacing:.06em; background:none;
        border:1px solid var(--line); border-radius:9px; padding:11px; color:var(--ink-soft); cursor:pointer;"
    >{busy === 'guest' ? 'Signing in…' : 'Continue as guest'}</button>

    {#if message}
      <p style="margin-top:16px; font-size:12.5px; color:var(--ink-soft); line-height:1.5;">{message}</p>
    {/if}
  </div>
</div>
