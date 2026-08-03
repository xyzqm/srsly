'use client';
import { Fragment, useState, useCallback, useRef } from 'react';
import type { PassageToken, DeckWord, Sentence, ClozeGradeEntry } from '@/lib/types';
import type { PopupData, CompoundHint } from './WordPopup';
import WordPopup from './WordPopup';
import { lookupWord } from '@/lib/data/dict';
import { lookupReadingAsync } from '@/lib/data/lookup';
import { useLanguage } from '@/lib/LanguageContext';
import { getLanguageConfig } from '@/lib/languageConfig';
import { pickReading, type ReadingHint } from '@/lib/readings';

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
}

function TokenEl({ token, peeked, isReviewWord, claimKind, compounds, showWordBoundaries, reserveGap, onClick }: {
  token: PassageToken;
  peeked: boolean;
  isReviewWord: boolean;
  claimKind: 'vocab' | null;
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

  // Indicator character and color — empty string when none so the span is always present
  const indicatorChar  = claimKind === 'vocab' ? '+' : (peeked && isReviewWord) ? '↺' : '';
  const indicatorColor = claimKind === 'vocab' ? 'var(--jade)' : 'var(--accent)';

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
              : claimKind === 'vocab'
                ? '1.5px solid color-mix(in srgb, var(--jade) 80%, transparent)'
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
            color: indicatorChar ? indicatorColor : 'transparent',
          }}
        >
          {indicatorChar || '+'}
        </span>
      )}
    </>
  );
}

/**
 * Punctuation that OPENS something and therefore takes a space before it but none after —
 * Spanish's inverted marks plus the usual brackets and quotes.
 */
const OPENING_PUNCT = new Set(['¿', '¡', '«', '(', '[', '{', '“', '‘']);

/**
 * Whether a space should be rendered before token `ti`. Unspaced scripts (zh, ja) never get
 * one — their tokens butt together the way the script is actually written. Spaced scripts
 * get a space between words, but not before closing punctuation and not after an opening
 * mark, so `¿Dónde está la biblioteca?` comes out with its marks tight against the words.
 */
function needsSpaceBefore(tokens: PassageToken[], ti: number, scriptIsUnspaced: boolean): string {
  if (scriptIsUnspaced || ti === 0) return '';
  const token = tokens[ti];
  const prev = tokens[ti - 1];
  if (token.type === 'punct' && !OPENING_PUNCT.has(token.text)) return '';
  if (prev.type === 'punct' && OPENING_PUNCT.has(prev.text)) return '';
  return ' ';
}

function ClozeBlank({ token, showHint, onGrade, initialGrade, onWordClick }: {
  token: PassageToken;
  showHint: boolean;
  onGrade: (correct: boolean) => void;
  initialGrade?: { correct: boolean };
  onWordClick?: (e: React.MouseEvent, token: PassageToken, compounds: CompoundHint[]) => void;
}) {
  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState(!!initialGrade);
  const [correct, setCorrect] = useState(initialGrade?.correct ?? false);
  const [hovered, setHovered] = useState(false);
  const gradedRef = useRef(!!initialGrade);

  const submit = useCallback((opts?: { force?: boolean }) => {
    if (gradedRef.current) return;
    if (!value.trim() && !opts?.force) return;
    gradedRef.current = true;
    const isCorrect = value.trim() === token.text;
    setSubmitted(true);
    setCorrect(isCorrect);
    onGrade(isCorrect);
  }, [value, token.text, onGrade]);

  // How many leading characters of the user's input match the correct answer.
  // Everything before this index is green; at and after is red.
  let matchLen = 0;
  while (matchLen < value.length && matchLen < token.text.length && value[matchLen] === token.text[matchLen]) matchLen++;

  if (submitted) {
    const color = correct ? 'var(--jade)' : 'var(--accent)';
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
            whiteSpace: 'nowrap',
            fontSize: 10,
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
          {token.meaning}
        </span>
      )}
      {/* Real-time prefix-match overlay: green for matching prefix, red for mismatches/extra */}
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
          {[...value].map((char, i) => (
            <span key={i} style={{ color: i < matchLen ? 'var(--jade)' : 'var(--accent)' }}>{char}</span>
          ))}
        </span>
      )}
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit({ force: true }); }}
        onBlur={() => submit()}
        style={{
          width: `${Math.max(token.text.length * 1.3, 2.5)}em`,
          fontFamily: 'var(--f-han)',
          fontSize: '1em',
          color: 'transparent',
          caretColor: 'var(--ink)',
          background: 'transparent',
          border: 'none',
          borderBottom: '1.5px dotted var(--accent)',
          outline: 'none',
          padding: '0 2px',
          textAlign: 'center',
          verticalAlign: 'baseline',
          position: 'relative',
          zIndex: 2,
        }}
        aria-label={`Fill in the blank${showHint && token.meaning ? `: ${token.meaning}` : ''}`}
      />
    </span>
  );
}

export default function PassageText({ sentences, activeSentenceIdx, showPinyin, audioOnly, deckWords, clozeWords, pendingDeckWords, deckReadings, onAddToDeck, onClaimVocab, poolWords, onReleaseFromPool, showClozeHints, onClozeAnswer, restoredClozeGrades, showWordBoundaries = true }: Props) {
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

  const handleAddVocab = useCallback((word: string, pinyin: string, meaning: string) => {
    onClaimVocab(word);
    onAddToDeck({ h: word, p: pinyin, m: meaning });
  }, [onClaimVocab, onAddToDeck]);

  return (
    <div>
      {/* Audio-only cover */}
      {audioOnly && (
        <div
          className="flex flex-col items-center justify-center text-center gap-4 p-12 rounded-xl"
          style={{ border: '1px dashed var(--line)', background: 'linear-gradient(180deg, color-mix(in srgb, var(--card) 30%, var(--paper)), var(--card))' }}
        >
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
            Listening mode
          </div>
          <div className="flex items-end gap-1.5" style={{ height: 56 }}>
            {([
              { h: 30, dur: '0.85s', delay: '0s'    },
              { h: 70, dur: '1.3s',  delay: '0.18s' },
              { h: 95, dur: '0.72s', delay: '0.07s' },
              { h: 50, dur: '1.1s',  delay: '0.34s' },
              { h: 80, dur: '0.92s', delay: '0.12s' },
              { h: 40, dur: '1.45s', delay: '0.28s' },
              { h: 62, dur: '0.78s', delay: '0.22s' },
            ] as const).map(({ h, dur, delay }, i) => (
              <span
                key={i}
                className="block w-[5px] rounded-[3px]"
                style={{
                  height: `${h}%`,
                  background: 'var(--accent)',
                  opacity: 0.6,
                  transformOrigin: 'center bottom',
                  animation: `wave ${dur} ease-in-out infinite`,
                  animationDelay: delay,
                }}
              />
            ))}
          </div>
          <div style={{ fontFamily: 'var(--f-display)', fontStyle: 'italic', color: 'var(--ink-soft)', fontSize: 15, maxWidth: '34ch', lineHeight: 1.55 }}>
            The passage is hidden. Press play and answer the questions below from what you hear.
          </div>
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
                const isReviewWord = clozeWords.has(reviewKey) && token.type === 'vocab';
                // Spaced scripts need the spaces put back: the segmenter drops whitespace,
                // and rendering tokens flush together (correct for CJK) would otherwise
                // produce "muchos amigos . El" with the punctuation adrift.
                const space = needsSpaceBefore(sent.tokens, ti, langConfig.scriptIsUnspaced);
                // Due vocab words become cloze blanks — rendered separately.
                if (isReviewWord) {
                  const occurrenceId = `${si}-${ti}`;
                  const storedEntry = restoredClozeGrades?.get(occurrenceId);
                  return (
                    <Fragment key={`${ti}-${storedEntry !== undefined ? 'r' : 'f'}`}>
                    {space}
                    <ClozeBlank
                      token={token}
                      showHint={showClozeHints ?? true}
                      onGrade={(correct) => onClozeAnswer?.(occurrenceId, reviewKey, correct)}
                      initialGrade={storedEntry ? { correct: storedEntry.grade === 3 } : undefined}
                      onWordClick={openTokenPopup}
                    />
                    </Fragment>
                  );
                }
                const claimKind = (
                  pendingDeckWords.has(token.text) ||
                  (langConfig.usesBaseForms && !!token.baseForm && pendingDeckWords.has(token.baseForm))
                ) ? 'vocab' : null;
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
                      claimKind={claimKind}
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
