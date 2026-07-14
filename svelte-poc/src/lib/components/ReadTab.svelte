<script lang="ts">
  import { onMount } from 'svelte';
  import type { PassageToken, DeckWord } from '$lib/types';
  import type { StoredDaily } from '$lib/tokens';
  import { buildTokens } from '$lib/tokens';
  import { groupReadings } from '$lib/readings';
  import { preloadDict } from '$lib/data/lookup';
  import { isDueToday } from '$lib/deck';
  import { isNew, type FsrsGrade } from '$lib/srs';
  import { addWord, generatePassage, gradeCloze } from '$lib/data.remote';
  import ClickableWord from './ClickableWord.svelte';
  import ClozeBlank from './ClozeBlank.svelte';
  import WordPopup, { type PopupData } from './WordPopup.svelte';

  // Reading tab. Data comes from load() via props; mutations go through form actions. Due deck
  // words in the passage are inline cloze blanks — you fill them in as you read, then Finish
  // grades them through ts-fsrs. Raw tokens from Supabase are normalized here with the client dict.
  interface Props {
    deck: DeckWord[];
    daily: StoredDaily | null;
    hskLevel: number;
    onNavigateVocab: () => void;
  }
  let { deck, daily, hskLevel, onNavigateVocab }: Props = $props();

  let dictReady = $state(false);
  let generating = $state(false);
  let genError = $state('');
  let popup = $state<PopupData | null>(null);
  // Cloze answers this session, keyed by "${sentenceIdx}-${tokenIdx}".
  let clozeAnswers = $state<Map<string, { word: string; correct: boolean }>>(new Map());

  onMount(async () => { await preloadDict('zh'); dictReady = true; });

  const deckWords = $derived(new Set(deck.map((d) => d.h)));
  const status = $derived.by(() => {
    const due = new Set<string>();
    const pending = new Set<string>();
    for (const w of deck) {
      if (isDueToday(w)) due.add(w.h);
      else if (isNew(w)) pending.add(w.h);
    }
    return { due, pending };
  });

  const passage = $derived.by(() => {
    const raw = daily?.passages[0];
    if (!raw || !dictReady) return null;
    const readings = groupReadings(deck);
    return {
      title: buildTokens(raw.title, status.due, readings),
      sentences: raw.sentences.map((s) => buildTokens(s, status.due, readings)),
    };
  });

  const isBlank = (t: PassageToken) => t.type === 'vocab' && status.due.has(t.text);
  const blankCount = $derived(passage ? passage.sentences.flat().filter(isBlank).length : 0);
  const charCount = $derived(passage ? passage.sentences.flat().filter((t) => /[一-鿿]/.test(t.text)).length : 0);

  // Reset cloze answers when the passage content changes (a newly generated passage), but keep
  // them across the same-content reload that follows grading (so the summary survives).
  const passageKey = $derived(daily?.passages[0] ? JSON.stringify(daily.passages[0].title) : '');
  let lastKey = '';
  let finished = $state(false);
  $effect(() => { if (passageKey !== lastKey) { lastKey = passageKey; clozeAnswers = new Map(); finished = false; } });

  function onCloze(occId: string, word: string, correct: boolean) {
    clozeAnswers = new Map(clozeAnswers).set(occId, { word, correct });
  }

  // Grade automatically the moment every blank is filled, so there's nothing to click.
  // `finished` guards against re-firing if blanks/answers are still around (unchanged) after
  // grading — e.g. a word graded "Again" that's still due today.
  $effect(() => { if (blankCount > 0 && clozeAnswers.size >= blankCount && !finished) { finished = true; finish(); } });

  const summary = $derived.by(() => {
    let correct = 0;
    for (const a of clozeAnswers.values()) if (a.correct) correct++;
    return { correct, total: clozeAnswers.size };
  });

  async function finish() {
    // Worst grade per word (a word may appear in several blanks): correct → Good (3), miss → Again (1).
    const grades: Record<string, FsrsGrade> = {};
    for (const { word, correct } of clozeAnswers.values()) {
      const g: FsrsGrade = correct ? 3 : 1;
      grades[word] = Math.min(grades[word] ?? Infinity, g) as FsrsGrade;
    }
    console.log(grades);
    gradeCloze({ grades });
  }

  function openPopup(e: MouseEvent, token: PassageToken) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const type: PopupData['type'] = deckWords.has(token.text) ? 'lookup' : 'free';
    popup = { word: token.text, pinyin: token.reading ?? '', meaning: token.meaning ?? '', type, anchorRect: rect };
  }
  async function addVocab(word: string, pinyin: string, meaning: string) {
    await addWord({ h: word, p: pinyin, m: meaning, dueInDays: 1 });
  }
  const claimKindFor = (t: PassageToken): 'vocab' | null =>
    t.type === 'vocab' && !status.due.has(t.text) && status.pending.has(t.text) ? 'vocab' : null;

  async function generate() {
    generating = true;
    genError = '';
    const r = await generatePassage();
    generating = false;
    if (r?.error) genError = r.error;
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
        {#if passage}
          <span style="font-size:9px; letter-spacing:.06em; background:var(--jade-soft); color:var(--jade); border:1px solid color-mix(in srgb, var(--jade) 30%, transparent); border-radius:4px; padding:1px 5px;">✦ AI · {daily?.date}</span>
        {/if}
      </div>
      {#if passage}
        <div style="font-family:var(--f-han); font-size:26px; font-weight:500; letter-spacing:-.01em; margin-top:4px;">
          {#each passage.title as t, i (i)}
            <ClickableWord token={t} onOpen={openPopup} claimKind={claimKindFor(t)} isReviewWord={status.due.has(t.text) && t.type === 'vocab'} />
          {/each}
        </div>
      {/if}
    </div>
    <div style="font-family:var(--f-mono); font-size:11px; color:var(--ink-faint); letter-spacing:.05em;">
      level <span style="color:var(--jade); font-weight:500;">HSK {hskLevel}</span>{#if passage} · ~{charCount} 字{/if}
    </div>
  </div>

  {#if generating}
    <p style="font-family:var(--f-mono); font-size:12.5px; color:var(--ink-faint); line-height:1.5; margin:12px 0 16px;">
      Writing today's passage around your due words — this usually takes about 20–35 seconds.
    </p>
    <div class="shimmer" style="height:16px; border-radius:4px; margin-bottom:10px;"></div>
    <div class="shimmer" style="height:16px; width:92%; border-radius:4px; margin-bottom:10px;"></div>
    <div class="shimmer" style="height:16px; width:85%; border-radius:4px;"></div>
  {:else if passage}
    {#if blankCount > 0}
      <p style="font-family:var(--f-mono); font-size:11.5px; color:var(--ink-faint); letter-spacing:.04em; margin:10px 0 4px;">
        Fill in the underlined review words as you read — type the characters, then press Enter.
      </p>
    {/if}
    <div style="font-family:var(--f-han); font-size:21px; line-height:2.6; margin-top:12px;">
      {#each passage.sentences as s, si (si)}
        <span>
          {#each s as t, ti (ti)}
            {#if isBlank(t)}
              {@const occId = `${si}-${ti}`}
              <ClozeBlank token={t} showHint={true} onGrade={(c) => onCloze(occId, t.text, c)} />
            {:else}
              <ClickableWord token={t} onOpen={openPopup} claimKind={claimKindFor(t)} isReviewWord={false} />
            {/if}
          {/each}
        </span>
      {/each}
    </div>

    <div style="margin-top:28px; padding-top:20px; border-top:1px solid var(--line); display:flex; gap:12px; justify-content:center; align-items:center; flex-wrap:wrap;">
      {#if !finished}
        <span style="font-family:var(--f-mono); font-size:12px; letter-spacing:.06em; color:var(--ink-faint);">
          {clozeAnswers.size}/{blankCount} blanks filled
        </span>
      {:else}
        {#if summary.total > 0}
          <span style="font-family:var(--f-mono); font-size:12px; color:var(--jade); letter-spacing:.04em;">
            ✓ Reviewed {summary.total} word{summary.total === 1 ? '' : 's'} · {summary.correct} correct
          </span>
        {/if}
        <button onclick={generate}
          style="font-family:var(--f-mono); font-size:12px; letter-spacing:.1em; text-transform:uppercase; font-weight:500;
            background:none; color:var(--ink); border:1px solid var(--line); border-radius:8px; padding:12px 20px; cursor:pointer;">
          + New passage
        </button>
      {/if}
    </div>
  {:else}
    <div style="text-align:center; padding:56px 24px;">
      <div style="font-family:var(--f-display); font-size:22px; font-weight:500;">{genError ? "Couldn't generate a passage" : 'No passage yet'}</div>
      <p style="color:var(--ink-soft); font-size:13.5px; line-height:1.6; margin:10px auto 24px; max-width:400px;">
        {#if genError}
          {genError.includes('no-api-key') ? 'No API key configured (set SRSLY_API_KEY in svelte-poc/.env).' : 'Something went wrong. Try again.'}
        {:else if deck.length === 0}
          Add a few words in Vocab, then generate a passage built around them.
        {:else}
          Generate a passage built around your due words — they'll appear as blanks to fill in as you read.
        {/if}
      </p>
      <button onclick={deck.length === 0 ? onNavigateVocab : generate}
        style="font-family:var(--f-mono); font-size:12px; letter-spacing:.08em; text-transform:uppercase; font-weight:500;
          background:var(--accent); color:#fff; border:none; border-radius:8px; padding:12px 20px; cursor:pointer; box-shadow:0 2px 0 var(--accent-deep);">
        {deck.length === 0 ? 'Add words in Vocab' : 'Generate passage'}
      </button>
    </div>
  {/if}
</div>

<WordPopup data={popup} onClose={() => (popup = null)} onAddVocab={addVocab} />
