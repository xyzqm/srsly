<script lang="ts">
  import type { DeckWord, LanguageCode, Theme } from '$lib/types';
  import type { StoredPassage } from '$lib/tokens';
  import { SUPPORTED_LANGUAGES } from '$lib/languageConfig';
  import { getDeck, getPrefs, getPassage, getPoolWords, updatePrefs } from '$lib/data.remote';
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
  // `deck` and `passage` are parameterized by language, but SvelteKit's remote-query cache is
  // reference-counted, not persistent: a cache entry is evicted once nothing live points at it
  // (see @sveltejs/kit's remote-functions/cache.svelte.js). Deriving just `getDeck(prefs.language)`
  // would mean only the *current* language's entry stays referenced — switching away drops the
  // other language's entry, so switching back is a fresh fetch every time, not a cache hit.
  // Awaiting every language in SUPPORTED_LANGUAGES unconditionally (via one Promise.all, so the
  // svelte:boundary in +layout.svelte still suspends on it like any other top-level await) keeps
  // every entry pinned for as long as this page is mounted, so language switches are instant
  // after the first load of each — and it scales to however many languages srsly ends up
  // supporting, with nothing here naming 'zh'/'ja' specifically.
  const prefs = $derived(await getPrefs());
  const decks = $derived(await Promise.all(SUPPORTED_LANGUAGES.map((lang) => getDeck(lang))));
  const passages = $derived(await Promise.all(SUPPORTED_LANGUAGES.map((lang) => getPassage(lang))));
  const poolWordsList = $derived(await Promise.all(SUPPORTED_LANGUAGES.map((lang) => getPoolWords(lang))));
  const deckByLang = $derived(
    Object.fromEntries(SUPPORTED_LANGUAGES.map((lang, i) => [lang, decks[i]])) as Record<LanguageCode, DeckWord[]>,
  );
  const passageByLang = $derived(
    Object.fromEntries(SUPPORTED_LANGUAGES.map((lang, i) => [lang, passages[i]])) as Record<LanguageCode, StoredPassage | null>,
  );
  const poolWordsByLang = $derived(
    Object.fromEntries(SUPPORTED_LANGUAGES.map((lang, i) => [lang, poolWordsList[i]])) as Record<LanguageCode, DeckWord[]>,
  );
  const deck = $derived(deckByLang[prefs.language]);
  const passage = $derived(passageByLang[prefs.language]);
  const poolWords = $derived(poolWordsByLang[prefs.language]);

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
    updatePrefs({ prefs: { ...prefs, theme: t } });
  }
  function setLanguage(l: LanguageCode) {
    updatePrefs({ prefs: { ...prefs, language: l } });
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
        <ReadTab deck={deck} poolWords={poolWords} storedPassage={passage} prefs={prefs} onNavigateVocab={() => (tab = 'vocab')} />
      {:else if tab === 'vocab'}
        <VocabTab deck={deck} language={prefs.language} />
      {:else}
        <SettingsTab prefs={prefs} />
      {/if}
    </main>
  {/if}

  <footer style="text-align:center; padding:40px 0; font-size:12px; color:var(--ink-faint);">srsly.</footer>
</div>
