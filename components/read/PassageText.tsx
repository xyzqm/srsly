'use client';
import { Fragment, useState, useCallback, useRef, useMemo } from 'react';
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
  /**
   * Listening dictation: withhold each sentence's text until its blanks are answered.
   *
   * A PRESENTATION FLAG AND NOTHING ELSE. The blanks, the typed input, the grading and the
   * FSRS write are all exactly what they are with it off — dictation is this passage with
   * the text hidden and the audio supplied, not a second exercise. See lib/dictation.ts.
   */
  dictation?: boolean;
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
        /**
         * AUTOCORRECT MUST BE OFF, or the phone answers for you.
         *
         * iOS rewrites a typed word on blur or space — `casa` becomes `case`, `pero` becomes
         * `Pero` — and `submit()` then grades what the keyboard decided rather than what the
         * learner typed. Grading ignores case but NOT accents (see the comparison in
         * `submit`), so autocapitalisation is survivable and autocorrect is not: it produces
         * a wrong answer the learner never gave and cannot appeal.
         */
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        autoComplete="off"
        enterKeyHint="done"
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit({ force: true }); }}
        onFocus={() => setFocused(true)}
        /**
         * ON A TOUCH SCREEN, BLUR DOES NOT MEAN "I'M DONE".
         *
         * With a mouse, clicking away is a deliberate act, so grading on blur is a
         * convenience. With a finger it is ambient: the iOS keyboard's Done key, tapping the
         * next blank, backgrounding the app, rotating the phone and the address bar
         * collapsing all blur the field. Each one would commit a half-typed word as a real
         * FSRS grade, permanently — `gradedRef` makes it unrepeatable.
         *
         * So on a coarse pointer, leaving the field leaves it alone; Enter (or the keyboard's
         * Done, via enterKeyHint) is the commit. That matches the contract the finish button
         * already has: an unfilled blank simply forgoes its grade.
         */
        onBlur={() => {
          setFocused(false);
          const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
          if (!touch) submit();
        }}
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

export default function PassageText({ sentences, activeSentenceIdx, showPinyin, deckWords, clozeWords, pendingDeckWords, deckReadings, onAddToDeck, onClaimVocab, poolWords, onReleaseFromPool, showClozeHints, onClozeAnswer, restoredClozeGrades, showWordBoundaries = true, contextualMeanings, dictation = false }: Props) {
  const [popup, setPopup] = useState<PopupData | null>(null);
  const language = useLanguage();
  const langConfig = getLanguageConfig(language);

  /**
   * Which occurrences are blanks, and how many of each sentence's are answered.
   *
   * ONE PASS, because the rule is not membership and duplicating it is how two copies come
   * to disagree: a Japanese token matches on its BASE form, and an occurrence that already
   * carries a grade stays a blank even after that grade pushed the word out of the due set.
   * The token loop below reads this rather than re-deriving it, and dictation reads it to
   * decide when a sentence has been earned.
   *
   * A restored grade must NAME the same word — `occurrenceId` is positional ("sentence 3,
   * token 7") and passage state is keyed only by date, language, level and passage index, so
   * two devices at the same level on the same day produce the same key for two different
   * passages. `ClozeGradeEntry` already carries the word, which is what makes the check free.
   */
  const blanks = useMemo(() => {
    const info = new Map<string, { reviewKey: string; storedEntry?: ClozeGradeEntry }>();
    const perSentence = sentences.map((sent, si) => {
      const idxs: number[] = [];
      let answered = 0;
      sent.tokens.forEach((token, ti) => {
        const reviewKey = token.baseForm && clozeWords.has(token.baseForm) ? token.baseForm : token.text;
        const oid = `${si}-${ti}`;
        const restored = restoredClozeGrades?.get(oid);
        const restoredMatches = restored !== undefined && restored.word === reviewKey;
        if (!((clozeWords.has(reviewKey) || restoredMatches) && token.type === 'vocab')) return;
        idxs.push(ti);
        if (restoredMatches) answered++;
        info.set(oid, { reviewKey, storedEntry: restoredMatches ? restored : undefined });
      });
      return { idxs, answered };
    });
    return { info, perSentence };
  }, [sentences, clozeWords, restoredClozeGrades]);

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
        // Japanese carries its conjugation on the token itself — see lib/japaneseGrammar.ts.
        // This popup is built HERE rather than through useWordPopup, so the field has to be
        // copied in both places or the grammar line silently never renders in the passage.
        grammar: token.grammar,
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

  const handleAddVocab = useCallback((word: string, pinyin: string, meaning: string) => {
    onClaimVocab(word);
    onAddToDeck({ h: word, p: pinyin, m: meaning });
  }, [onClaimVocab, onAddToDeck]);

  return (
    <div>
      {/* Passage text */}
      {(
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
          {sentences.map((sent, si) => {
            /**
             * In dictation, a sentence is hidden until every blank in it is answered.
             *
             * Revealed the MOMENT it is earned rather than at the end of the run: seeing the
             * sentence you just heard is where the learning lands, and holding it back to a
             * results screen puts it a long way from the moment it would mean something.
             * A sentence with no blanks is never hidden — there is nothing to earn it with.
             */
            const st = blanks.perSentence[si];
            const hidden = dictation && st.idxs.length > 0 && st.answered < st.idxs.length;
            return (
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
                const occurrenceId = `${si}-${ti}`;
                const blank = blanks.info.get(occurrenceId);
                const isReviewWord = blank !== undefined;
                const reviewKey = blank?.reviewKey ?? token.text;
                // A blank you already answered STAYS a blank, and a restored grade must name
                // the same word — both decided in `blanks` above, where the reasoning lives.
                // Spaced scripts need the spaces put back: the segmenter drops whitespace,
                // and rendering tokens flush together (correct for CJK) would otherwise
                // produce "muchos amigos . El" with the punctuation adrift.
                const space = needsSpaceBefore(sent.tokens, ti, langConfig.scriptIsUnspaced);
                // Due vocab words become cloze blanks — rendered separately.
                if (isReviewWord) {
                  const storedEntry = blank.storedEntry;
                  return (
                    <Fragment key={`${ti}-${storedEntry !== undefined ? 'r' : 'f'}`}>
                    {space}
                    <ClozeBlank
                      token={token}
                      /* Hints OFF in dictation, whatever the toggle says. `showHint` gives
                         live character-by-character feedback as you type, which in a listening
                         exercise hands over the spelling being tested. The toggle still governs
                         the reading mode it was written for. */
                      showHint={dictation ? false : (showClozeHints ?? true)}
                      accentKeys={langConfig.accentKeys}
                      contextualMeaning={contextualMeanings?.[reviewKey] ?? contextualMeanings?.[token.text]}
                      onGrade={(correct) => onClozeAnswer?.(occurrenceId, reviewKey, correct)}
                      initialGrade={storedEntry ? { correct: storedEntry.grade === 3 } : undefined}
                      onWordClick={openTokenPopup}
                    />
                    </Fragment>
                  );
                }
                /**
                 * A hidden token is plain masked text, not a muted `TokenEl`.
                 *
                 * Rendering the real thing and blurring it leaves it tappable, and the lookup
                 * popup would cheerfully print the word — and its definition — for a token the
                 * learner is being asked to recognise by ear. Blur is a look, not a barrier.
                 * The characters stay in place so nothing reflows when the sentence is earned.
                 */
                if (hidden) {
                  return (
                    <Fragment key={ti}>
                      {space}
                      <span aria-hidden="true" style={{
                        filter: 'blur(6px)', opacity: 0.5, userSelect: 'none', pointerEvents: 'none',
                      }}>{token.text}</span>
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
            );
          })}
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
