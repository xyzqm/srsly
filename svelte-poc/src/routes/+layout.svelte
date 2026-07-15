<script lang="ts">
  import '../app.css';
  import { invalidate } from '$app/navigation';
  import { onMount } from 'svelte';
  import { getDeck, getPrefs, getPassage } from '$lib/data.remote';
  import { SUPPORTED_LANGUAGES } from '$lib/languageConfig';

  let { data, children } = $props();

  // On sign in/out: re-run the layout load (updates data.user for the gate) and refresh the
  // remote queries so the page's data reflects the new auth state (a different user, or none).
  onMount(() => {
    const { data: sub } = data.supabase.auth.onAuthStateChange((_, newSession) => {
      if (newSession?.expires_at !== data.session?.expires_at) {
        invalidate('supabase:auth');
        // getDeck/getPassage are parameterized by language, so their caches have one entry per
        // language — refresh all of them rather than guessing which one is currently shown.
        for (const lang of SUPPORTED_LANGUAGES) { getDeck(lang).refresh(); getPassage(lang).refresh(); }
        getPrefs().refresh();
      }
    });
    return () => sub.subscription.unsubscribe();
  });
</script>

<!-- Boundary for the page's async `await getDeck(lang)`/`getPrefs()`/`getPassage(lang)` (experimental async). -->
<svelte:boundary>
  {@render children()}
  {#snippet pending()}
    <div style="padding:80px 0; text-align:center; color:var(--ink-faint); font-family:var(--f-mono); font-size:12px;">loading…</div>
  {/snippet}
</svelte:boundary>
