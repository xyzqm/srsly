'use client';
import { useEffect, useRef } from 'react';

export interface PopupData {
  word: string;
  pinyin: string;
  meaning: string;
  type: 'vocab' | 'free';
  anchorRect: DOMRect;
}

interface Props {
  data: PopupData | null;
  onClose: () => void;
  onAddVocab: (word: string) => void;
  onLearnTomorrow: (word: string) => void;
}

export default function WordPopup({ data, onClose, onAddVocab, onLearnTomorrow }: Props) {
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data || !popRef.current) return;
    const pop = popRef.current;
    const pw = 254;
    const r = data.anchorRect;
    let left = r.left + r.width / 2 - pw / 2;
    left = Math.max(10, Math.min(left, window.innerWidth - pw - 10));
    pop.style.left = left + 'px';
    pop.style.top = (r.top - 16) + 'px';

    requestAnimationFrame(() => {
      const ph = pop.offsetHeight;
      pop.style.top = (r.top - ph - 14) + 'px';
      const ax = Math.max(14, Math.min(r.left + r.width / 2 - left, pw - 14));
      pop.style.setProperty('--arrow-x', ax + 'px');
    });
  }, [data]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [onClose]);

  const show = !!data;

  return (
    <div
      ref={popRef}
      onClick={e => e.stopPropagation()}
      className="fixed z-[200] w-[254px] p-[14px_16px] rounded-xl transition-all duration-200"
      style={{
        background: 'var(--pop-bg)',
        color: 'var(--pop-fg)',
        fontFamily: 'var(--f-ui)',
        boxShadow: '0 14px 34px rgba(34,32,28,.3)',
        opacity: show ? 1 : 0,
        pointerEvents: show ? 'auto' : 'none',
        transform: show ? 'translateY(0) scale(1)' : 'translateY(6px) scale(.96)',
        transitionTimingFunction: 'cubic-bezier(.2,.7,.3,1)',
      }}
    >
      {/* Arrow */}
      <div
        className="absolute top-full w-0 h-0"
        style={{
          left: 'var(--arrow-x, 50%)',
          transform: 'translateX(-50%)',
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '6px solid var(--pop-bg)',
        }}
      />

      {data && (
        <>
          <div className="flex items-baseline gap-2">
            <span style={{ fontFamily: 'var(--f-han)', fontSize: 21, fontWeight: 'var(--han-weight)' as 'bold' }}>
              {data.word}
            </span>
            <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--pop-pin)', marginLeft: 8 }}>
              {data.pinyin}
            </span>
          </div>
          <div style={{ fontSize: 14, marginTop: 6, lineHeight: 1.45 }}>{data.meaning}</div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 9, letterSpacing: '.08em', color: 'var(--pop-mute)', marginTop: 9, textTransform: 'uppercase' }}>
            via CC-CEDICT
          </div>

          {data.type === 'vocab' && (
            <div
              className="flex gap-2 mt-2 pt-2 text-[11.5px]"
              style={{ borderTop: '1px solid rgba(255,255,255,.12)', color: 'var(--pop-warn)', lineHeight: 1.35 }}
            >
              ↺ <span>Revealed — counts as <strong style={{ color: 'var(--pop-warn-strong)' }}>forgotten</strong>, returns tomorrow</span>
            </div>
          )}

          {data.type === 'free' && (
            <div
              className="flex flex-col gap-2 mt-3 pt-2"
              style={{ borderTop: '1px solid rgba(255,255,255,.1)' }}
            >
              <button
                onClick={() => { onAddVocab(data.word); onClose(); }}
                className="w-full text-left rounded-lg py-2 px-3 cursor-pointer transition-all duration-150 text-white font-semibold"
                style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.05em', background: 'var(--jade)', border: 'none', lineHeight: 1.3 }}
              >
                Add to vocab
                <span className="block text-[9px] font-normal opacity-65 mt-1" style={{ textTransform: 'none', letterSpacing: 0 }}>
                  Joins your SRS deck — reviewed regularly in future sessions
                </span>
              </button>
              <button
                onClick={() => { onLearnTomorrow(data.word); onClose(); }}
                className="w-full text-left rounded-lg py-2 px-3 cursor-pointer transition-all duration-150"
                style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.05em', background: 'rgba(255,255,255,.1)', border: 'none', color: 'var(--pop-fg)', lineHeight: 1.3 }}
              >
                Learn this word
                <span className="block text-[9px] font-normal opacity-65 mt-1" style={{ textTransform: 'none', letterSpacing: 0 }}>
                  Due tomorrow only — won&apos;t recur unless added to vocab
                </span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
