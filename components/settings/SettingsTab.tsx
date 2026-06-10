'use client';
import { useState, useEffect } from 'react';
import { storage } from '@/lib/storage';

const HSK_LEVELS = [
  { level: 1, label: 'HSK 1', desc: 'Absolute beginner · ~150 words · greetings, numbers, basic nouns' },
  { level: 2, label: 'HSK 2', desc: 'Beginner · ~300 words · simple daily conversations' },
  { level: 3, label: 'HSK 3', desc: 'Elementary · ~600 words · familiar topics, travel, shopping' },
  { level: 4, label: 'HSK 4', desc: 'Intermediate · ~1,200 words · wide range of topics with fluency' },
  { level: 5, label: 'HSK 5', desc: 'Upper-intermediate · ~2,500 words · newspapers, TV, literature' },
  { level: 6, label: 'HSK 6', desc: 'Advanced · ~5,000 words · near-native comprehension' },
];

export default function SettingsTab() {
  const [hskLevel, setHskLevel] = useState(3);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    storage.getPrefs().then(p => setHskLevel(p.hskLevel ?? 3));
  }, []);

  async function handleSelect(level: number) {
    setHskLevel(level);
    const prefs = await storage.getPrefs();
    await storage.savePrefs({ ...prefs, hskLevel: level });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  return (
    <div
      className="rounded-tr-xl rounded-b-xl px-9 py-8 animate-rise"
      style={{ background: 'var(--card)', border: '1px solid var(--line)', boxShadow: '0 1px 0 rgba(0,0,0,.02)' }}
    >
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
        Settings
      </div>
      <div style={{ fontFamily: 'var(--f-display)', fontSize: 28, fontWeight: 500, letterSpacing: '-.015em', margin: '8px 0 4px', lineHeight: 1.15 }}>
        Your preferences
      </div>
      <p style={{ color: 'var(--ink-soft)', fontSize: 14.5, maxWidth: '48ch', lineHeight: 1.55, marginBottom: 32 }}>
        Choose your HSK level so passages and vocabulary match where you are right now.
      </p>

      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 12 }}>
        HSK level
      </div>

      <div className="flex flex-col gap-2.5" style={{ maxWidth: 540 }}>
        {HSK_LEVELS.map(({ level, label, desc }) => {
          const active = hskLevel === level;
          return (
            <button
              key={level}
              onClick={() => handleSelect(level)}
              className="text-left cursor-pointer transition-all duration-150 rounded-[11px] px-5 py-4"
              style={{
                background: active
                  ? 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, var(--card)), var(--card))'
                  : 'var(--card)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                boxShadow: active ? '0 2px 8px rgba(0,0,0,.06)' : 'none',
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="shrink-0 flex items-center justify-center rounded-full"
                  style={{
                    width: 28, height: 28,
                    background: active ? 'var(--accent)' : 'var(--line-soft)',
                    color: active ? '#fff' : 'var(--ink-faint)',
                    fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 600,
                    transition: 'all .15s',
                  }}
                >
                  {level}
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, fontWeight: 600, letterSpacing: '.04em', color: active ? 'var(--accent)' : 'var(--ink)' }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 2, lineHeight: 1.4 }}>
                    {desc}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Always reserve space so the card never resizes — just toggle visibility */}
      <div className="mt-5" style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--jade)', letterSpacing: '.06em', visibility: saved ? 'visible' : 'hidden', transition: 'opacity .2s', opacity: saved ? 1 : 0 }}>
        Saved.
      </div>
    </div>
  );
}
