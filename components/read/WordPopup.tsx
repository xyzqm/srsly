'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import CharacterBreakdown from './CharacterBreakdown';

function useIsMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted;
}

/** Display definitions separated by semicolons (some sources use a middle dot). */
function fmtMeaning(m: string): string {
  return m.replace(/\s*·\s*/g, '; ');
}

export interface CompoundHint {
  text: string;
  pinyin: string;
  meaning: string;
}

export interface PopupData {
  word: string;
  pinyin: string;
  meaning: string;
  /** Dictionary (base) form when the word is a conjugated verb/adjective (ja only). */
  baseForm?: string;
  baseReading?: string;
  /** vocab = SRS word (show "revealed" warning); free = new word (show Add-to-vocab button);
   *  lookup = already in the vocab deck (definition only); pool = staged but not yet in play */
  type: 'vocab' | 'free' | 'lookup' | 'pool';
  /** For 'lookup': whether the word was added JUST NOW rather than already being in the
   *  deck. "Added to your deck" is a confirmation of something you just did; saying it
   *  about a word you banked weeks ago reads as if the click did something. */
  justAdded?: boolean;
  anchorRect: DOMRect;
  /** Adjacent compound words this character belongs to (e.g. 已 → 已经) */
  compounds?: CompoundHint[];
  /** Other readings of this character in the deck (e.g. 行 háng when xíng is shown) */
  otherReadings?: { p: string; m: string }[];
}

interface Props {
  data: PopupData | null;
  onClose: () => void;
  onAddVocab: (word: string, pinyin: string, meaning: string) => void;
  onReleaseFromPool?: (word: string) => void;
}

export default function WordPopup({ data, onClose, onAddVocab, onReleaseFromPool }: Props) {
  const mounted = useIsMounted();
  const popRef = useRef<HTMLDivElement>(null);
  // Keep last data around so content stays visible during the close fade
  const lastDataRef = useRef<PopupData | null>(null);
  if (data) lastDataRef.current = data;
  const displayData = data ?? lastDataRef.current;

  // Track pool-release confirmation so the popup stays open with a success message.
  const [released, setReleased] = useState(false);
  // Reset when a new word is opened.
  const prevWord = useRef<string | null>(null);
  if (data && data.word !== prevWord.current) { prevWord.current = data.word; setReleased(false); }

  const handleRelease = useCallback(() => {
    if (!displayData || !onReleaseFromPool) return;
    onReleaseFromPool(displayData.baseForm ?? displayData.word);
    setReleased(true);
  }, [displayData, onReleaseFromPool]);

  // Track whether we're fully positioned (avoid seeing popup at (0,0) before rAF)
  const [ready, setReady] = useState(false);
  // Track whether popup is placed below the word (arrow flips to point up)
  const [below, setBelow] = useState(false);

  useEffect(() => {
    if (!data) { setReady(false); return; }
    const pop = popRef.current;
    if (!pop) return;

    const pw = 254;
    const r = data.anchorRect;

    // Centre popup horizontally on the word, clamped to viewport
    let left = r.left + r.width / 2 - pw / 2;
    left = Math.max(10, Math.min(left, window.innerWidth - pw - 10));

    pop.style.visibility = 'hidden';
    pop.style.left = left + 'px';
    pop.style.top = '0px';

    requestAnimationFrame(() => {
      if (!popRef.current) return;
      const ph = pop.offsetHeight;
      const topAbove = r.top - ph - 12;
      const topBelow = r.bottom + 10;
      const isBelow = topAbove < 8;
      pop.style.top = (isBelow ? topBelow : topAbove) + 'px';

      // Arrow x-offset — points at the word's centre, clamped to popup edges
      const wordCx = r.left + r.width / 2;
      const ax = Math.max(14, Math.min(wordCx - left, pw - 14));
      pop.style.setProperty('--arrow-x', ax + 'px');

      pop.style.visibility = '';
      setBelow(isBelow);
      setReady(true);
    });
  }, [data]);

  // Close when clicking outside or scrolling
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  useEffect(() => {
    if (!data) return;
    const onScroll = () => onClose();
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', onScroll, { capture: true });
  }, [data, onClose]);

  const show = !!data && ready;

  const popup = (
    <div
      ref={popRef}
      onClick={e => e.stopPropagation()}
      className="fixed w-[254px] p-[14px_16px] rounded-xl"
      style={{
        zIndex: 9999,
        background: 'var(--pop-bg)',
        color: 'var(--pop-fg)',
        fontFamily: 'var(--f-ui)',
        boxShadow: '0 8px 32px rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.14)',
        // Fade only — no translateY on close so popup never drifts toward the passage
        opacity: show ? 1 : 0,
        transform: 'translateY(0)',
        pointerEvents: show ? 'auto' : 'none',
        transition: 'opacity .15s ease',
      }}
    >
      {/* Close × */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded-full cursor-pointer"
        style={{
          background: 'rgba(255,255,255,.13)',
          border: 'none',
          color: 'var(--pop-fg)',
          fontSize: 14,
          lineHeight: 1,
          opacity: 0.65,
          transition: 'opacity .12s',
        }}
        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
        onMouseLeave={e => (e.currentTarget.style.opacity = '0.65')}
        aria-label="Close"
      >
        ×
      </button>

      {/* Arrow — points toward the word (down when above it, up when below it) */}
      <div
        style={{
          position: 'absolute',
          left: 'var(--arrow-x, 50%)',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          ...(below
            ? { bottom: '100%', borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderBottom: '7px solid var(--pop-bg)' }
            : { top: '100%',    borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderTop: '7px solid var(--pop-bg)' }
          ),
        }}
      />

      {displayData && (
        <>
          <div className="flex items-baseline gap-2 pr-5 flex-wrap">
            <span style={{ fontFamily: 'var(--f-han)', fontSize: 22, fontWeight: 'var(--han-weight)' as 'bold' }}>
              {displayData.baseForm ?? displayData.word}
            </span>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--pop-pin)', marginLeft: 6 }}>
              {displayData.baseReading ?? displayData.pinyin}
            </span>
          </div>
          <div style={{ fontSize: 13.5, marginTop: 5, lineHeight: 1.5 }}>
            {displayData.meaning
              ? fmtMeaning(displayData.meaning)
              : <em style={{ opacity: 0.35, fontSize: 12 }}>definition not in local dictionary</em>
            }
          </div>

          {/* Other readings — shown when this character has more than one reading in the deck */}
          {displayData.otherReadings && displayData.otherReadings.length > 0 && (
            <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,.1)' }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', opacity: 0.4, marginBottom: 5 }}>
                also read as
              </div>
              {displayData.otherReadings.map((r, ri) => (
                <div key={ri} className="flex items-baseline gap-2 mb-1">
                  <span style={{ fontFamily: 'var(--f-mono)', fontSize: 11, color: 'var(--pop-pin)', flexShrink: 0 }}>{r.p}</span>
                  <span style={{ fontSize: 12, opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtMeaning(r.m)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Compound hints — shown for single-char words that appear in a compound nearby */}
          {/* The popup is the right home for this: you clicked the character to ask about it,
              so an explanation is what you came for. It is deliberately NOT offered next to a
              cloze blank — see CharacterBreakdown. */}
          <CharacterBreakdown word={displayData.baseForm ?? displayData.word} gloss={displayData.meaning} variant="popup" />

          {displayData.compounds && displayData.compounds.length > 0 && (
            <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,.1)' }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', opacity: 0.4, marginBottom: 5 }}>
                also part of
              </div>
              {displayData.compounds.map(c => (
                <div key={c.text} className="flex items-baseline justify-between gap-2 mb-1.5">
                  <div className="flex items-baseline gap-1.5 min-w-0">
                    <span style={{ fontFamily: 'var(--f-han)', fontSize: 16, fontWeight: 'var(--han-weight)' as 'bold' }}>{c.text}</span>
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--pop-pin)', flexShrink: 0 }}>{c.pinyin}</span>
                    <span style={{ fontSize: 11.5, opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtMeaning(c.meaning)}</span>
                  </div>
                  {displayData.type === 'free' && (
                    <button
                      onClick={() => { onAddVocab(c.text, c.pinyin, c.meaning); onClose(); }}
                      className="shrink-0 cursor-pointer rounded-md transition-all duration-150"
                      style={{ fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '.06em', background: 'var(--jade)', border: 'none', color: '#fff', padding: '3px 7px', fontWeight: 600 }}
                    >
                      + add
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {displayData.type === 'vocab' && (
            <div
              className="flex gap-2 mt-2 pt-2 text-[11.5px]"
              style={{ borderTop: '1px solid rgba(255,255,255,.12)', color: 'var(--pop-warn)', lineHeight: 1.35 }}
            >
              ↺ <span>Revealed — counts as <strong style={{ color: 'var(--pop-warn-strong)' }}>forgotten</strong>, returns tomorrow</span>
            </div>
          )}

          {displayData.type === 'free' && (
            <div className="flex flex-col gap-1.5 mt-3 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,.1)' }}>
              <button
                onClick={() => { onAddVocab(displayData.baseForm ?? displayData.word, displayData.baseReading ?? displayData.pinyin, displayData.meaning); onClose(); }}
                className="w-full text-left rounded-lg py-2 px-3 cursor-pointer transition-all duration-150"
                style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.05em', background: 'var(--jade)', border: 'none', color: '#fff', lineHeight: 1.3, fontWeight: 600 }}
              >
                Add to vocab
                <span className="block font-normal opacity-65 mt-0.5" style={{ fontSize: 9, textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
                  Joins your SRS deck — reviewed regularly starting tomorrow
                </span>
              </button>
            </div>
          )}

          {displayData.type === 'lookup' && (
            <div
              className="mt-2 pt-2 text-[11px]"
              style={{ borderTop: '1px solid rgba(255,255,255,.1)', color: 'rgba(120,210,120,.85)', fontFamily: 'var(--f-mono)', letterSpacing: '.05em' }}
            >
              {displayData.justAdded ? '+ Added to your deck' : '✓ Already in your deck'}
            </div>
          )}

          {displayData.type === 'pool' && (
            <div className="flex flex-col gap-1.5 mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,.1)' }}>
              <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(180,180,255,.65)' }}>
                In pool — staged, not yet in play
              </div>
              {released ? (
                <div
                  className="mt-1 text-[11px]"
                  style={{ fontFamily: 'var(--f-mono)', letterSpacing: '.05em', color: 'rgba(120,210,120,.85)' }}
                >
                  ✓ Added into play — due tomorrow
                </div>
              ) : onReleaseFromPool && (
                <button
                  onClick={handleRelease}
                  className="w-full text-left rounded-lg py-2 px-3 cursor-pointer transition-all duration-150"
                  style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.05em', background: 'rgba(120,120,220,.25)', border: '1px solid rgba(150,150,255,.3)', color: 'rgba(200,200,255,.9)', lineHeight: 1.3, fontWeight: 600 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(120,120,220,.4)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(120,120,220,.25)')}
                >
                  Add into play
                  <span className="block font-normal opacity-65 mt-0.5" style={{ fontSize: 9, textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
                    Enters your review queue starting tomorrow
                  </span>
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );

  if (!mounted) return null;
  return createPortal(popup, document.body);
}
