'use client';
import { Fragment, useState, useCallback, useMemo, useRef } from 'react';
import type { PassageToken, DeckWord, Sentence, ClozeGradeEntry } from '@/lib/types';
import type { PopupData, CompoundHint } from './WordPopup';
import WordPopup from './WordPopup';
import { lookupWord } from '@/lib/data/dict';
import { lookupReadingAsync } from '@/lib/data/lookup';
import { useLanguage } from '@/lib/LanguageContext';
import { getLanguageConfig } from '@/lib/languageConfig';
import { pickReading, type ReadingHint } from '@/lib/readings';
import { needsSpaceBefore } from '@/lib/tokenText';
import GlossText from '@/components/shared/GlossText';

/** Find compound words that include `token` by checking its immediate neighbours. */
function findCompoundHints(token: PassageToken, sentence: Sentence, tokenIdx: number): CompoundHint[] {
  // Only look for compounds on single CJK characters
  if (token.text.length !== 1 || !/[一-鿿]/.test(token.text)) return [];

  const prev = sentence.tokens[tokenIdx - 1];
  const next = sentence.tokens[tokenIdx + 1];
  const hints: CompoundHint[] = [];
  const seen = new Set<string>();

  for (const candidate of [
    prev && prev.type !== 'punct' && prev.text.length === 1 ? prev.text + token.text : null,
    next && next.type !== 'punct' && next.text.length === 1 ? token.text + next.text : null,
    // Also try prev+token+next (3-char compound)
    prev && next && prev.type !== 'punct' && next.type !== 'punct'
      && prev.text.length === 1 && next.text.length === 1
      ? prev.text + token.text + next.text : null,
  ]) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    const entry = lookupWord(candidate);
    if (entry.pinyin && entry.meaning) {
      hints.push({ text: candidate, pinyin: entry.pinyin, meaning: entry.meaning });
    }
  }
  return hints;
}

interface Props {
  sentences: Sentence[];
  activeSentenceIdx: number;
  showPinyin?: boolean;
  audioOnly: boolean;
  deckWords: Set<string>;
  /** This passage's due target words → cloze blanks. Deliberately NOT every due deck word:
   *  see `clozeWords` in ReadTab for why the passage only blanks what it was built around. */
  clozeWords: Set<string>;
  /** Deck words added but not yet due (new card, e.g. "due tomorrow") → green '+' badge. */
  pendingDeckWords: Set<string>;
  deckReadings?: Map<string, ReadingHint[]>;
  onAddToDeck: (word: DeckWord) => void;
  /** Mark a word claimed this session (shared with the title popup); the added/due visuals
   *  are otherwise derived from the deck so they survive reloads. */
  onClaimVocab: (word: string) => void;
  /** Deck words staged but not yet in play (pool). */
  poolWords?: Set<string>;
  onReleaseFromPool?: (word: string) => void;
  /** Whether to show the English hint tooltip on hover over cloze blanks. */
  showClozeHints?: boolean;
  onClozeAnswer?: (occurrenceId: string, word: string, correct: boolean) => void;
  /** Restored cloze grades keyed by occurrenceId ("${si}-${ti}") — pre-fills already-answered blanks. */
  restoredClozeGrades?: Map<string, ClozeGradeEntry>;
  /** When false, hides underlines and collapses inter-word spacing so the user practices word segmentation. */
  showWordBoundaries?: boolean;
  /** Per-word sense that applies in THIS passage, keyed by word — see DailyPassage. */
  contextualMeanings?: Record<string, string>;
}

function TokenEl({ token, peeked, isReviewWord, compounds, showWordBoundaries, reserveGap, onClick }: {
  token: PassageToken;
  peeked: boolean;
  isReviewWord: boolean;
  compounds: CompoundHint[];
  showWordBoundaries: boolean;
  /** Reserve a blank slot after the word so tokens read as separate. Only unspaced scripts
   *  need it — in Spanish the real space already separates them, and reserving another
   *  slot pushes punctuation away from the word it belongs to ("bonita . Carlos"). */
  reserveGap: boolean;
  onClick: (e: React.MouseEvent, token: PassageToken, compounds: CompoundHint[]) => void;
}) {
  const [hovered, setHovered] = useState(false);
  // Non-interactive when it's punctuation, or when we know nothing about the word.
  // The test is deliberately "reading OR meaning", not reading alone: Spanish has no
  // reading layer at all, so gating on it would make every Spanish token dead text.
  if (token.type === 'punct' || !(token.reading || token.meaning)) return <span>{token.text}</span>;

  // Indicator character — empty string when none so the span is always present.
  //
  // There is deliberately no "just added" marker. Adding a word used to paint it with a jade
  // underline and a '+', but only while word boundaries were on, so the same action left a
  // visible trace in one mode and none in the other. Removing it is what makes the two modes
  // agree; the popup already reports deck membership when you ask for it.
  const indicatorChar = (peeked && isReviewWord) ? '↺' : '';

  return (
    <>
      <ruby
        onClick={e => onClick(e, token, compounds)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="cursor-pointer"
        style={{
          borderBottom: showWordBoundaries
            ? isReviewWord
              ? peeked
                ? '1.5px solid var(--accent)'
                : '1.5px dotted var(--accent)'
              : '1.5px dotted color-mix(in srgb, var(--ink-faint) 70%, transparent)'
            : undefined,
          color: peeked && isReviewWord ? 'var(--accent-deep)' : undefined,
          paddingBottom: 1,
          background: hovered
            ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
            : 'transparent',
          borderRadius: 3,
          cursor: 'pointer',
          transition: 'background .12s',
        }}
      >
        {token.text}
        {/* Omitted for languages with no reading layer (es) — an empty <rt> would still
            reserve the annotation line above every word and space the text out. */}
        {token.reading && <rt>{token.reading}</rt>}
      </ruby>
      {showWordBoundaries && (indicatorChar || reserveGap) && (
        <span
          aria-hidden="true"
          style={{
            display: 'inline',
            fontSize: '0.45em',
            verticalAlign: 'super',
            lineHeight: 0,
            fontFamily: 'var(--f-ui)',
            fontWeight: 700,
            pointerEvents: 'none',
            userSelect: 'none',
            color: indicatorChar ? 'var(--accent)' : 'transparent',
          }}
        >
          {indicatorChar || '+'}
        </span>
      )}
    </>
  );
}

function ClozeBlank({ token, showHint, accentKeys, contextualMeaning, onGrade, initialGrade, onWordClick }: {
  token: PassageToken;
  /** Characters this language needs that a keyboard may not have. Empty = no bar. */
  accentKeys: string[];
  /** Hints on: the English gloss on hover, AND live character-by-character feedback as you
   *  type. Off: neither — you commit an answer and find out afterwards. The two belong on
   *  one switch because they are the same offer, support while you recall. */
  showHint: boolean;
  /** The sense of this word that applies in this sentence, if the generator found one. */
  contextualMeaning?: string;
  onGrade: (correct: boolean) => void;
  initialGrade?: { correct: boolean };
  onWordClick?: (e: React.MouseEvent, token: PassageToken, compounds: CompoundHint[]) => void;
}) {
  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState(!!initialGrade);
  const [correct, setCorrect] = useState(initialGrade?.correct ?? false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const gradedRef = useRef(!!initialGrade);

  /**
   * Insert an accented character at the caret.
   *
   * The button suppresses mousedown rather than handling blur, and that is the whole trick:
   * the input submits on blur, so a button that took focus would grade the answer the
   * moment you reached for `é`. Nothing is focused, nothing blurs, the caret stays put.
   */
  const insert = useCallback((ch: string) => {
    const el = inputRef.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? start;
    const next = value.slice(0, start) + ch + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + ch.length, start + ch.length);
    });
  }, [value]);

  // How many leading characters match the answer. Everything before this index is green,
  // from it on is red — but only when hints are on, since it answers the question one
  // character at a time.
  let matchLen = 0;
  while (matchLen < value.length && matchLen < token.text.length && value[matchLen] === token.text[matchLen]) matchLen++;

  const submit = useCallback((opts?: { force?: boolean }) => {
    if (gradedRef.current) return;
    if (!value.trim() && !opts?.force) return;
    gradedRef.current = true;
    // Case-insensitive: a sentence-initial blank shows `Buenos días`, and marking someone
    // wrong for typing `buenos días` tests where the sentence happened to break, not whether
    // they know the word. Accents still count — they are part of the spelling, which is why
    // the accent bar exists.
    const isCorrect = value.trim().localeCompare(token.text, undefined, { sensitivity: 'accent' }) === 0;
    setSubmitted(true);
    setCorrect(isCorrect);
    onGrade(isCorrect);
  }, [value, token.text, onGrade]);

  if (submitted) {
    const color = correct ? 'var(--right)' : 'var(--wrong)';
    return (
      <>
        <ruby
          style={{ color, cursor: onWordClick ? 'pointer' : undefined }}
          onClick={onWordClick ? (e) => onWordClick(e, token, []) : undefined}
        >
          {token.text}
          {token.reading && <rt>{token.reading}</rt>}
        </ruby>
        <span
          aria-hidden="true"
          style={{
            display: 'inline',
            fontSize: '0.45em',
            verticalAlign: 'super',
            lineHeight: 0,
            fontFamily: 'var(--f-ui)',
            fontWeight: 700,
            pointerEvents: 'none',
            userSelect: 'none',
            color,
          }}
        >
          {correct ? '✓' : '✗'}
        </span>
      </>
    );
  }

  return (
    <span
      style={{ display: 'inline-block', position: 'relative', verticalAlign: 'baseline' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {showHint && hovered && token.meaning && (
        <span
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            whiteSpace: 'normal',
            maxWidth: 260,
            width: 'max-content',
            textAlign: 'center',
            fontSize: 10,
            lineHeight: 1.45,
            fontFamily: 'var(--f-mono)',
            color: 'var(--ink-soft)',
            background: 'var(--card)',
            border: '1px solid var(--line)',
            borderRadius: 5,
            padding: '2px 6px',
            pointerEvents: 'none',
            zIndex: 10,
            opacity: hovered ? 1 : 0,
            transition: 'opacity .12s',
          }}
        >
          <GlossText gloss={token.meaning} contextual={contextualMeaning} highlightColor="var(--accent)" />
        </span>
      )}
      {/* Live prefix-match overlay — always on, independent of Hints.
          It colours what you have ALREADY TYPED; it never tells you what to type next, and
          with no meaning on hover you still have to produce the word from memory first.
          Tying it to Hints made one switch mean two different kinds of help, so turning off
          the meaning silently took away your typing feedback as well. */}
      {value.length > 0 && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            fontFamily: 'var(--f-han)',
            fontSize: '1em',
            fontWeight: 'var(--han-weight)' as 'bold',
            padding: '0 2px',
            zIndex: 1,
          }}
        >
          {/* `white-space: pre` or the spaces vanish: each character is its own span inside a
              flex row, and a span holding only a space collapses to zero width. Multi-word
              answers — `por favor`, `buenos días`, `hasta luego` — looked like the space key
              did nothing. */}
          {[...value].map((char, i) => (
            <span key={i} style={{ whiteSpace: 'pre', color: i < matchLen ? 'var(--right)' : 'var(--wrong)' }}>{char}</span>
          ))}
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit({ force: true }); }}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); submit(); }}
        style={{
          width: `${Math.max(token.text.length * 1.3, 2.5)}em`,
          fontFamily: 'var(--f-han)',
          fontSize: '1em',
          fontWeight: 'var(--han-weight)' as 'bold',
          // The overlay above always draws the text now, so the real input text is always
          // transparent — otherwise the two would render on top of each other.
          color: 'transparent',
          caretColor: 'var(--ink)',
          background: 'transparent',
          border: 'none',
          borderBottom: '1.5px dotted var(--accent)',
          outline: 'none',
          padding: '0 2px',
          /**
           * Keep consecutive blanks apart.
           *
           * Two blanks in a row share an edge — in an unspaced script there is not even a
           * space between them — so their dotted borders meet. Each border restarts its own
           * dash pattern at its own edge, so the last dot of one lands flush against the
           * first dot of the next and renders as a single fat dot, with the two underlines
           * reading as one long gap. That is not just untidy: it hides how many words are
           * being asked for. A symmetric margin gives the seam a gap, so two blanks look
           * like two. Symmetric matters — the typed-text overlay is centred over this
           * element's box, and an uneven margin would shift it off the caret.
           */
          margin: '0 2px',
          textAlign: 'center',
          verticalAlign: 'baseline',
          position: 'relative',
          zIndex: 2,
        }}
        aria-label={`Fill in the blank${showHint && token.meaning ? `: ${token.meaning}` : ''}`}
      />

      {focused && accentKeys.length > 0 && (
        <span
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 2,
            width: 'max-content',
            background: 'var(--card)',
            border: '1px solid var(--line)',
            borderRadius: 6,
            padding: 3,
            boxShadow: '0 2px 8px rgba(0,0,0,.08)',
            zIndex: 20,
          }}
        >
          {accentKeys.map(ch => (
            <button
              key={ch}
              type="button"
              tabIndex={-1}
              onMouseDown={e => { e.preventDefault(); insert(ch); }}
              className="cursor-pointer"
              style={{
                font: 'inherit',
                fontSize: 15,
                lineHeight: 1,
                minWidth: 24,
                padding: '4px 2px',
                background: 'none',
                border: '1px solid transparent',
                borderRadius: 4,
                color: 'var(--ink)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--paper-2)'; e.currentTarget.style.borderColor = 'var(--line)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = 'transparent'; }}
              aria-label={`Insert ${ch}`}
            >
              {ch}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

export default function PassageText({ sentences, activeSentenceIdx, showPinyin, audioOnly, deckWords, clozeWords, pendingDeckWords, deckReadings, onAddToDeck, onClaimVocab, poolWords, onReleaseFromPool, showClozeHints, onClozeAnswer, restoredClozeGrades, showWordBoundaries = true, contextualMeanings }: Props) {
  const [popup, setPopup] = useState<PopupData | null>(null);
  const language = useLanguage();
  const langConfig = getLanguageConfig(language);

  const openTokenPopup = useCallback((e: React.MouseEvent, token: PassageToken, compounds: CompoundHint[]) => {
    // Same "reading OR meaning" test as TokenEl — a reading-only gate would stop Spanish
    // words from ever opening the lookup popup.
    if (token.type === 'punct' || !(token.reading || token.meaning)) return;
    const el = e.currentTarget as HTMLElement;
    const rects = el.getClientRects();
    const rect = rects.length > 0 ? rects[0] : el.getBoundingClientRect();

    // A conjugated Japanese verb/adjective carries its dictionary (base) form in
    // token.baseForm (resolved server-side by kuromoji). Look up — and headline, and add to
    // vocab — by that base form so しています resolves to する, not the surface form (JMdict is
    // keyed by dictionary form, and this dedupes conjugations against the base-form card).
    const lookupKey = token.baseForm ?? token.text;
    void lookupReadingAsync(language, lookupKey, token.baseForm ? '' : (token.reading || ''), token.meaning || '').then(entry => {
      const canonicalWord = token.baseForm ?? token.text;
      const isPending  = pendingDeckWords.has(token.text) || pendingDeckWords.has(canonicalWord);
      const inDeck     = deckWords.has(token.text) || deckWords.has(canonicalWord);
      const isInPool   = inDeck && !!(poolWords?.has(token.text) || poolWords?.has(canonicalWord));
      const compoundHints = (token.text.length === 1 && !inDeck) ? compounds : [];

      // The token's own reading/meaning (server-resolved) take priority; the fresh lookup is
      // the source for the base form's own dictionary reading (entry was looked up by the base
      // form when present, so entry.reading is する's reading, not the surface form's).
      let pin = token.reading || entry.reading, mean = token.meaning || entry.meaning;
      let otherReadings: { p: string; m: string }[] | undefined;
      const allReadings = deckReadings?.get(canonicalWord) ?? deckReadings?.get(token.text);
      if (allReadings && allReadings.length >= 1) {
        const matched = pickReading(allReadings, token.reading ?? '') ?? allReadings[0];
        pin = matched.p || pin;
        mean = matched.m || mean;
        if (allReadings.length > 1) {
          otherReadings = allReadings.filter(r => r !== matched).map(r => ({ p: r.p, m: r.m }));
        }
      }

      const baseReading = token.baseForm ? entry.reading : undefined;
      const type: PopupData['type'] = isInPool ? 'pool' : (isPending || inDeck) ? 'lookup' : 'free';
      setPopup({
        word: token.text, pinyin: pin, meaning: mean, type, anchorRect: rect, otherReadings,
        baseForm: token.baseForm, baseReading,
        ...(type === 'free' ? { compounds: compoundHints } : {}),
      });
    });
  }, [deckWords, pendingDeckWords, poolWords, deckReadings, language]);

  const handleTokenClick = useCallback((e: React.MouseEvent, token: PassageToken, compounds: CompoundHint[]) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    // Review words are cloze blanks — they handle their own interaction.
    const isReviewWord = clozeWords.has(token.text) && token.type === 'vocab';
    if (isReviewWord) return;
    openTokenPopup(e, token, compounds);
  }, [clozeWords, openTokenPopup]);

  /**
   * Every blank in the passage, in reading order — the list listening mode types into.
   *
   * Derived with the SAME rule the body renders by (`clozeWords` OR a restored grade, and
   * the token must be vocab), so the two modes can never disagree about what counts as a
   * blank. Computed unconditionally rather than inside the audio branch: it is cheap, and
   * making it conditional would mean the hook order changed with the toggle.
   */
  const audioBlanks = useMemo(() => {
    const out: { token: PassageToken; occurrenceId: string; reviewKey: string; si: number }[] = [];
    sentences.forEach((sent, si) => {
      sent.tokens.forEach((token, ti) => {
        if (token.type !== 'vocab') return;
        const reviewKey = token.baseForm && clozeWords.has(token.baseForm) ? token.baseForm : token.text;
        const occurrenceId = `${si}-${ti}`;
        if (clozeWords.has(reviewKey) || restoredClozeGrades?.has(occurrenceId)) {
          out.push({ token, occurrenceId, reviewKey, si });
        }
      });
    });
    return out;
  }, [sentences, clozeWords, restoredClozeGrades]);

  const handleAddVocab = useCallback((word: string, pinyin: string, meaning: string) => {
    onClaimVocab(word);
    onAddToDeck({ h: word, p: pinyin, m: meaning });
  }, [onClaimVocab, onAddToDeck]);

  return (
    <div>
      {/*
        LISTENING MODE — a dictation exercise, not a blindfold.

        This used to render a cover and nothing else, which made the mode a dead end: the
        cloze inputs live inside the passage body below, so hiding the body removed them from
        the DOM entirely — while the Finish button stayed gated on `clozeAnswered ===
        clozeWordCount`. A passage with blanks could therefore never be completed in listening
        mode. You had to switch back to reading, fill them in, and switch again, and nothing on
        screen said so.

        The blanks now come with you. The prose stays hidden; the gaps are listed in reading
        order and you fill each one from what you hear, which is what a listening exercise
        should have been asking for. They are the SAME ClozeBlank instances, keyed by the same
        occurrence id and reporting through the same onGrade, so grading, restore-on-reload and
        FSRS scheduling behave identically in either mode.
      */}
      {audioOnly && (
        <div
          className="flex flex-col items-center text-center gap-4 p-10 rounded-xl"
          style={{ border: '1px dashed var(--line)', background: 'linear-gradient(180deg, color-mix(in srgb, var(--card) 30%, var(--paper)), var(--card))' }}
        >
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            Listening mode
          </div>
          {/* A STATIC mark. The bars used to animate on a loop whether or not anything was
              playing, so the page appeared to be doing something at all times — motion that
              carried no information and pulled the eye away from the blanks being typed into. */}
          <div className="flex items-end gap-1.5" aria-hidden="true" style={{ height: 26 }}>
            {[30, 70, 95, 50, 80, 40, 62].map((h, i) => (
              <span key={i} className="block w-[5px] rounded-[3px]"
                style={{ height: `${h}%`, background: 'var(--accent)', opacity: 0.35 }} />
            ))}
          </div>
          <div style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', color: 'var(--ink-soft)', fontSize: 15, maxWidth: '38ch', lineHeight: 1.55 }}>
            {audioBlanks.length > 0
              ? 'The passage is hidden. Press play and fill in each word you hear, in order.'
              : 'The passage is hidden. Press play and answer the questions below from what you hear.'}
          </div>

          {audioBlanks.length > 0 && (
            <div className="w-full grid gap-x-6 gap-y-3 mt-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
              {audioBlanks.map(({ token, occurrenceId, reviewKey, si }, n) => {
                const storedEntry = restoredClozeGrades?.get(occurrenceId);
                return (
                  <div key={occurrenceId} className="flex items-baseline gap-2 justify-center">
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, color: 'var(--ink-faint)', minWidth: '3.4em', textAlign: 'right' }}
                          title={`Sentence ${si + 1}`}>
                      {n + 1}.
                    </span>
                    <ClozeBlank
                      token={token}
                      showHint={showClozeHints ?? true}
                      accentKeys={langConfig.accentKeys}
                      contextualMeaning={contextualMeanings?.[reviewKey] ?? contextualMeanings?.[token.text]}
                      onGrade={(correct) => onClozeAnswer?.(occurrenceId, reviewKey, correct)}
                      initialGrade={storedEntry ? { correct: storedEntry.grade === 3 } : undefined}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Passage text */}
      {!audioOnly && (
        <div
          className={showPinyin ? 'show-pinyin' : ''}
          style={{
            fontFamily: 'var(--f-han)',
            fontSize: 22,
            lineHeight: 2.3,
            color: 'var(--ink)',
            padding: '8px 4px 4px',
            letterSpacing: '.01em',
            fontWeight: 'var(--han-weight)' as 'bold',
          }}
        >
          {sentences.map((sent, si) => (
            <Fragment key={si}>
            {/* Sentences are separate spans (each is independently highlightable), so the
                space BETWEEN them has to be emitted here — a spaced script would otherwise
                run them together as "cumpleaños.Todos". Kept outside the span so it never
                widens the active-sentence highlight. */}
            {si > 0 && !langConfig.scriptIsUnspaced && ' '}
            <span
              className="transition-all duration-200 rounded-[5px]"
              style={
                si === activeSentenceIdx
                  ? { background: 'var(--accent-soft)', boxShadow: '0 0 0 4px var(--accent-soft)' }
                  : {}
              }
            >
              {sent.tokens.map((token, ti) => {
                // Due vocab words become cloze blanks. A conjugated Japanese token is
                // a review word if its base form (not surface form) is in clozeWords.
                const reviewKey = token.baseForm && clozeWords.has(token.baseForm) ? token.baseForm : token.text;
                const occurrenceId = `${si}-${ti}`;
                /**
                 * A blank you already answered stays a blank.
                 *
                 * Answering it grades the card, which pushes `dueAt` into the future and
                 * drops the word out of `clozeWords` — so coming back to the passage found
                 * your answered `por favor` rendered as ordinary black text, with no sign
                 * you had ever filled it in. The recorded grade is the durable fact here,
                 * so an occurrence that has one is a blank regardless of the schedule.
                 */
                const isReviewWord = (clozeWords.has(reviewKey) || restoredClozeGrades?.has(occurrenceId))
                  && token.type === 'vocab';
                // Spaced scripts need the spaces put back: the segmenter drops whitespace,
                // and rendering tokens flush together (correct for CJK) would otherwise
                // produce "muchos amigos . El" with the punctuation adrift.
                const space = needsSpaceBefore(sent.tokens, ti, langConfig.scriptIsUnspaced);
                // Due vocab words become cloze blanks — rendered separately.
                if (isReviewWord) {
                  const storedEntry = restoredClozeGrades?.get(occurrenceId);
                  return (
                    <Fragment key={`${ti}-${storedEntry !== undefined ? 'r' : 'f'}`}>
                    {space}
                    <ClozeBlank
                      token={token}
                      showHint={showClozeHints ?? true}
                      accentKeys={langConfig.accentKeys}
                      contextualMeaning={contextualMeanings?.[reviewKey] ?? contextualMeanings?.[token.text]}
                      onGrade={(correct) => onClozeAnswer?.(occurrenceId, reviewKey, correct)}
                      initialGrade={storedEntry ? { correct: storedEntry.grade === 3 } : undefined}
                      onWordClick={openTokenPopup}
                    />
                    </Fragment>
                  );
                }
                // Compound hints are a Chinese single-character feature; server-segmented
                // languages (ja, es) already arrive as whole words.
                const compounds = language === 'zh' ? findCompoundHints(token, sent, ti) : [];
                return (
                  <Fragment key={ti}>
                    {space}
                    <TokenEl
                      token={token}
                      peeked={false}
                      isReviewWord={false}
                      compounds={compounds}
                      showWordBoundaries={showWordBoundaries}
                      reserveGap={langConfig.scriptIsUnspaced}
                      onClick={handleTokenClick}
                    />
                  </Fragment>
                );
              })}
            </span>
            </Fragment>
          ))}
        </div>
      )}

      <WordPopup
        data={popup}
        onClose={() => setPopup(null)}
        onAddVocab={handleAddVocab}
        onReleaseFromPool={onReleaseFromPool}
      />
    </div>
  );
}
