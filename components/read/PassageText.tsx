'use client';
import { useState, useCallback } from 'react';
import type { PassageToken, DeckWord, Sentence } from '@/lib/types';
import type { PopupData, CompoundHint } from './WordPopup';
import WordPopup from './WordPopup';
import { lookupWord } from '@/lib/data/dict';
import { pickReading, type ReadingHint } from '@/lib/readings';
import type { ClaimKind } from '@/hooks/useClaims';

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
  peeked: Set<string>;
  onPeek: (word: string) => void;
  deckWords: Set<string>;
  /** Deck words whose next review is due now → dotted accent underline (review word). */
  dueDeckWords: Set<string>;
  /** Deck words added but not yet due (new card, e.g. "due tomorrow") → green '+' badge. */
  pendingDeckWords: Set<string>;
  deckReadings?: Map<string, ReadingHint[]>;
  onAddToDeck: (word: DeckWord) => void;
  /** Shared session claim state — used only for the "learn tomorrow" preview badge now;
   *  the added/due visuals are derived from the deck so they survive reloads. */
  claims: Map<string, ClaimKind>;
  onClaimVocab: (word: string) => void;
  onClaimTomorrow: (word: string) => void;
}

function TokenEl({ token, peeked, isReviewWord, claimKind, compounds, onClick }: {
  token: PassageToken;
  peeked: boolean;
  isReviewWord: boolean;
  claimKind: 'vocab' | 'tomorrow' | null;
  compounds: CompoundHint[];
  onClick: (e: React.MouseEvent, token: PassageToken, compounds: CompoundHint[]) => void;
}) {
  const [hovered, setHovered] = useState(false);
  // Non-interactive when there's no pinyin or the token is punctuation
  if (!token.pinyin || token.type === 'punct') return <span>{token.text}</span>;

  // Indicator character and color — empty string when none so the span is always present
  const indicatorChar  = claimKind === 'vocab' ? '+' : claimKind === 'tomorrow' ? '▸' : (peeked && isReviewWord) ? '↺' : '';
  const indicatorColor = claimKind === 'vocab' ? 'var(--jade)' : claimKind === 'tomorrow' ? 'var(--gold)' : 'var(--accent)';

  return (
    <>
      <ruby
        onClick={e => onClick(e, token, compounds)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="cursor-pointer"
        style={{
          borderBottom: isReviewWord
            ? peeked
              ? '1.5px solid var(--accent)'
              : '1.5px dotted var(--accent)'
            : claimKind === 'vocab'
              ? '1.5px solid color-mix(in srgb, var(--jade) 80%, transparent)'
              : claimKind === 'tomorrow'
                ? '1.5px solid color-mix(in srgb, var(--gold) 80%, transparent)'
                : '1.5px dotted color-mix(in srgb, var(--ink-faint) 70%, transparent)',
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
        <rt>{token.pinyin}</rt>
      </ruby>
      {/*
        Always-rendered inline sibling — only `color` changes between states.
        Natural (non-zero) width keeps it in flow AFTER the character so it
        never overlaps the next character. verticalAlign:'super' raises it to
        the standard superscript position (clear of the ruby base text).
        lineHeight:0 prevents it from expanding the parent line-height.
      */}
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
    </>
  );
}

export default function PassageText({ sentences, activeSentenceIdx, showPinyin, audioOnly, peeked, onPeek, deckWords, dueDeckWords, pendingDeckWords, deckReadings, onAddToDeck, claims, onClaimVocab, onClaimTomorrow }: Props) {
  const [popup, setPopup] = useState<PopupData | null>(null);
  // Visual state is derived from the deck's scheduling (passed in via dueDeckWords /
  // pendingDeckWords), so it survives reloads and only flips on the real due day:
  //   due now → review word (accent, click reveals = counts as forgotten)
  //   pending → added but not yet due (green '+', click just shows the definition)
  // The "learn tomorrow" preview (gold '▸') isn't in the deck, so it still rides on `claims`.

  const handleTokenClick = useCallback((e: React.MouseEvent, token: PassageToken, compounds: CompoundHint[]) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    // Skip true punctuation and words with no pinyin data
    if (!token.pinyin || token.type === 'punct') return;

    const isReviewWord = dueDeckWords.has(token.text) && token.type === 'vocab';
    const isPending    = !isReviewWord && pendingDeckWords.has(token.text);
    const isTomorrow   = !isReviewWord && !isPending && claims.get(token.text) === 'tomorrow';
    const inDeck       = deckWords.has(token.text);

    const el = e.currentTarget as HTMLElement;
    const rects = el.getClientRects();
    const rect = rects.length > 0 ? rects[0] : el.getBoundingClientRect();

    const entry = lookupWord(token.text, token.pinyin || '', token.meaning || '');
    // Only surface compound hints for single-char tokens not already tracked in the deck
    const compoundHints = (token.text.length === 1 && !inDeck && !isTomorrow) ? compounds : [];

    // For a word in the user's deck, show THEIR customized pinyin + meaning (not the
    // dictionary's). For a polyphone, headline the reading matching this token's pinyin
    // and list the rest under "also read as".
    let pin = entry.pinyin, mean = entry.meaning;
    let otherReadings: { p: string; m: string }[] | undefined;
    const allReadings = deckReadings?.get(token.text);
    if (allReadings && allReadings.length >= 1) {
      const matched = pickReading(allReadings, token.pinyin || '') ?? allReadings[0];
      pin = matched.p || entry.pinyin;
      mean = matched.m || entry.meaning;
      if (allReadings.length > 1) {
        otherReadings = allReadings.filter(r => r !== matched).map(r => ({ p: r.p, m: r.m }));
      }
    }

    if (isReviewWord) {
      onPeek(token.text);
      setPopup({ word: token.text, pinyin: pin, meaning: mean, type: 'vocab', anchorRect: rect, compounds: compoundHints, otherReadings });
    } else if (isPending || inDeck) {
      // Added to the deck (pending its first review, or just not due today) — definition only.
      setPopup({ word: token.text, pinyin: pin, meaning: mean, type: 'lookup', anchorRect: rect, otherReadings });
    } else if (isTomorrow) {
      setPopup({ word: token.text, pinyin: pin, meaning: mean, type: 'tomorrow', anchorRect: rect, otherReadings });
    } else {
      setPopup({ word: token.text, pinyin: pin, meaning: mean, type: 'free', anchorRect: rect, compounds: compoundHints, otherReadings });
    }
  }, [claims, onPeek, deckWords, dueDeckWords, pendingDeckWords, deckReadings]);

  const handleAddVocab = useCallback((word: string, pinyin: string, meaning: string) => {
    onClaimVocab(word);
    onAddToDeck({ h: word, p: pinyin, m: meaning });
  }, [onClaimVocab, onAddToDeck]);

  const handleLearnTomorrow = useCallback((word: string) => {
    onClaimTomorrow(word);
  }, [onClaimTomorrow]);

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
            <span
              key={si}
              className="transition-all duration-200 rounded-[5px]"
              style={
                si === activeSentenceIdx
                  ? { background: 'var(--accent-soft)', boxShadow: '0 0 0 4px var(--accent-soft)' }
                  : {}
              }
            >
              {sent.tokens.map((token, ti) => {
                // due → accent (review word); else pending → green '+'; else a tomorrow
                // preview → gold '▸'. Derived from deck scheduling so it persists across
                // reloads and only flips to the accent review style on the real due day.
                const isReviewWord = dueDeckWords.has(token.text) && token.type === 'vocab';
                const claimKind = isReviewWord ? null
                  : pendingDeckWords.has(token.text) ? 'vocab'
                  : claims.get(token.text) === 'tomorrow' ? 'tomorrow'
                  : null;
                // Detect neighboring compounds for single-char tokens
                const compounds = findCompoundHints(token, sent, ti);
                return (
                  <TokenEl
                    key={ti}
                    token={token}
                    peeked={peeked.has(token.text) && isReviewWord}
                    isReviewWord={isReviewWord}
                    claimKind={claimKind}
                    compounds={compounds}
                    onClick={handleTokenClick}
                  />
                );
              })}
            </span>
          ))}
        </div>
      )}

      <WordPopup
        data={popup}
        onClose={() => setPopup(null)}
        onAddVocab={handleAddVocab}
        onLearnTomorrow={handleLearnTomorrow}
      />
    </div>
  );
}
