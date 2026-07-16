<script lang="ts">
  import type { DeckWord, LanguageCode } from '$lib/types';
  import { isActive, isDue, localDateTimeStr } from '$lib/deck';
  import { isNew } from '$lib/srs';
  import { addWord, removeWord, lookupWord } from '$lib/data.remote';

  // Vocab deck. Data via props (getDeck query), mutations via remote commands. Adding resolves
  // pinyin/meaning from the centralized word_definitions dictionary server-side, then persists
  // to Supabase.
  let { deck, language }: { deck: DeckWord[]; language: LanguageCode } = $props();

  let input = $state('');
  let adding = $state(false);
  let notFound = $state('');

  async function add() {
    const h = input.trim();
    if (!h) return;
    adding = true;
    notFound = '';
    const entry = await lookupWord({ word: h, lang: language });
    if (!entry.reading && !entry.meaning) notFound = `"${h}" isn't in the dictionary — added with a blank definition.`;
    await addWord({ h, p: entry.reading, m: entry.meaning, lang: language }); // due today (dueInDays 0)
    input = '';
    adding = false;
  }

  function statusOf(w: DeckWord): { label: string; color: string } {
    if (isDue(w)) return { label: 'due', color: 'var(--accent)' };
    return { label: `due ${localDateTimeStr(w.due)}`, color: isNew(w) ? 'var(--jade)': 'var(--ink-faint)' };
  }

  // Pool words are staged but not yet in circulation (lib/types.ts) — hidden here, same as
  // everywhere else "the deck" means the active deck. Most-due-first within what's left: sorting
  // by the raw `due` instant ascending puts everything already due (due <= now) first, in order,
  // then everything else in the order it'll become due.
  const visible = $derived(deck.filter(isActive).sort((a, b) => a.due.getTime() - b.due.getTime()));
</script>

<div
  class="animate-rise"
  style="background:var(--card); border:1px solid var(--line); border-radius:0 12px 12px 12px; padding:32px 36px;"
>
  <div style="font-family:var(--f-mono); font-size:11px; letter-spacing:.2em; text-transform:uppercase; color:var(--ink-faint);">
    Vocab deck · {visible.length} word{visible.length === 1 ? '' : 's'}
  </div>

  <div style="display:flex; gap:8px; margin:16px 0 6px; flex-wrap:wrap;">
    <input
      bind:value={input}
      onkeydown={(e) => { if (e.key === 'Enter') add(); }}
      placeholder="Add a word — e.g. 城市, 经济, 朋友"
      style="flex:1; min-width:180px; font-family:var(--f-han); font-size:16px; padding:10px 14px;
        background:var(--paper); border:1px solid var(--line); border-radius:8px; color:var(--ink);"
    />
    <button
      onclick={add}
      disabled={adding || !input.trim()}
      style="font-family:var(--f-mono); font-size:12px; letter-spacing:.08em; text-transform:uppercase; font-weight:500;
        background:var(--accent); color:#fff; border:none; border-radius:8px; padding:10px 18px; cursor:pointer;
        box-shadow:0 2px 0 var(--accent-deep); opacity:{adding || !input.trim() ? 0.5 : 1};"
    >{adding ? 'Adding…' : 'Add'}</button>
  </div>
  {#if notFound}
    <div style="font-size:12px; color:var(--ink-faint); margin-bottom:6px;">{notFound}</div>
  {/if}

  {#if visible.length === 0}
    <div style="text-align:center; padding:48px 24px; color:var(--ink-soft);">
      <div style="font-family:var(--f-display); font-size:20px; font-weight:500; color:var(--ink);">Your deck is empty</div>
      <p style="font-size:13.5px; line-height:1.6; margin-top:8px;">
        Add a few words above, then head to Read to get a passage built around them.
      </p>
    </div>
  {:else}
    <div style="margin-top:12px; display:flex; flex-direction:column;">
      {#each visible as w (w.id)}
        {@const st = statusOf(w)}
        <div style="display:flex; align-items:center; gap:14px; padding:12px 4px; border-bottom:1px solid var(--line-soft);">
          <span style="font-family:var(--f-han); font-size:22px; font-weight:500; min-width:2.5em;">{w.h}</span>
          <span style="font-family:var(--f-mono); font-size:12px; color:var(--accent); min-width:5em;">{w.p}</span>
          <span style="flex:1; font-size:13.5px; color:var(--ink-soft); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">{w.m || '—'}</span>
          <span style="font-family:var(--f-mono); font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:{st.color};">{st.label}</span>
          <button
            onclick={() => removeWord({id: w.id, lang: language})}
            aria-label="Remove"
            style="background:none; border:1px solid var(--line); border-radius:6px; color:var(--ink-faint); cursor:pointer; padding:4px 9px; font-size:13px;"
          >×</button>
        </div>
      {/each}
    </div>
  {/if}
</div>
