'use client';
import type { ReactNode } from 'react';
import { useSRS } from '@/hooks/useSRS';

interface Props {
  onOpenTheme: () => void;
  accountSlot?: ReactNode;
}

export default function Header({ onOpenTheme, accountSlot }: Props) {
  const { emoji, tip } = useSRS();

  return (
    <header
      className="flex items-center justify-between px-7 py-6 max-w-[1200px] mx-auto w-full relative z-[2] gap-3 flex-wrap"
      style={{ borderBottom: '1px solid var(--line)' }}
    >
      <div className="flex items-baseline gap-3">
        <span className="text-[28px] leading-none self-center select-none" title={tip}>
          {emoji}
        </span>
        <h1 style={{ fontFamily: 'var(--f-display)', fontWeight: 500, fontSize: 21, letterSpacing: '-.01em' }}>
          srsly?
        </h1>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <label className="flex items-center gap-2 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
          Studying
          <select
            style={{
              fontFamily: 'var(--f-ui)', fontSize: 13, color: 'var(--ink)',
              background: 'var(--card)', border: '1px solid var(--line)',
              borderRadius: 7, padding: '7px 11px', cursor: 'pointer', fontWeight: 500,
            }}
          >
            <option>中文 · Chinese</option>
            <option>日本語 · Japanese</option>
            <option>한국어 · Korean</option>
            <option>Español · Spanish</option>
            <option>+ add a language</option>
          </select>
        </label>

        <button
          onClick={onOpenTheme}
          className="flex items-center gap-2 cursor-pointer transition-all duration-150"
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase',
            background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--ink-soft)',
            borderRadius: 7, padding: '8px 12px',
          }}
        >
          <span
            className="w-[11px] h-[11px] rounded-full"
            style={{ background: 'var(--accent)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08)' }}
          />
          Theme
        </button>

        {accountSlot}
      </div>
    </header>
  );
}
