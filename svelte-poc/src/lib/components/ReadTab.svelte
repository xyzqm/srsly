<script lang="ts">
  import type { PassageToken, DeckWord } from '$lib/types';
  import type { StoredPassage } from '$lib/tokens';
  import type { Prefs } from '$lib/server/data';
  import { buildTokens } from '$lib/tokens';
  import { isDueToday, formatDelay } from '$lib/deck';
  import type { FsrsGrade } from '$lib/srs';
  import { addWord, removeWord, generatePassage, gradeCloze, updatePrefs, saveClozeProgress, editWordDefinition, releaseFromPool, lookupWordInDb } from '$lib/data.remote';
  import ClickableWord from './ClickableWord.svelte';
  import ClozeBlank from './ClozeBlank.svelte';
  import WordPopup, { type PopupData } from './WordPopup.svelte';
  import ConfirmPopup from './ConfirmPopup.svelte';

  // Reading tab. Data comes from load() via props; mutations go through form actions. Due deck
  // words in the passage are inline cloze blanks — you fill them in as you read, then Finish
  // grades them through ts-fsrs. Raw tokens already carry reading/meaning baked in server-side
  // (src/lib/server/generate.ts), so building tokens here is just a plain mapping.
  interface Props {
    deck: DeckWord[];
    poolWords: DeckWord[];
    storedPassage: StoredPassage | null;
    prefs: Prefs;
    onNavigateVocab: () => void;
  }
  let { deck, poolWords, storedPassage, prefs, onNavigateVocab }: Props = $props();
  const language = $derived(prefs.language);
  const hskLevel = $derived(prefs.hskLevel);
  const wordsPerPassage = $derived(prefs.wordsPerPassage);

  // Optimistic local mirror of the persisted pref, same pattern as SettingsTab's `level`.
  let boundaries = $derived(prefs.showWordBoundaries);
  function toggleBoundaries() {
    boundaries = !boundaries;
    updatePrefs({ prefs: { ...prefs, showWordBoundaries: boundaries } });
  }

  let generating = $state(false);
  let genError = $state('');
  let popup = $state<PopupData | null>(null);
  let showNoMoreTodayPopup = $state(false);
  let showRegeneratePopup = $state(false);
  // Word pending removal, awaiting confirmation — closing WordPopup when this opens avoids two
  // fixed-position overlays (WordPopup's z-index 9999, ConfirmPopup's 9998) stacking wrong.
  let removeConfirm = $state<{ id: string; h: string } | null>(null);
  // Cloze answers this session, keyed by the token's index in passage.body.
  let clozeAnswers = $state<Map<string, { word: string; correct: boolean }>>(new Map());

  const deckWords = $derived(new Set(deck.map((d) => d.h)));
  // hanzi -> pool row id, so openPopup can recognize a pool word (and get the id it needs to
  // release it) synchronously — no per-click round trip, so no flash from one button color to
  // another once a check resolves.
  const poolWordIds = $derived(new Map(poolWords.map((w) => [w.h, w.id])));
  // Generation is allowed around anything due today (isDueToday) — reviewing a word scheduled for
  // later today needs no confirmation — but never beyond today, so there's no "force"/"review
  // anyway" escape hatch once today's words are exhausted.
  const hasDueToday = $derived(deck.some((w) => isDueToday(w)));
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
  // True while a just-completed passage's grades are being persisted — separate from `finished`
  // so the word-status summary doesn't reveal itself (and briefly flash pre-grade due dates,
  // since it reads them live off `deck`) until gradeCloze's `getDeck.set(...)` has actually landed.
  let grading = $state(false);

  // Restore persisted blank progress on mount/reload (`clozeAnswers` starts empty then). Keyed on
  // object identity, not storedPassage.id: "+ New passage" upserts on (user_id, lang, passage_idx)
  // — there's only ever one passage row per user+lang, reusing the same row id indefinitely — so
  // identity is the only way to tell "the same passage, updated" from "a genuinely new one".
  //
  // storedPassage gets a new reference on *every* saveClozeProgress/gradeCloze call too, not just
  // on mount or regeneration — each answered blank re-triggers this effect mid-session. The
  // `clozeAnswers.size > 0` guard is what keeps it from mattering then: once `onCloze` has locally
  // recorded at least one answer, this effect only re-tracks `restoredFor` and stops (doesn't
  // restore anything or touch `finished`). Without that guard, the *last* blank's own
  // saveClozeProgress — a fast single-field write — reliably resolves before finish()'s much
  // heavier gradeCloze call, so this would see persisted progress covering every blank and set
  // `finished = true` directly right here, well before gradeCloze has actually graded anything —
  // bypassing the `grading` guard entirely and re-introducing the due-date flicker from a
  // different angle. (Regeneration still resets `clozeAnswers` to empty first — see generate() —
  // so this stays correct for that case too.)
  let restoredFor: StoredPassage | null = null; // note: this variable is persisted across runs of the effect below
  $effect(() => {
    if (!passage || !storedPassage) return;
    if (restoredFor === storedPassage) return;
    restoredFor = storedPassage;
    if (clozeAnswers.size > 0) return;
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

  function onCloze(occId: string, word: string, correct: boolean, advance: boolean) {
    clozeAnswers = new Map(clozeAnswers).set(occId, { word, correct });
    if (storedPassage) saveClozeProgress({ passageId: storedPassage.id, occId, correct, lang: language });
    if (advance) focusNextBlank(occId);
  }

  // After Enter-submitting a blank, move focus to the next not-yet-answered one in reading order
  // so filling the passage doesn't require clicking each blank by hand.
  let bodyEl = $state<HTMLDivElement | null>(null);
  let titleEl = $state<HTMLDivElement | null>(null);
  function focusNextBlank(afterOccId: string) {
    if (!passage || !bodyEl) return;
    for (let i = Number(afterOccId) + 1; i < passage.body.length; i++) {
      if (isBlank(passage.body[i]) && !clozeAnswers.has(String(i))) {
        bodyEl.querySelector<HTMLInputElement>(`input[data-occid="${i}"]`)?.focus();
        return;
      }
    }
  }

  // Grade automatically the moment every blank is filled, so there's nothing to click.
  // `finished`/`grading` guard against re-firing on every subsequent render once blanks/answers
  // settle, and while finish()'s gradeCloze call is still in flight.
  $effect(() => {
    if (blankCount > 0 && clozeAnswers.size >= blankCount && !finished && !grading) { grading = true; finish(); }
  });

  // Per-word (not per-blank) results: a word may fill several blanks, so it only counts as
  // correct overall if every occurrence was — same worst-of rule finish() grades with. `due`/
  // `lastReview` read live off `deck`, so this only becomes accurate once gradeCloze's
  // `getDeck.set(...)` lands — `finished` (which reveals it) is held back until then.
  const wordResults = $derived.by(() => {
    const correctByWord = new Map<string, boolean>();
    for (const { word, correct } of clozeAnswers.values()) {
      correctByWord.set(word, (correctByWord.get(word) ?? true) && correct);
    }
    return Array.from(correctByWord, ([word, correct]) => {
      const w = deck.find((d) => d.h === word);
      return { word, correct, due: w?.due, lastReview: w?.last_review };
    }).sort((a, b) => (a.due?.getTime() ?? Infinity) - (b.due?.getTime() ?? Infinity));
  });

  const summary = $derived.by(() => ({
    correct: wordResults.filter((r) => r.correct).length,
    total: wordResults.length,
  }));

  async function finish() {
    // Worst grade per word (a word may appear in several blanks): correct → Good (3), miss → Again (1).
    const grades: Record<string, FsrsGrade> = {};
    for (const { word, correct } of wordResults) grades[word] = correct ? 3 : 1;
    await gradeCloze({ grades, lang: language });
    grading = false;
    finished = true;
  }

  function openPopup(e: MouseEvent, token: PassageToken) {
    // A drag that starts and ends inside the same ruby (e.g. highlighting just "店" out of the
    // "书店" token) still fires a trailing click on that ruby after mouseup — which would
    // otherwise clobber the correct substring popup handleSelection just set with this token's
    // full word. A non-collapsed selection at click time means this click is that trailing one
    // (a plain, no-drag click always starts with mousedown collapsing any selection), so defer to
    // handleSelection instead of overwriting its popup.
    if (window.getSelection()?.toString()) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const word = token.text;
    const poolId = poolWordIds.get(word);
    const type: PopupData['type'] = deckWords.has(word) ? 'lookup' : poolId ? 'pool' : 'free';
    popup = { word, pinyin: token.reading ?? '', meaning: token.meaning ?? '', type, anchorRect: rect, poolId };
  }

  // Arbitrary user-selected text in the passage (not necessarily a single tokenized word) — same
  // popup as a click, but the definition has to be resolved rather than read off a token. Checked
  // in priority order against what's already known client-side (deck -> pool -> passage tokens,
  // the last covering multi-character selections that happen to exactly match a vocab token)
  // before falling back to a DB-only dictionary lookup (lookupWordInDb) — deliberately no LLM
  // fallback here, so selecting arbitrary text can't spend an LLM call; a miss just reads as
  // "not in the dictionary".
  function findToken(text: string): PassageToken | undefined {
    if (!passage) return undefined;
    return passage.title.find((t) => t.text === text) ?? passage.body.find((t) => t.text === text);
  }
  async function handleSelection() {
    if (!passage) return;
    const sel = window.getSelection();
    const text = sel?.toString().trim() ?? '';
    if (!text || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer;
    if (!titleEl?.contains(container) && !bodyEl?.contains(container)) return;
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const deckWord = deck.find((w) => w.h === text);
    if (deckWord) {
      popup = { word: text, pinyin: deckWord.p, meaning: deckWord.m, type: 'lookup', anchorRect: rect };
      return;
    }
    const poolId = poolWordIds.get(text);
    const poolWord = poolId ? poolWords.find((w) => w.id === poolId) : undefined;
    if (poolWord) {
      popup = { word: text, pinyin: poolWord.p, meaning: poolWord.m, type: 'pool', anchorRect: rect, poolId };
      return;
    }
    const known = findToken(text);
    if (known?.reading && known.meaning) {
      popup = { word: text, pinyin: known.reading, meaning: known.meaning, type: 'free', anchorRect: rect };
      return;
    }

    popup = { word: text, pinyin: '', meaning: '', type: 'free', anchorRect: rect, loading: true };
    const entry = await lookupWordInDb({ word: text, lang: language });
    if (popup?.word === text && popup.loading) popup = { ...popup, pinyin: entry.reading, meaning: entry.meaning, loading: false };
  }
  async function addVocab(word: string, pinyin: string, meaning: string) {
    await addWord({ h: word, p: pinyin, m: meaning, lang: language, dueInDays: 0, passageId: storedPassage?.id });
  }
  async function releaseVocab(poolId: string) {
    await releaseFromPool({ id: poolId, lang: language });
  }
  // Only reachable for popup type 'lookup' (word already in deck) — WordPopup gates the Edit
  // button on that itself, but guard here too since `deck` may have changed since the popup opened.
  // Awaits the command (WordPopup awaits this in turn, staying in edit mode with an inline error
  // on rejection) and only updates `popup` once the save has actually landed — no optimistic
  // update to unwind if it fails.
  async function saveDefinition(pinyin: string, meaning: string) {
    if (!popup) return;
    const word = popup.word;
    const w = deck.find((d) => d.h === word);
    if (!w) return;
    await editWordDefinition({ id: w.id, h: word, p: pinyin, m: meaning, lang: language });
    if (popup && popup.word === word) popup = { ...popup, pinyin, meaning };
  }
  // Trash icon in WordPopup only requests removal — closes the popup and opens a confirmation
  // (irretrievably deletes the word's SRS progress, so it's not a one-click action).
  function requestRemove() {
    if (!popup) return;
    const word = popup.word;
    const w = deck.find((d) => d.h === word);
    if (!w) return;
    removeConfirm = { id: w.id, h: w.h };
    popup = null;
  }
  function confirmRemove() {
    if (!removeConfirm) return;
    removeWord({ id: removeConfirm.id, lang: language });
    removeConfirm = null;
  }
  const isNewlyAdded = (t: PassageToken): boolean =>
    t.type === 'vocab' && !quizWords.has(t.text) && addedWords.has(t.text) && deckWords.has(t.text);

  async function generate() {
    generating = true;
    genError = '';
    // Soonest-due first, capped at wordsPerPassage — isDueToday can return more candidates than
    // one passage should be built around.
    const words = deck
      .filter((w) => isDueToday(w))
      .sort((a, b) => a.due.getTime() - b.due.getTime())
      .slice(0, wordsPerPassage)
      .map((w) => ({ h: w.h, p: w.p, m: w.m }));
    const r = await generatePassage({ lang: language, words });
    generating = false;
    if (r?.error) { genError = r.error; return; }
    // Explicit reset rather than relying on the restore effect to infer it: that effect now only
    // restores/re-derives `finished` when `clozeAnswers` is already empty (see its comment above),
    // so any answers left over from a passage regenerated mid-completion need clearing here first.
    clozeAnswers = new Map();
    finished = false;
    grading = false;
  }

  // Entry point for both "Generate passage" and "+ New passage": if there's a deck but nothing in
  // it is due today, block generation — early review is allowed for anything due later today, but
  // never beyond that, so there's no bypass here (unlike the old "review anyway" flow).
  function requestGenerate() {
    if (deck.length > 0 && !hasDueToday) { showNoMoreTodayPopup = true; return; }
    generate();
  }
  function confirmRegenerate() {
    showRegeneratePopup = false;
    requestGenerate();
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
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div bind:this={titleEl} onmouseup={handleSelection} style="font-family:var(--f-han); font-size:26px; font-weight:500; letter-spacing:-.01em; margin-top:4px;">
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
    <div style="display:flex; justify-content:flex-end; align-items:center; gap:8px; margin-top:12px;">
      <button onclick={toggleBoundaries}
        style="font-family:var(--f-mono); font-size:11px; letter-spacing:.08em; text-transform:uppercase; font-weight:500;
          padding:6px 12px; border-radius:7px; cursor:pointer; transition:all .15s;
          border:1px solid {boundaries ? 'var(--ink)' : 'var(--line)'};
          background:{boundaries ? 'var(--ink)' : 'var(--card)'};
          color:{boundaries ? 'var(--paper)' : 'var(--ink-soft)'};">
        Boundaries
      </button>
      <button onclick={() => (showRegeneratePopup = true)} aria-label="Regenerate passage" title="Regenerate passage"
        style="display:flex; align-items:center; justify-content:center; width:30px; height:30px;
          border-radius:7px; cursor:pointer; transition:all .15s; border:1px solid var(--line);
          background:var(--card); color:var(--ink-soft);">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <polyline points="21 3 21 9 15 9" />
        </svg>
      </button>
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div bind:this={bodyEl} onmouseup={handleSelection} style="font-family:var(--f-han); font-size:21px; line-height:2.6; margin-top:8px;">
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
              occId={occId}
              onGrade={(c, advance) => onCloze(occId, t.text, c, advance)}
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
        <span
          class={grading ? 'animate-pulse' : ''}
          style="font-family:var(--f-mono); font-size:12px; letter-spacing:.06em; color:var(--ink-faint);"
        >
          {grading ? 'Grading…' : `${clozeAnswers.size}/${blankCount} blanks filled`}
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

    {#if finished && wordResults.length > 0}
      <div style="margin-top:14px; display:flex; flex-wrap:wrap; gap:10px; justify-content:center;">
        {#each wordResults as r (r.word)}
          <div style="min-width:108px; padding:8px 14px; border-radius:10px; background:var(--card);
            border:1.5px solid {r.correct ? 'var(--jade)' : 'var(--accent)'};">
            <div style="font-family:var(--f-han); font-size:16px; font-weight:500; color:var(--ink);">{r.word}</div>
            <div style="font-family:var(--f-mono); font-size:10px; letter-spacing:.04em; color:var(--ink-faint); margin-top:3px; white-space:nowrap;">
              {r.due ? formatDelay(r.due, r.lastReview ?? new Date()) : '—'}
            </div>
          </div>
        {/each}
      </div>
    {/if}
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

<WordPopup
  data={popup}
  onClose={() => (popup = null)}
  onAddVocab={addVocab}
  onReleaseFromPool={releaseVocab}
  onSaveDefinition={saveDefinition}
  onRequestRemove={requestRemove}
/>

{#if showNoMoreTodayPopup}
  <ConfirmPopup
    title="Nothing more due today"
    message="You've reviewed everything due today — come back tomorrow for more. Reviewing ahead is only available for words already due later today, not future days."
    confirmLabel="Got it"
    onConfirm={() => (showNoMoreTodayPopup = false)}
  />
{/if}

{#if showRegeneratePopup}
  <ConfirmPopup
    title="Regenerate passage?"
    message="We recommend you do this only if you believe the current passage is malformed. Cloze progress will not be saved."
    confirmLabel="OK"
    onConfirm={confirmRegenerate}
    onCancel={() => (showRegeneratePopup = false)}
  />
{/if}

{#if removeConfirm}
  <ConfirmPopup
    title="Remove from your deck?"
    message={`This will irretrievably delete all progress made on "${removeConfirm.h}" — it can't be undone.`}
    confirmLabel="Remove"
    onConfirm={confirmRemove}
    onCancel={() => (removeConfirm = null)}
  />
{/if}
