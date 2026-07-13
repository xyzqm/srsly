<script lang="ts">
  import type { PassageToken } from '$lib/types';
  import { getDeckStore } from '$lib/stores/deck.svelte';
  import { getDailyStore } from '$lib/stores/daily.svelte';
  import { isDueToday, dayOffset } from '$lib/deck';
  import { isNew } from '$lib/srs';
  import ClickableWord from './ClickableWord.svelte';
  import WordPopup, { type PopupData } from './WordPopup.svelte';

  // Condensed port of components/read/ReadTab.tsx — the core Read → vocab loop:
  // render the AI passage, click a word to look it up / add it to the deck, and reflect
  // each deck word's due/pending scheduling state back onto the passage.
  interface Props {
    hskLevel: number;
    onNavigateVocab: () => void;
  }
  let { hskLevel, onNavigateVocab }: Props = $props();

  const deckStore = getDeckStore();
  const daily = getDailyStore();

  let popup = $state<PopupData | null>(null);
  let addedThisSession = $state<Set<string>>(new Set());

  const passage = $derived(daily.content?.passages[0]);
  const titleTokens = $derived(passage?.titleTokens ?? []);
  const sentences = $derived(passage?.sentences ?? []);

  const deckWords = $derived(new Set(deckStore.deck.map((d) => d.h)));
  const charCount = $derived(
    passage
      ? passage.sentences.flatMap((s) => s.tokens).filter((t) => /[一-鿿]/.test(t.text)).length
      : 0,
  );

  // Visual state per word, derived from SCHEDULING (survives reloads):
  //   due now → accent underline; pending (new, not yet due) → green '+'.
  const status = $derived.by(() => {
    const due = new Set<string>();
    const pending = new Set<string>();
    for (const w of deckStore.deck) {
      if (isDueToday(w)) { due.add(w.h); continue; }
      if (isNew(w)) pending.add(w.h); // added, not yet due
    }
    return { due, pending };
  });

  function openPopup(e: MouseEvent, token: PassageToken) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const inDeck = deckWords.has(token.text);
    const isDue = status.due.has(token.text);
    const type: PopupData['type'] = isDue ? 'vocab' : inDeck ? 'lookup' : 'free';
    popup = {
      word: token.text,
      pinyin: token.reading ?? '',
      meaning: token.meaning ?? '',
      type,
      anchorRect: rect,
    };
  }

  function addVocab(word: string, pinyin: string, meaning: string) {
    // Added while reading → due tomorrow (you just saw it in context).
    deckStore.addWord({ h: word, p: pinyin, m: meaning, due: dayOffset(1) });
    addedThisSession = new Set([...addedThisSession, word]);
  }

  function claimKindFor(t: PassageToken): 'vocab' | null {
    if (t.type !== 'vocab') return null;
    if (status.due.has(t.text)) return null; // review words use accent underline, not badge
    if (status.pending.has(t.text) || addedThisSession.has(t.text)) return 'vocab';
    return null;
  }

  async function generate() {
    await daily.generate(hskLevel, deckStore.deck, 'zh', Math.floor(Math.random() * 12));
  }
</script>

<div
  class="animate-rise"
  style="background:var(--card); border:1px solid var(--line); border-radius:0 12px 12px 12px;
    padding:32px 36px; box-shadow:0 1px 0 rgba(0,0,0,.02);"
>
  <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:8px; flex-wrap:wrap; gap:10px;">
    <div>
      <div style="font-family:var(--f-mono); font-size:11px; letter-spacing:.2em; text-transform:uppercase; color:var(--ink-faint); display:flex; align-items:center; gap:8px;">
        Today's passage
        {#if daily.status === 'ready' && daily.content?.sections?.passage}
          <span style="font-size:9px; letter-spacing:.06em; background:var(--jade-soft); color:var(--jade); border:1px solid color-mix(in srgb, var(--jade) 30%, transparent); border-radius:4px; padding:1px 5px;">
            ✦ AI · {daily.content.date}
          </span>
        {/if}
        {#if daily.status === 'loading'}
          <span style="font-size:9px; letter-spacing:.06em; color:var(--ink-faint); opacity:.6;">generating… ~20–35s</span>
        {/if}
        {#if daily.status === 'no-key'}
          <span style="font-size:9px; letter-spacing:.06em; color:var(--accent); font-family:var(--f-mono);">⚠ no API key</span>
        {/if}
        {#if daily.status === 'error'}
          <span style="font-size:9px; letter-spacing:.06em; color:var(--accent); font-family:var(--f-mono);">⚠ generation failed</span>
        {/if}
      </div>
      {#if daily.status === 'ready' && titleTokens.length}
        <div style="font-family:var(--f-han); font-size:26px; font-weight:500; letter-spacing:-.01em; margin-top:4px;">
          {#each titleTokens as t, i (i)}
            <ClickableWord token={t} onOpen={openPopup} claimKind={claimKindFor(t)} isReviewWord={status.due.has(t.text) && t.type === 'vocab'} />
          {/each}
        </div>
      {/if}
    </div>
    <div style="font-family:var(--f-mono); font-size:11px; color:var(--ink-faint); letter-spacing:.05em;">
      level <span style="color:var(--jade); font-weight:500;">HSK {hskLevel}</span> · ~{charCount} 字
    </div>
  </div>

  {#if daily.status === 'loading'}
    <p style="font-family:var(--f-mono); font-size:12.5px; color:var(--ink-faint); line-height:1.5; margin-bottom:16px;">
      Writing today's passage around your due words — this usually takes about 20–35 seconds.
    </p>
    <div class="shimmer" style="height:16px; border-radius:4px; margin-bottom:10px;"></div>
    <div class="shimmer" style="height:16px; width:92%; border-radius:4px; margin-bottom:10px;"></div>
    <div class="shimmer" style="height:16px; width:85%; border-radius:4px;"></div>
  {:else if daily.status === 'no-key'}
    <div style="text-align:center; padding:56px 24px;">
      <div style="font-family:var(--f-display); font-size:20px; font-weight:500;">No API key configured</div>
      <p style="color:var(--ink-soft); font-size:13.5px; line-height:1.6; margin:10px auto 0; max-width:380px;">
        Set <code style="font-family:var(--f-mono);">SRSLY_API_KEY</code> (or <code style="font-family:var(--f-mono);">ANTHROPIC_API_KEY</code>) in
        <code style="font-family:var(--f-mono);">svelte-poc/.env</code> to generate passages.
      </p>
    </div>
  {:else if daily.status === 'ready' && passage}
    <div style="font-family:var(--f-han); font-size:21px; line-height:2.6; margin-top:12px;" class="show-pinyin">
      {#each sentences as s, si (si)}
        <span>
          {#each s.tokens as t, ti (ti)}
            <ClickableWord token={t} onOpen={openPopup} claimKind={claimKindFor(t)} isReviewWord={status.due.has(t.text) && t.type === 'vocab'} />
          {/each}
        </span>
      {/each}
    </div>
    <div style="margin-top:28px; padding-top:20px; border-top:1px solid var(--line); display:flex; gap:10px; justify-content:center; flex-wrap:wrap;">
      <button
        onclick={generate}
        style="font-family:var(--f-mono); font-size:12px; letter-spacing:.1em; text-transform:uppercase; font-weight:500;
          background:none; color:var(--ink); border:1px solid var(--line); border-radius:8px; padding:12px 20px; cursor:pointer;"
      >+ New passage</button>
    </div>
  {:else}
    <div style="text-align:center; padding:56px 24px;">
      <div style="font-family:var(--f-display); font-size:22px; font-weight:500;">No passage yet</div>
      <p style="color:var(--ink-soft); font-size:13.5px; line-height:1.6; margin:10px auto 24px; max-width:380px;">
        Generate a passage built around your due words. Words you've added to your deck are woven in and marked for review.
      </p>
      <button
        onclick={generate}
        style="font-family:var(--f-mono); font-size:12px; letter-spacing:.08em; text-transform:uppercase; font-weight:500;
          background:var(--accent); color:#fff; border:none; border-radius:8px; padding:12px 20px; cursor:pointer; box-shadow:0 2px 0 var(--accent-deep);"
      >Generate passage</button>
      <div style="margin-top:16px;">
        <button
          onclick={onNavigateVocab}
          style="font-family:var(--f-mono); font-size:11px; letter-spacing:.06em; background:none; border:none; color:var(--ink-faint); cursor:pointer; text-decoration:underline;"
        >or add words in Vocab first →</button>
      </div>
    </div>
  {/if}
</div>

<WordPopup data={popup} onClose={() => (popup = null)} onAddVocab={addVocab} />
