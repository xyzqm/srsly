'use client';
import { useState, useCallback, useEffect } from 'react';
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
        Zero-width sibling span: always rendered so the DOM structure never changes
        (adding/removing DOM nodes inside <ruby> causes layout recalculation → shake).
        width:0 + overflow:visible means the indicator character is visually present
        but contributes zero space to the inline flow → no layout shift ever.
      */}
      <span
        aria-hidden="true"
        style={{
          display: 'inline-block',
          width: 0,
          overflow: 'visible',
          whiteSpace: 'nowrap',
          fontFamily: 'var(--f-ui)',
          fontSize: '.5em',
          lineHeight: 0,
          verticalAlign: 'super',
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
  useEffect(() => {
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

  // Seed claimType from storage so words added in previous sessions still look claimed
  useEffect(() => {
    storage.getClaimedWords().then(claimed => {
      const map = new Map<string, 'vocab' | 'tomorrow'>();
      claimed.vocab.forEach(w => map.set(w, 'vocab'));
      claimed.tomorrow.forEach(w => map.set(w, 'tomorrow'));
      if (map.size > 0) setClaimType(map);
    });
  }, []);

  const handleTokenClick = useCallback((e: React.MouseEvent, token: PassageToken) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    // Skip true punctuation and words with no pinyin data
    if (!token.pinyin || token.type === 'punct') return;

    const isClaimed = claimType.has(token.text);
    // Priority: claimed this session > SRS review word
    const isReviewWord = !isClaimed && token.type === 'vocab' && deckWords.has(token.text);

    const el = e.currentTarget as HTMLElement;
    const rects = el.getClientRects();
    const rect = rects.length > 0 ? rects[0] : el.getBoundingClientRect();

    const entry = lookupWord(token.text, token.pinyin || '', token.meaning || '');
    if (isReviewWord) {
      onPeek(token.text);
      setPopup({ word: token.text, pinyin: entry.pinyin, meaning: entry.meaning, type: 'vocab', anchorRect: rect });
    } else if (isClaimed) {
      const kind = claimType.get(token.text);
      setPopup({ word: token.text, pinyin: entry.pinyin, meaning: entry.meaning, type: kind === 'tomorrow' ? 'tomorrow' : 'lookup', anchorRect: rect });
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
                // Vocab claims are only active while the word is still in the deck
                const rawClaimKind = claimType.get(token.text) ?? null;
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
