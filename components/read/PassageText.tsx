'use client';
import { useState, useCallback } from 'react';
import type { PassageToken, DeckWord, Sentence } from '@/lib/types';
import type { PopupData } from './WordPopup';
import WordPopup from './WordPopup';
import { storage } from '@/lib/storage';

interface Props {
  sentences: Sentence[];
  activeSentenceIdx: number;
  showPinyin: boolean;
  audioOnly: boolean;
  peeked: Set<string>;
  onPeek: (word: string) => void;
  deckWords: Set<string>;
  onAddToDeck: (word: DeckWord) => void;
}

function TokenEl({ token, peeked, isReviewWord, isClaimed, onClick }: {
  token: PassageToken;
  peeked: boolean;
  isReviewWord: boolean;
  isClaimed: boolean;
  onClick: (e: React.MouseEvent, token: PassageToken) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const isFree = token.type === 'free';
  const isPunct = token.type === 'punct' || (!token.type);

  if (isPunct) return <span>{token.text}</span>;

  const isInteractive = !isClaimed && !isReviewWord;

  return (
    <ruby
      onClick={e => onClick(e, token)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="cursor-pointer transition-all duration-150 relative"
      style={{
        borderBottom: isReviewWord
          ? peeked
            ? '2px solid var(--accent)'
            : '1.5px dotted var(--accent)'
          : isClaimed
            ? '1.5px solid color-mix(in srgb, var(--jade) 80%, transparent)'
            : '1.5px dotted color-mix(in srgb, var(--ink-faint) 70%, transparent)',
        color: peeked && isReviewWord ? 'var(--accent-deep)' : undefined,
        paddingBottom: 1,
        background: hovered && isInteractive
          ? 'color-mix(in srgb, var(--accent) 14%, transparent)'
          : 'transparent',
        borderRadius: 3,
        cursor: isClaimed ? 'default' : 'pointer',
      }}
    >
      {token.text}
      {peeked && isReviewWord && (
        <span style={{ fontFamily: 'var(--f-ui)', fontSize: '.5em', verticalAlign: 'super', color: 'var(--accent)', marginLeft: 1, fontWeight: 600 }}>↺</span>
      )}
      {isClaimed && (
        <span style={{ fontFamily: 'var(--f-ui)', fontSize: '.5em', verticalAlign: 'super', color: 'var(--jade)', marginLeft: 1, fontWeight: 600 }}>+</span>
      )}
      {/* suppress unused var warning */ isFree && false && null}
      <rt>{token.pinyin}</rt>
    </ruby>
  );
}

export default function PassageText({ sentences, activeSentenceIdx, showPinyin, audioOnly, peeked, onPeek, deckWords, onAddToDeck }: Props) {
  const [popup, setPopup] = useState<PopupData | null>(null);
  // Session-local claimed tracking (words added/learned this session)
  const [claimed, setClaimed] = useState<Set<string>>(new Set());

  const handleTokenClick = useCallback((e: React.MouseEvent, token: PassageToken) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    if (!token.type || token.type === 'punct') return;

    const isReviewWord = token.type === 'vocab' && deckWords.has(token.text);

    // Claimed this session: no action
    if (claimed.has(token.text) && !isReviewWord) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

    if (isReviewWord) {
      onPeek(token.text);
      setPopup({ word: token.text, pinyin: token.pinyin || '', meaning: token.meaning || '', type: 'vocab', anchorRect: rect });
    } else {
      setPopup({ word: token.text, pinyin: token.pinyin || '', meaning: token.meaning || '', type: 'free', anchorRect: rect });
    }
  }, [claimed, onPeek, deckWords]);

  const handleAddVocab = useCallback(async (word: string, pinyin: string, meaning: string) => {
    // Persist to claimed words storage
    const c = await storage.getClaimedWords();
    const updated = { ...c, vocab: [...new Set([...c.vocab, word])] };
    await storage.saveClaimedWords(updated);
    // Mark locally
    setClaimed(prev => new Set([...prev, word]));
    // Add to user's vocab deck
    onAddToDeck({ h: word, p: pinyin, m: meaning });
  }, [onAddToDeck]);

  const handleLearnTomorrow = useCallback(async (word: string) => {
    const c = await storage.getClaimedWords();
    const updated = { ...c, tomorrow: [...new Set([...c.tomorrow, word])] };
    await storage.saveClaimedWords(updated);
    setClaimed(prev => new Set([...prev, word]));
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
          <div className="flex items-end gap-1.5" style={{ height: 60 }}>
            {[18, 60, 90, 45, 75, 30, 60].map((h, i) => (
              <span
                key={i}
                className="block w-[5px] rounded-[3px]"
                style={{
                  height: `${h}%`,
                  background: 'var(--accent)',
                  opacity: .55,
                  animation: `wave 1.1s ease-in-out infinite`,
                  animationDelay: `${i * 0.1}s`,
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
                const isReviewWord = token.type === 'vocab' && deckWords.has(token.text);
                const isClaimed = !isReviewWord && claimed.has(token.text);
                return (
                  <TokenEl
                    key={ti}
                    token={token}
                    peeked={peeked.has(token.text) && isReviewWord}
                    isReviewWord={isReviewWord}
                    isClaimed={isClaimed}
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
