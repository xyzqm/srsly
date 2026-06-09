'use client';
import { useState, useEffect, useCallback } from 'react';
import type { PassageToken, Sentence } from '@/lib/types';
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
}

function TokenEl({ token, peeked, onClick }: {
  token: PassageToken;
  peeked: boolean;
  onClick: (e: React.MouseEvent, token: PassageToken) => void;
}) {
  const isVocab = token.type === 'vocab';
  const isFree = token.type === 'free';
  const isPunct = !isVocab && !isFree;

  if (isPunct) {
    return <span>{token.text}</span>;
  }

  return (
    <ruby
      onClick={e => onClick(e, token)}
      className="cursor-pointer transition-all duration-150 relative"
      style={{
        borderBottom: isVocab
          ? peeked
            ? '2px solid var(--accent)'
            : '1.5px dotted var(--accent)'
          : '1.5px dotted color-mix(in srgb, var(--ink-faint) 70%, transparent)',
        color: peeked ? 'var(--accent-deep)' : undefined,
        paddingBottom: 1,
      }}
    >
      {token.text}
      {peeked && isVocab && (
        <span style={{ fontFamily: 'var(--f-ui)', fontSize: '.5em', verticalAlign: 'super', color: 'var(--accent)', marginLeft: 1, fontWeight: 600 }}>↺</span>
      )}
      <rt>{token.pinyin}</rt>
    </ruby>
  );
}

export default function PassageText({ sentences, activeSentenceIdx, showPinyin, audioOnly, peeked, onPeek }: Props) {
  const [popup, setPopup] = useState<PopupData | null>(null);
  const [claimed, setClaimed] = useState<Set<string>>(new Set());

  useEffect(() => {
    storage.getClaimedWords().then(c => setClaimed(new Set([...c.vocab, ...c.tomorrow])));
  }, []);

  const handleTokenClick = useCallback((e: React.MouseEvent, token: PassageToken) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    if (!token.type || token.type === 'punct') return;
    if (token.type === 'free' && claimed.has(token.text)) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

    if (token.type === 'vocab') {
      onPeek(token.text);
    }

    setPopup({
      word: token.text,
      pinyin: token.pinyin || '',
      meaning: token.meaning || '',
      type: token.type,
      anchorRect: rect,
    });
  }, [claimed, onPeek]);

  const handleAddVocab = useCallback(async (word: string) => {
    const c = await storage.getClaimedWords();
    const updated = { ...c, vocab: [...new Set([...c.vocab, word])] };
    await storage.saveClaimedWords(updated);
    setClaimed(new Set([...updated.vocab, ...updated.tomorrow]));
  }, []);

  const handleLearnTomorrow = useCallback(async (word: string) => {
    const c = await storage.getClaimedWords();
    const updated = { ...c, tomorrow: [...new Set([...c.tomorrow, word])] };
    await storage.saveClaimedWords(updated);
    setClaimed(new Set([...updated.vocab, ...updated.tomorrow]));
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
              {sent.tokens.map((token, ti) => (
                <TokenEl
                  key={ti}
                  token={token}
                  peeked={peeked.has(token.text) && token.type === 'vocab'}
                  onClick={handleTokenClick}
                />
              ))}
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
