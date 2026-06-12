'use client';
import { useState, useCallback, useLayoutEffect } from 'react';
import type { PassageToken, DeckWord, Sentence } from '@/lib/types';
import type { PopupData } from './WordPopup';
import WordPopup from './WordPopup';
import { storage } from '@/lib/storage';
import { lookupWord } from '@/lib/data/dict';

interface Props {
  sentences: Sentence[];
  activeSentenceIdx: number;
  showPinyin?: boolean;
  audioOnly: boolean;
  peeked: Set<string>;
  onPeek: (word: string) => void;
  deckWords: Set<string>;
  onAddToDeck: (word: DeckWord) => void;
}

function TokenEl({ token, peeked, isReviewWord, claimKind, onClick }: {
  token: PassageToken;
  peeked: boolean;
  isReviewWord: boolean;
  claimKind: 'vocab' | 'tomorrow' | null;
  onClick: (e: React.MouseEvent, token: PassageToken) => void;
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
        onClick={e => onClick(e, token)}
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

export default function PassageText({ sentences, activeSentenceIdx, showPinyin, audioOnly, peeked, onPeek, deckWords, onAddToDeck }: Props) {
  const [popup, setPopup] = useState<PopupData | null>(null);
  // Claimed tracking: maps word → 'vocab' | 'tomorrow'
  const [claimType, setClaimType] = useState<Map<string, 'vocab' | 'tomorrow'>>(new Map());

  // When deckWords shrinks (word removed from deck), clear its vocab claim so the
  // green underline + badge disappear and the popup lets the user re-add it.
  // useLayoutEffect fires synchronously before the browser paints → no visible flash.
  useLayoutEffect(() => {
    setClaimType(prev => {
      let changed = false;
      const next = new Map(prev);
      for (const [word, kind] of prev) {
        if (kind === 'vocab' && !deckWords.has(word)) {
          next.delete(word);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [deckWords]);

  // No storage seeding — badges only appear when the user explicitly
  // adds a word in the current session. Deck words from previous sessions
  // show as SRS review words (accent underline, "revealed = forgotten" popup).

  const handleTokenClick = useCallback((e: React.MouseEvent, token: PassageToken) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    // Skip true punctuation and words with no pinyin data
    if (!token.pinyin || token.type === 'punct') return;

    // Apply the same deck-check as the render section so a word removed from the
    // deck (but still in claimType from this session) shows the free popup.
    const rawClaimKind = claimType.get(token.text) ?? null;
    const effectiveClaimKind = rawClaimKind === 'vocab' && !deckWords.has(token.text) ? null : rawClaimKind;
    const isClaimed = effectiveClaimKind !== null;
    // Priority: claimed this session > SRS review word
    const isReviewWord = !isClaimed && token.type === 'vocab' && deckWords.has(token.text);

    const el = e.currentTarget as HTMLElement;
    const rects = el.getClientRects();
    const rect = rects.length > 0 ? rects[0] : el.getBoundingClientRect();

    const entry = lookupWord(token.text, token.pinyin || '', token.meaning || '');
    if (isReviewWord) {
      // SRS vocab word — opening counts as forgotten for this session
      onPeek(token.text);
      setPopup({ word: token.text, pinyin: entry.pinyin, meaning: entry.meaning, type: 'vocab', anchorRect: rect });
    } else if (isClaimed) {
      // Added in this session
      setPopup({ word: token.text, pinyin: entry.pinyin, meaning: entry.meaning, type: effectiveClaimKind === 'tomorrow' ? 'tomorrow' : 'lookup', anchorRect: rect });
    } else if (deckWords.has(token.text)) {
      // Already in deck from a previous session — show definition without add button
      onPeek(token.text);
      setPopup({ word: token.text, pinyin: entry.pinyin, meaning: entry.meaning, type: 'vocab', anchorRect: rect });
    } else {
      setPopup({ word: token.text, pinyin: entry.pinyin, meaning: entry.meaning, type: 'free', anchorRect: rect });
    }
  }, [claimType, onPeek, deckWords]);

  const handleAddVocab = useCallback(async (word: string, pinyin: string, meaning: string) => {
    setClaimType(prev => new Map([...prev, [word, 'vocab']]));
    onAddToDeck({ h: word, p: pinyin, m: meaning });
    // Persist in background
    const c = await storage.getClaimedWords();
    await storage.saveClaimedWords({ ...c, vocab: [...new Set([...c.vocab, word])] });
  }, [onAddToDeck]);

  const handleLearnTomorrow = useCallback(async (word: string) => {
    // Optimistic update first
    setClaimType(prev => new Map([...prev, [word, 'tomorrow']]));
    // Persist in background
    const c = await storage.getClaimedWords();
    await storage.saveClaimedWords({ ...c, tomorrow: [...new Set([...c.tomorrow, word])] });
  }, []);

  return (
    <div>
      {/* Audio-only cover */}
      {audioOnly && (
        <div
          className="flex flex-col items-center justify-center text-center gap-4 p-12 rounded-xl"
          style={{ border: '1px dashed var(--line)', background: 'linear-gradient(180deg, color-mix(in srgb, var(--card) 30%, white), var(--card))' }}
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
                const rawClaimKind = claimType.get(token.text) ?? null;
                // Mask a stale 'vocab' claim when the word is no longer in the deck
                // (e.g. added then removed). React 18 auto-batches setClaimType and
                // setDeck from the same event, so both are in sync during a new add.
                const claimKind = rawClaimKind === 'vocab' && !deckWords.has(token.text) ? null : rawClaimKind;
                const isClaimed = claimKind !== null;
                // Claimed takes priority over SRS review
                const isReviewWord = !isClaimed && token.type === 'vocab' && deckWords.has(token.text);
                return (
                  <TokenEl
                    key={ti}
                    token={token}
                    peeked={peeked.has(token.text) && isReviewWord}
                    isReviewWord={isReviewWord}
                    claimKind={claimKind}
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
