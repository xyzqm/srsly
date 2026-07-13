<script lang="ts">
  import '../app.css';
  import { invalidate } from '$app/navigation';
  import { onMount } from 'svelte';
  import { getData } from '$lib/data.remote';

  let { data, children } = $props();

  // On sign in/out: re-run the layout load (updates data.user for the gate) and refresh the
  // remote query so the page's data reflects the new auth state.
  onMount(() => {
    const { data: sub } = data.supabase.auth.onAuthStateChange((_, newSession) => {
      if (newSession?.expires_at !== data.session?.expires_at) {
        invalidate('supabase:auth');
        getData().refresh();
      }
    });
    return () => sub.subscription.unsubscribe();
  });
</script>

<!-- Boundary for the page's async `await getData()` (experimental async). -->
<svelte:boundary>
  {@render children()}
  {#snippet pending()}
    <div style="padding:80px 0; text-align:center; color:var(--ink-faint); font-family:var(--f-mono); font-size:12px;">loading…</div>
  {/snippet}
</svelte:boundary>
