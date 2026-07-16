<script lang="ts">
  import type { PassageToken, DeckWord, LanguageCode } from '$lib/types';
  import type { StoredPassage } from '$lib/tokens';
  import { buildTokens } from '$lib/tokens';
  import { isActive, isDue } from '$lib/deck';
  import type { FsrsGrade } from '$lib/srs';
  import { addWord, generatePassage, gradeCloze, saveBoundaries, saveClozeProgress } from '$lib/data.remote';
  import ClickableWord from './ClickableWord.svelte';
  import ClozeBlank from './ClozeBlank.svelte';
  import WordPopup, { type PopupData } from './WordPopup.svelte';

  // Reading tab. Data comes from load() via props; mutations go through form actions. Due deck
  // words in the passage are inline cloze blanks — you fill them in as you read, then Finish
  // grades them through ts-fsrs. Raw tokens already carry reading/meaning baked in server-side
  // (src/lib/server/generate.ts), so building tokens here is just a plain mapping.
  interface Props {
    deck: DeckWord[];
    storedPassage: StoredPassage | null;
    language: LanguageCode;
    hskLevel: number;
    showWordBoundaries: boolean;
    onNavigateVocab: () => void;
  }
  let { deck, storedPassage, language, hskLevel, showWordBoundaries, onNavigateVocab }: Props = $props();

  // Optimistic local mirror of the persisted pref, same pattern as SettingsTab's `level`.
  let boundaries = $derived(showWordBoundaries);
  function toggleBoundaries() {
    boundaries = !boundaries;
    saveBoundaries({ showWordBoundaries: boundaries });
  }

  let generating = $state(false);
  let genError = $state('');
  let popup = $state<PopupData | null>(null);
  let showNoDuePopup = $state(false);
  // Cloze answers this session, keyed by the token's index in passage.body.
  let clozeAnswers = $state<Map<string, { word: string; correct: boolean }>>(new Map());

  const deckWords = $derived(new Set(deck.map((d) => d.h)));
  const hasDueWords = $derived(deck.some((w) => isDue(w)));
  // Which words are blanks — frozen at generation time (storedPassage.quizWords), not re-derived
  // from live due-status: under short-term scheduling a word can leave the due set within minutes
  // of being graded, and blanks shouldn't disappear out from under an in-progress passage.
  const quizWords = $derived(new Set(storedPassage?.quizWords ?? []));
  // Words added while reading THIS passage specifically (not "any new card in the deck") — so the
  // green "+" badge only lights up here, not in every other passage the word happens to appear in.
  const addedWords = $derived(new Set(storedPassage?.addedWords ?? []));

  const passage = $derived.by(() => {
    const raw = storedPassage?.passage;
    if (!raw) return null;
    return {
      title: buildTokens(raw.title),
      body: buildTokens(raw.body),
    };
  });

  const isBlank = (t: PassageToken) => t.type === 'vocab' && quizWords.has(t.text);
  const blankCount = $derived(passage ? passage.body.filter(isBlank).length : 0);
  const charCount = $derived(passage ? passage.body.filter((t) => /[一-鿿]/.test(t.text)).length : 0);

  let finished = $state(false);

  // Restore persisted blank progress once per passage row (id changes on every "+ New passage" —
  // a fresh row has empty progress, so this doubles as the reset for a newly generated passage).
  let restoredForId = '';
  $effect(() => {
    if (!passage || !storedPassage) return;
    if (restoredForId === storedPassage.id) return;
    restoredForId = storedPassage.id;
    const restored = new Map<string, { word: string; correct: boolean }>();
    for (const [occId, val] of Object.entries(storedPassage.progress)) {
      const tok = passage.body[Number(occId)];
      if (tok) restored.set(occId, { word: tok.text, correct: val === 1 });
    }
    clozeAnswers = restored;
    // Persisted progress that already covers every blank was graded in an earlier session —
    // mark it finished without re-grading (the auto-finish effect below only guards on `finished`,
    // so without this a reload of a completed passage would call gradeCloze a second time).
    finished = blankCount > 0 && restored.size >= blankCount;
  });

  function onCloze(occId: string, word: string, correct: boolean) {
    clozeAnswers = new Map(clozeAnswers).set(occId, { word, correct });
    if (storedPassage) saveClozeProgress({ passageId: storedPassage.id, occId, correct, lang: language });
  }

  // Grade automatically the moment every blank is filled, so there's nothing to click.
  // `finished` guards against re-firing on every subsequent render once blanks/answers settle.
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
    gradeCloze({ grades, lang: language });
  }

  function openPopup(e: MouseEvent, token: PassageToken) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const type: PopupData['type'] = deckWords.has(token.text) ? 'lookup' : 'free';
    popup = { word: token.text, pinyin: token.reading ?? '', meaning: token.meaning ?? '', type, anchorRect: rect };
  }
  async function addVocab(word: string, pinyin: string, meaning: string) {
    await addWord({ h: word, p: pinyin, m: meaning, lang: language, dueInDays: 1, passageId: storedPassage?.id });
  }
  const isNewlyAdded = (t: PassageToken): boolean =>
    t.type === 'vocab' && !quizWords.has(t.text) && addedWords.has(t.text) && deckWords.has(t.text);

  async function generate(force = false) {
    generating = true;
    genError = '';
    const words = deck.filter((w) => isDue(w) || (force && isActive(w))).map((w) => ({ h: w.h, p: w.p, m: w.m }));
    const r = await generatePassage({ lang: language, words });
    generating = false;
    if (r?.error) genError = r.error;
  }

  // Entry point for both "Generate passage" and "+ New passage": if there's a deck but nothing
  // in it is due yet, ask first instead of silently generating a passage with no review blanks.
  function requestGenerate() {
    if (deck.length > 0 && !hasDueWords) { showNoDuePopup = true; return; }
    generate();
  }
  function reviewAnyway() {
    showNoDuePopup = false;
    generate(true);
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
          <span style="font-size:9px; letter-spacing:.06em; background:var(--jade-soft); color:var(--jade); border:1px solid color-mix(in srgb, var(--jade) 30%, transparent); border-radius:4px; padding:1px 5px;">✦ AI · {storedPassage?.date}</span>
        {/if}
      </div>
      {#if passage}
        <div style="font-family:var(--f-han); font-size:26px; font-weight:500; letter-spacing:-.01em; margin-top:4px;">
          {#each passage.title as t, i (i)}
            <ClickableWord token={t} onOpen={openPopup} newlyAdded={isNewlyAdded(t)} showBoundaries={boundaries} />
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
    <div style="display:flex; justify-content:flex-end; margin-top:12px;">
      <button onclick={toggleBoundaries}
        style="font-family:var(--f-mono); font-size:11px; letter-spacing:.08em; text-transform:uppercase; font-weight:500;
          padding:6px 12px; border-radius:7px; cursor:pointer; transition:all .15s;
          border:1px solid {boundaries ? 'var(--ink)' : 'var(--line)'};
          background:{boundaries ? 'var(--ink)' : 'var(--card)'};
          color:{boundaries ? 'var(--paper)' : 'var(--ink-soft)'};">
        Boundaries
      </button>
    </div>
    <div style="font-family:var(--f-han); font-size:21px; line-height:2.6; margin-top:8px;">
      {#each passage.body as t, ti (ti)}
        {#snippet clickable()}
            <ClickableWord token={t} onOpen={openPopup} newlyAdded={isNewlyAdded(t)} showBoundaries={boundaries} />
        {/snippet}
        {#if isBlank(t)}
          {@const occId = `${ti}`}
          {@const restored = clozeAnswers.get(occId)}
          {#key restored ? 'restored' : 'fresh'}
            <ClozeBlank
              token={t}
              showHint={true}
              onGrade={(c) => onCloze(occId, t.text, c)}
              initialGrade={restored ? { correct: restored.correct } : undefined}
            >
              {@render clickable()}
            </ClozeBlank>
          {/key}
        {:else}
          {@render clickable()}
        {/if}
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
        <button onclick={requestGenerate}
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
      <button onclick={deck.length === 0 ? onNavigateVocab : requestGenerate}
        style="font-family:var(--f-mono); font-size:12px; letter-spacing:.08em; text-transform:uppercase; font-weight:500;
          background:var(--accent); color:#fff; border:none; border-radius:8px; padding:12px 20px; cursor:pointer; box-shadow:0 2px 0 var(--accent-deep);">
        {deck.length === 0 ? 'Add words in Vocab' : 'Generate passage'}
      </button>
    </div>
  {/if}
</div>

<WordPopup data={popup} onClose={() => (popup = null)} onAddVocab={addVocab} />

{#if showNoDuePopup}
  <div
    role="presentation"
    onclick={() => (showNoDuePopup = false)}
    style="position:fixed; inset:0; z-index:9998; display:flex; align-items:center; justify-content:center;
      background:rgba(0,0,0,.35); padding:24px;"
  >
    <div
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={() => {}}
      style="width:100%; max-width:360px; background:var(--card); border:1px solid var(--line); border-radius:14px;
        padding:24px 26px; box-shadow:0 8px 32px rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.14);"
    >
      <div style="font-family:var(--f-display); font-size:18px; font-weight:500;">No words due yet</div>
      <p style="color:var(--ink-soft); font-size:13.5px; line-height:1.6; margin:10px 0 22px;">
        Nothing in your deck is due for review right now. You can still generate a passage built around
        your next-due words if you'd like to get ahead.
      </p>
      <div style="display:flex; gap:10px; justify-content:flex-end;">
        <button onclick={() => (showNoDuePopup = false)}
          style="font-family:var(--f-mono); font-size:12px; letter-spacing:.06em; text-transform:uppercase;
            background:none; color:var(--ink-soft); border:1px solid var(--line); border-radius:8px; padding:9px 16px; cursor:pointer;">
          Cancel
        </button>
        <button onclick={reviewAnyway}
          style="font-family:var(--f-mono); font-size:12px; letter-spacing:.06em; text-transform:uppercase; font-weight:500;
            background:var(--accent); color:#fff; border:none; border-radius:8px; padding:9px 16px; cursor:pointer;
            box-shadow:0 2px 0 var(--accent-deep);">
          Review anyway
        </button>
      </div>
    </div>
  </div>
{/if}
