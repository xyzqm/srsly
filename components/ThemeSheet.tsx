'use client';
import type { Theme, Font } from '@/lib/types';
import { useTheme } from '@/hooks/useTheme';
import { useLanguage } from '@/lib/LanguageContext';
import { getLanguageConfig } from '@/lib/languageConfig';

const THEMES: { id: Theme; name: string; chips: string[] }[] = [
  { id: 'paper', name: 'Paper',  chips: ['#F4EFE6','#B23A2E'] },
  { id: 'ink',   name: 'Ink',    chips: ['#FAFAF8','#0F1115'] },
  { id: 'tea',   name: 'Tea',    chips: ['#EEF2EA','#2F6B4C'] },
  { id: 'slate', name: 'Slate',  chips: ['#ECEEF2','#2D5BA9'] },
  { id: 'bone',  name: 'Bone',   chips: ['#F2E7DA','#C44A20'] },
  { id: 'dusk',  name: 'Dusk',   chips: ['#1B1A22','#D77A5B'] },
];

const FONTS: { id: Font; name: string; preview: string; hanFamily: string }[] = [
  { id: 'editorial-warm', name: 'Editorial warm', preview: 'Fraunces',    hanFamily: "'Noto Serif SC', serif" },
  { id: 'quiet-serif',    name: 'Quiet serif',    preview: 'Newsreader',  hanFamily: "'Noto Serif SC', serif" },
  { id: 'technical',      name: 'Technical',      preview: 'IBM Plex Serif', hanFamily: "'Noto Sans SC', sans-serif" },
  { id: 'classic',        name: 'Classic',        preview: 'Lora',        hanFamily: "'Noto Serif SC', serif" },
  { id: 'sans-modern',    name: 'Sans modern',    preview: 'Inter',       hanFamily: "'Noto Sans SC', sans-serif" },
];

interface Props { open: boolean; onClose: () => void; }

export default function ThemeSheet({ open, onClose }: Props) {
  const langConfig = getLanguageConfig(useLanguage());
  const sampleGlyph = langConfig.glyph;
  const { theme, font, setTheme, setFont } = useTheme();

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 transition-opacity duration-300"
        style={{
          background: 'rgba(0,0,0,.25)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      />

      {/* Sheet */}
      <aside
        aria-hidden={!open}
        className="fixed top-0 right-0 h-full w-[min(340px,100vw-2rem)] z-50 overflow-y-auto transition-transform duration-[350ms]"
        style={{
          background: 'var(--card)',
          borderLeft: '1px solid var(--line)',
          boxShadow: '-10px 0 40px rgba(0,0,0,.08)',
          transform: open ? 'translateX(0)' : 'translateX(110%)',
          transitionTimingFunction: 'cubic-bezier(.2,.7,.3,1)',
        }}
      >
        <div
          className="flex justify-between items-center px-5 pt-5 pb-3"
          style={{ borderBottom: '1px solid var(--line-soft)' }}
        >
          <h3 style={{ fontFamily: 'var(--f-display)', fontSize: 18, fontWeight: 500 }}>Theme &amp; type</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md flex items-center justify-center transition-colors cursor-pointer"
            style={{ fontFamily: 'var(--f-mono)', fontSize: 18, background: 'none', border: 'none', color: 'var(--ink-faint)' }}
          >
            ×
          </button>
        </div>

        {/* Color schemes */}
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--line-soft)' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 12 }}>
            Color scheme
          </div>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map(t => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className="cursor-pointer rounded-[10px] p-[10px] text-left transition-all duration-150"
                style={{
                  border: theme === t.id ? '1px solid var(--accent)' : '1px solid var(--line)',
                  boxShadow: theme === t.id ? '0 0 0 2px var(--accent-soft)' : 'none',
                  background: 'none', color: 'var(--ink)', fontFamily: 'inherit',
                }}
              >
                <div className="flex gap-1 mb-2">
                  {t.chips.map((c, i) => (
                    <span key={i} className="w-[18px] h-[18px] rounded-[5px]" style={{ background: c, border: '1px solid rgba(0,0,0,.06)' }} />
                  ))}
                </div>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{t.name}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Typography */}
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--line-soft)' }}>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 12 }}>
            Typography
          </div>
          <div className="flex flex-col gap-2">
            {FONTS.map(f => (
              <button
                key={f.id}
                onClick={() => setFont(f.id)}
                className="cursor-pointer rounded-[10px] px-4 py-3 text-left flex justify-between items-baseline gap-3 transition-all duration-150"
                style={{
                  border: font === f.id ? '1px solid var(--accent)' : '1px solid var(--line)',
                  background: font === f.id ? 'var(--accent-soft)' : 'none',
                  color: 'var(--ink)', fontFamily: 'inherit',
                }}
              >
                <span style={{ fontFamily: `'${f.preview}', serif`, fontSize: 18, lineHeight: 1 }}>
                  {/* The sample is the STUDY language's own glyph, not a fixed 渐. A Spanish
                      or French learner was being shown a Chinese character to judge a font by
                      — and judging it on a script their passages will never contain. */}
                  Aa <span style={{ fontFamily: f.hanFamily }}>{sampleGlyph}</span>
                </span>
                <span style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                  {f.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 py-4" style={{ color: 'var(--ink-faint)', fontSize: 12, lineHeight: 1.6 }}>
          Tweaks save to this device. Try them with a passage open to see the effect on{' '}
          {langConfig.name} type{langConfig.hasReadings ? ' and its reading marks' : ''}.
        </div>
      </aside>
    </>
  );
}
