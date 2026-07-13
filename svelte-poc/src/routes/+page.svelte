<script lang="ts">
  import type { Theme } from '$lib/types';
  import { getData, saveTheme, saveLevel, seedDemo, clearDeck } from '$lib/data.remote';
  import LoginGate from '$lib/components/LoginGate.svelte';
  import ReadTab from '$lib/components/ReadTab.svelte';
  import VocabTab from '$lib/components/VocabTab.svelte';

  // `data` comes from +layout.ts (the browser Supabase client + session/user, used for the
  // login gate and auth). App data (deck/prefs/daily) comes from the getData() remote query.
  let { data } = $props();
  // getData() is called unconditionally (it returns empty data when logged out). The layout's
  // auth listener calls getData().refresh() on sign in/out, which reactively updates `app` here.
  const app = $derived(await getData());

  type Tab = 'read' | 'vocab' | 'settings';
  const TABS: { id: Tab; label: string }[] = [
    { id: 'read', label: 'Read' },
    { id: 'vocab', label: 'Vocab' },
    { id: 'settings', label: 'Settings' },
  ];
  let tab = $state<Tab>('read');

  const THEMES: Theme[] = ['paper', 'ink', 'tea', 'slate', 'bone', 'dusk'];

  const theme = $derived(app.prefs.theme ?? 'paper');
  $effect(() => { document.documentElement.setAttribute('data-theme', theme); });
  function setTheme(t: Theme) {
    document.documentElement.setAttribute('data-theme', t); // optimistic
    saveTheme({ theme: t });
  }
</script>

<svelte:head><title>srsly · Svelte PoC</title></svelte:head>

<div style="position:relative; z-index:1; max-width:1200px; margin:0 auto; padding:0 28px 64px;">
  <header style="display:flex; justify-content:space-between; align-items:center; padding:28px 0 20px; flex-wrap:wrap; gap:12px;">
    <div style="display:flex; align-items:baseline; gap:10px;">
      <span style="font-family:var(--f-display); font-size:26px; font-weight:500; letter-spacing:-.02em;">srsly</span>
      <span style="font-family:var(--f-mono); font-size:10px; letter-spacing:.18em; text-transform:uppercase; color:var(--ink-faint); border:1px solid var(--line); border-radius:5px; padding:2px 6px;">svelte poc</span>
    </div>
    {#if data.user}
      <div style="display:flex; gap:10px; align-items:center;">
        <div style="display:flex; gap:6px; align-items:center;">
          {#each THEMES as t (t)}
            <button onclick={() => setTheme(t)} aria-label={t} title={t}
              style="width:20px; height:20px; border-radius:50%; cursor:pointer;
                border:{theme === t ? '2px solid var(--ink)' : '1px solid var(--line)'}; background:var(--card);"></button>
          {/each}
        </div>
        <span style="font-family:var(--f-mono); font-size:11px; color:var(--ink-faint);">{data.user.is_anonymous ? 'guest' : data.user.email}</span>
        <button onclick={() => data.supabase.auth.signOut()}
          style="font-family:var(--f-mono); font-size:11px; letter-spacing:.06em; background:var(--card); border:1px solid var(--line); color:var(--ink-soft); border-radius:7px; padding:6px 11px; cursor:pointer;">Sign out</button>
      </div>
    {/if}
  </header>

  {#if !data.user}
    <LoginGate supabase={data.supabase} />
  {:else}
    <nav style="display:flex; gap:2px;">
      {#each TABS as t (t.id)}
        <button onclick={() => (tab = t.id)}
          style="font-family:var(--f-mono); font-size:12px; letter-spacing:.08em; text-transform:uppercase;
            padding:11px 20px; cursor:pointer; border:1px solid var(--line); border-bottom:none; border-radius:8px 8px 0 0; margin-bottom:-1px;
            background:{tab === t.id ? 'var(--card)' : 'transparent'}; color:{tab === t.id ? 'var(--ink)' : 'var(--ink-faint)'}; font-weight:{tab === t.id ? 500 : 400};"
        >{t.label}</button>
      {/each}
    </nav>

    <main>
      {#if tab === 'read'}
        <ReadTab deck={app.deck} daily={app.daily} hskLevel={app.prefs.hskLevel} onNavigateVocab={() => (tab = 'vocab')} />
      {:else if tab === 'vocab'}
        <VocabTab deck={app.deck} />
      {:else}
        <div class="animate-rise" style="background:var(--card); border:1px solid var(--line); border-radius:0 12px 12px 12px; padding:32px 36px;">
          <div style="font-family:var(--f-mono); font-size:11px; letter-spacing:.2em; text-transform:uppercase; color:var(--ink-faint);">Settings</div>
          <div style="margin-top:16px;">
            <div style="font-size:13.5px; color:var(--ink-soft);">HSK level</div>
            <div style="display:flex; gap:6px; margin-top:8px;">
              {#each [1, 2, 3, 4, 5, 6] as n (n)}
                <button onclick={() => saveLevel({ hskLevel: n })}
                  style="font-family:var(--f-mono); font-size:12px; padding:8px 14px; border-radius:7px; cursor:pointer;
                    border:1px solid {app.prefs.hskLevel === n ? 'var(--ink)' : 'var(--line)'};
                    background:{app.prefs.hskLevel === n ? 'var(--ink)' : 'var(--card)'};
                    color:{app.prefs.hskLevel === n ? 'var(--paper)' : 'var(--ink-soft)'};">{n}</button>
              {/each}
            </div>
            <div style="display:flex; gap:8px; margin-top:24px; flex-wrap:wrap;">
              <button onclick={() => seedDemo()}
                style="font-family:var(--f-mono); font-size:11px; letter-spacing:.06em; text-transform:uppercase; background:none; border:1px solid var(--line); border-radius:7px; padding:9px 14px; color:var(--ink-soft); cursor:pointer;">Seed demo words</button>
              <button onclick={() => clearDeck()}
                style="font-family:var(--f-mono); font-size:11px; letter-spacing:.06em; text-transform:uppercase; background:none; border:1px solid var(--line); border-radius:7px; padding:9px 14px; color:var(--ink-soft); cursor:pointer;">Clear deck</button>
            </div>
            <p style="font-size:12.5px; color:var(--ink-faint); margin-top:16px; line-height:1.5;">
              Deck, prefs, and today's content persist to Supabase (table <code style="font-family:var(--f-mono);">poc_user_data</code>), loaded via SvelteKit <strong>remote functions</strong> (<code style="font-family:var(--f-mono);">src/lib/data.remote.ts</code>). No client stores, no <code style="font-family:var(--f-mono);">+page.server.ts</code>.
            </p>
          </div>
        </div>
      {/if}
    </main>
  {/if}

  <footer style="text-align:center; padding:40px 0; font-size:12px; color:var(--ink-faint);">srsly.</footer>
</div>
