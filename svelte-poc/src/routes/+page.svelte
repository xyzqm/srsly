<script lang="ts">
  import { onMount } from 'svelte';
  import { getDeckStore } from '$lib/stores/deck.svelte';
  import { getDailyStore } from '$lib/stores/daily.svelte';
  import { getThemeStore, THEMES } from '$lib/stores/theme.svelte';
  import { storage } from '$lib/storage';
  import { levelFor } from '$lib/languageConfig';
  import ReadTab from '$lib/components/ReadTab.svelte';
  import VocabTab from '$lib/components/VocabTab.svelte';

  // Port of app/page.tsx's AppShell — tab switching between Read / Vocab / Settings.
  type Tab = 'read' | 'vocab' | 'settings';
  const TABS: { id: Tab; label: string }[] = [
    { id: 'read', label: 'Read' },
    { id: 'vocab', label: 'Vocab' },
    { id: 'settings', label: 'Settings' },
  ];

  const deckStore = getDeckStore();
  const daily = getDailyStore();
  const theme = getThemeStore();

  let tab = $state<Tab>('read');
  let hskLevel = $state(3);
  let booted = $state(false);

  onMount(async () => {
    await theme.load();
    await deckStore.load('zh');
    const prefs = await storage.getPrefs();
    hskLevel = levelFor('zh', prefs);
    booted = true;
    // Load today's cached passage (or leave it to the Generate button if none).
    await daily.load(hskLevel, deckStore.deck, 'zh');
  });

  function goVocab() { tab = 'vocab'; }
</script>

<svelte:head><title>srsly · Svelte PoC</title></svelte:head>

<div style="position:relative; z-index:1; max-width:1200px; margin:0 auto; padding:0 28px 64px;">
  <header style="display:flex; justify-content:space-between; align-items:center; padding:28px 0 20px; flex-wrap:wrap; gap:12px;">
    <div style="display:flex; align-items:baseline; gap:10px;">
      <span style="font-family:var(--f-display); font-size:26px; font-weight:500; letter-spacing:-.02em;">srsly</span>
      <span style="font-family:var(--f-mono); font-size:10px; letter-spacing:.18em; text-transform:uppercase; color:var(--ink-faint); border:1px solid var(--line); border-radius:5px; padding:2px 6px;">
        svelte poc
      </span>
    </div>
    <div style="display:flex; gap:6px; align-items:center;">
      {#each THEMES as t (t)}
        <button
          onclick={() => theme.set(t)}
          aria-label={t}
          title={t}
          style="width:20px; height:20px; border-radius:50%; cursor:pointer;
            border:{theme.theme === t ? '2px solid var(--ink)' : '1px solid var(--line)'};
            background:var(--card);"
        ></button>
      {/each}
    </div>
  </header>

  <nav style="display:flex; gap:2px;">
    {#each TABS as t (t.id)}
      <button
        onclick={() => (tab = t.id)}
        style="font-family:var(--f-mono); font-size:12px; letter-spacing:.08em; text-transform:uppercase;
          padding:11px 20px; cursor:pointer; border:1px solid var(--line); border-bottom:none;
          border-radius:8px 8px 0 0; margin-bottom:-1px;
          background:{tab === t.id ? 'var(--card)' : 'transparent'};
          color:{tab === t.id ? 'var(--ink)' : 'var(--ink-faint)'};
          font-weight:{tab === t.id ? 500 : 400};"
      >{t.label}</button>
    {/each}
  </nav>

  <main>
    {#if !booted}
      <div style="padding:80px 0; text-align:center; color:var(--ink-faint); font-family:var(--f-mono); font-size:12px;">loading…</div>
    {:else if tab === 'read'}
      <ReadTab {hskLevel} onNavigateVocab={goVocab} />
    {:else if tab === 'vocab'}
      <VocabTab />
    {:else}
      <div
        class="animate-rise"
        style="background:var(--card); border:1px solid var(--line); border-radius:0 12px 12px 12px; padding:32px 36px;"
      >
        <div style="font-family:var(--f-mono); font-size:11px; letter-spacing:.2em; text-transform:uppercase; color:var(--ink-faint);">Settings</div>
        <div style="margin-top:16px;">
          <label for="lvl" style="font-size:13.5px; color:var(--ink-soft);">HSK level</label>
          <div style="display:flex; gap:6px; margin-top:8px;">
            {#each [1, 2, 3, 4, 5, 6] as n (n)}
              <button
                onclick={async () => { hskLevel = n; const p = await storage.getPrefs(); await storage.savePrefs({ ...p, hskLevel: n }); }}
                style="font-family:var(--f-mono); font-size:12px; padding:8px 14px; border-radius:7px; cursor:pointer;
                  border:1px solid {hskLevel === n ? 'var(--ink)' : 'var(--line)'};
                  background:{hskLevel === n ? 'var(--ink)' : 'var(--card)'};
                  color:{hskLevel === n ? 'var(--paper)' : 'var(--ink-soft)'};"
              >{n}</button>
            {/each}
          </div>
          <p style="font-size:12.5px; color:var(--ink-faint); margin-top:12px; line-height:1.5;">
            Six themes are live (top-right swatches). This PoC ports the Read → vocab loop; theme, HSK level,
            and the deck all persist to <code style="font-family:var(--f-mono);">localStorage</code> exactly like the React app.
          </p>
        </div>
      </div>
    {/if}
  </main>

  <footer style="text-align:center; padding:40px 0; font-size:12px; color:var(--ink-faint);">srsly.</footer>
</div>
