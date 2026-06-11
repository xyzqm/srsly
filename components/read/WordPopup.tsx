'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

function useIsMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted;
}

export interface PopupData {
  word: string;
  pinyin: string;
  meaning: string;
  /** vocab = SRS word (show "revealed" warning); free = new word (show action buttons);
   *  lookup = added to vocab deck (definition only); tomorrow = scheduled for tomorrow (definition only) */
  type: 'vocab' | 'free' | 'lookup' | 'tomorrow';
  anchorRect: DOMRect;
}

interface Props {
  data: PopupData | null;
  onClose: () => void;
  onAddVocab: (word: string, pinyin: string, meaning: string) => void;
  onLearnTomorrow: (word: string) => void;
}

export default function WordPopup({ data, onClose, onAddVocab, onLearnTomorrow }: Props) {
  const mounted = useIsMounted();
  const popRef = useRef<HTMLDivElement>(null);
  // Keep last data around so content stays visible during the close fade
  const lastDataRef = useRef<PopupData | null>(null);
  if (data) lastDataRef.current = data;
  const displayData = data ?? lastDataRef.current;

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
          <div className="flex items-baseline gap-2 pr-5">
            <span style={{ fontFamily: 'var(--f-han)', fontSize: 22, fontWeight: 'var(--han-weight)' as 'bold' }}>
              {displayData.word}
            </span>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--pop-pin)', marginLeft: 6 }}>
              {displayData.pinyin}
            </span>
          </div>
          <div style={{ fontSize: 13.5, marginTop: 5, lineHeight: 1.5 }}>
            {displayData.meaning
              ? displayData.meaning
              : <em style={{ opacity: 0.35, fontSize: 12 }}>definition not in local dictionary</em>
            }
          </div>

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
                onClick={() => { onAddVocab(displayData.word, displayData.pinyin, displayData.meaning); onClose(); }}
                className="w-full text-left rounded-lg py-2 px-3 cursor-pointer transition-all duration-150"
                style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.05em', background: 'var(--jade)', border: 'none', color: '#fff', lineHeight: 1.3, fontWeight: 600 }}
              >
                Add to vocab
                <span className="block font-normal opacity-65 mt-0.5" style={{ fontSize: 9, textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
                  Joins your SRS deck — reviewed regularly
                </span>
              </button>
              <button
                onClick={() => { onLearnTomorrow(displayData.word); onClose(); }}
                className="w-full text-left rounded-lg py-2 px-3 cursor-pointer transition-all duration-150"
                style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.05em', background: 'rgba(255,255,255,.09)', border: 'none', color: 'var(--pop-fg)', lineHeight: 1.3 }}
              >
                Learn this word
                <span className="block opacity-55 mt-0.5" style={{ fontSize: 9, textTransform: 'none', letterSpacing: 0 }}>
                  Due tomorrow only — won&apos;t recur unless added
                </span>
              </button>
            </div>
          )}

          {displayData.type === 'lookup' && (
            <div
              className="mt-2 pt-2 text-[11px]"
              style={{ borderTop: '1px solid rgba(255,255,255,.1)', color: 'rgba(120,210,120,.85)', fontFamily: 'var(--f-mono)', letterSpacing: '.05em' }}
            >
              + Added to your deck
            </div>
          )}

          {displayData.type === 'tomorrow' && (
            <div
              className="mt-2 pt-2 text-[11px]"
              style={{ borderTop: '1px solid rgba(255,255,255,.1)', color: 'rgba(210,175,90,.85)', fontFamily: 'var(--f-mono)', letterSpacing: '.05em' }}
            >
              ▸ Due tomorrow only
            </div>
          )}
        </>
      )}
    </div>
  );

  if (!mounted) return null;
  return createPortal(popup, document.body);
}
