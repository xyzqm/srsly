<script lang="ts">
  import type { LanguageCode, Theme } from '$lib/types';
  import { SUPPORTED_LANGUAGES } from '$lib/languageConfig';
  import { getDeck, getPrefs, getPassage, saveTheme, saveLanguage } from '$lib/data.remote';
  import LoginGate from '$lib/components/LoginGate.svelte';
  import ReadTab from '$lib/components/ReadTab.svelte';
  import VocabTab from '$lib/components/VocabTab.svelte';
  import SettingsTab from '$lib/components/SettingsTab.svelte';

  // `data` comes from +layout.ts (the browser Supabase client + session/user, used for the
  // login gate and auth). App data comes from three independent remote queries — deck, prefs,
  // passage — so e.g. adding a word doesn't invalidate prefs or today's passage.
  let { data } = $props();
  // Each query is called unconditionally (it returns empty data when logged out). The layout's
  // auth listener calls .refresh() on all three on sign in/out, which reactively updates these.
  // `deck` and `passage` re-fetch whenever the selected study language changes, since both are
  // parameterized by language — this is the one place that picks which language's data to load.
  const prefs = $derived(await getPrefs());
  const deck = $derived(await getDeck(prefs.language));
  const passage = $derived(await getPassage(prefs.language));

  type Tab = 'read' | 'vocab' | 'settings';
  const TABS: { id: Tab; label: string }[] = [
    { id: 'read', label: 'Read' },
    { id: 'vocab', label: 'Vocab' },
    { id: 'settings', label: 'Settings' },
  ];
  let tab = $state<Tab>('read');

  const THEMES: Theme[] = ['paper', 'ink', 'tea', 'slate', 'bone', 'dusk'];
  // Single-glyph selector labels — presentation only; which languages exist comes from
  // SUPPORTED_LANGUAGES (svelte-poc/src/lib/languageConfig.ts), the shared source of truth.
  const LANGUAGE_LABELS: Record<LanguageCode, string> = { zh: '中', ja: 'あ' };

  let theme = $derived(prefs.theme ?? 'paper');
  $effect(() => { document.documentElement.setAttribute('data-theme', theme); });
  function setTheme(t: Theme) {
    theme = t;
    saveTheme({ theme: t });
  }
  function setLanguage(l: LanguageCode) {
    saveLanguage({ language: l });
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
        <div style="display:flex; gap:2px; align-items:center; border:1px solid var(--line); border-radius:7px; padding:2px;">
          {#each SUPPORTED_LANGUAGES as l (l)}
            <button onclick={() => setLanguage(l)} aria-label={l} title={l}
              style="font-family:var(--f-han); font-size:13px; line-height:1; width:24px; height:24px; border-radius:5px; cursor:pointer; border:none;
                background:{prefs.language === l ? 'var(--ink)' : 'transparent'}; color:{prefs.language === l ? 'var(--paper)' : 'var(--ink-soft)'};"
            >{LANGUAGE_LABELS[l]}</button>
          {/each}
        </div>
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
        <ReadTab deck={deck} storedPassage={passage} language={prefs.language} hskLevel={prefs.hskLevel} showWordBoundaries={prefs.showWordBoundaries} onNavigateVocab={() => (tab = 'vocab')} />
      {:else if tab === 'vocab'}
        <VocabTab deck={deck} language={prefs.language} />
      {:else}
        <SettingsTab prefs={prefs} />
      {/if}
    </main>
  {/if}

  <footer style="text-align:center; padding:40px 0; font-size:12px; color:var(--ink-faint);">srsly.</footer>
</div>
