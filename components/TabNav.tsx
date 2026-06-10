'use client';
import type { TabId } from '@/lib/types';

const TABS: { id: TabId; label: string }[] = [
  { id: 'read',     label: 'Read' },
  { id: 'practice', label: 'Extras' },
  { id: 'dash',     label: 'Stats' },
  { id: 'vocab',    label: 'Vocab' },
  { id: 'settings', label: 'Settings' },
];

interface Props { active: TabId; onChange: (id: TabId) => void; }

export default function TabNav({ active, onChange }: Props) {
  return (
    <nav className="max-w-[1200px] mx-auto px-7 relative z-[1]">
      <div className="flex gap-1 pt-3.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className="cursor-pointer whitespace-nowrap transition-all duration-[180ms]"
            style={{
              fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase',
              background: active === t.id ? 'var(--card)' : 'none',
              color: active === t.id ? 'var(--accent)' : 'var(--ink-faint)',
              border: active === t.id ? '1px solid var(--line)' : 'none',
              borderBottom: active === t.id ? '1px solid var(--card)' : 'none',
              borderRadius: '7px 7px 0 0',
              padding: '9px 13px',
              marginBottom: active === t.id ? -1 : 0,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
