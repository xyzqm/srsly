<script lang="ts">
  import type { Prefs } from '$lib/server/data';
  import { updatePrefs, seedDemo, clearDeck } from '$lib/data.remote';

  // Settings tab. Level/wordsPerPassage are read from prefs (props) and saved via remote command;
  // seed/clear are one-shot remote commands with no local state to track.
  let { prefs }: { prefs: Prefs } = $props();
  let level = $derived(prefs.hskLevel);
  let wordsPerPassage = $derived(prefs.wordsPerPassage);
</script>

<div
  class="animate-rise"
  style="background:var(--card); border:1px solid var(--line); border-radius:0 12px 12px 12px; padding:32px 36px;"
>
  <div style="font-family:var(--f-mono); font-size:11px; letter-spacing:.2em; text-transform:uppercase; color:var(--ink-faint);">Settings</div>
  <div style="margin-top:16px;">
    <div style="font-size:13.5px; color:var(--ink-soft);">HSK level</div>
    <div style="display:flex; gap:6px; margin-top:8px;">
      {#each [1, 2, 3, 4, 5, 6] as n (n)}
        <button onclick={() => {
          level = n; // optimistic UI update
          updatePrefs({ prefs: { ...prefs, hskLevel: n } });
        }}
          style="font-family:var(--f-mono); font-size:12px; padding:8px 14px; border-radius:7px; cursor:pointer;
            border:1px solid {level === n ? 'var(--ink)' : 'var(--line)'};
            background:{level === n ? 'var(--ink)' : 'var(--card)'};
            color:{level === n ? 'var(--paper)' : 'var(--ink-soft)'};">{n}</button>
      {/each}
    </div>
    <div style="font-size:13.5px; color:var(--ink-soft); margin-top:22px;">Words per passage</div>
    <div style="display:flex; gap:6px; margin-top:8px;">
      {#each [3, 5, 8, 12, 15, 20] as n (n)}
        <button onclick={() => {
          wordsPerPassage = n; // optimistic UI update
          updatePrefs({ prefs: { ...prefs, wordsPerPassage: n } });
        }}
          style="font-family:var(--f-mono); font-size:12px; padding:8px 14px; border-radius:7px; cursor:pointer;
            border:1px solid {wordsPerPassage === n ? 'var(--ink)' : 'var(--line)'};
            background:{wordsPerPassage === n ? 'var(--ink)' : 'var(--card)'};
            color:{wordsPerPassage === n ? 'var(--paper)' : 'var(--ink-soft)'};">{n}</button>
      {/each}
    </div>
    <div style="display:flex; gap:8px; margin-top:24px; flex-wrap:wrap;">
      <button onclick={() => seedDemo()}
        style="font-family:var(--f-mono); font-size:11px; letter-spacing:.06em; text-transform:uppercase; background:none; border:1px solid var(--line); border-radius:7px; padding:9px 14px; color:var(--ink-soft); cursor:pointer;">Seed demo words</button>
      <button onclick={() => clearDeck({ lang: prefs.language })}
        style="font-family:var(--f-mono); font-size:11px; letter-spacing:.06em; text-transform:uppercase; background:none; border:1px solid var(--line); border-radius:7px; padding:9px 14px; color:var(--ink-soft); cursor:pointer;">Clear {prefs.language} deck</button>
    </div>
    <p style="font-size:12.5px; color:var(--ink-faint); margin-top:16px; line-height:1.5;">
      Deck words live one-per-row in <code style="font-family:var(--f-mono);">deck_words</code>; prefs are individual columns on <code style="font-family:var(--f-mono);">poc_user_data</code>. Both are loaded via SvelteKit <strong>remote functions</strong> (<code style="font-family:var(--f-mono);">src/lib/data.remote.ts</code>). No client stores, no <code style="font-family:var(--f-mono);">+page.server.ts</code>.
    </p>
  </div>
</div>
