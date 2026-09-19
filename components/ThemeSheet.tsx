'use client';
import { useRef } from 'react';
import type { Theme, Font } from '@/lib/types';
import { useTheme } from '@/hooks/useTheme';
import { useAchievements } from '@/hooks/useAchievements';
import { useLanguage } from '@/lib/LanguageContext';
import { getLanguageConfig } from '@/lib/languageConfig';
import { COSMETICS, unlockedCosmetics, canSelect, unlockedCount } from '@/lib/cosmetics';
import Mark from '@/components/shared/Mark';

/**
 * Theme and type, including the ones you earn.
 *
 * The six palettes and five typefaces at the top of each list are free and always have been.
 * The rest open with a milestone — see lib/cosmetics.ts, which holds both the catalogue and
 * the argument for why unlocking may only ever ADD.
 */

const THEMES: { id: Theme; name: string; chips: string[] }[] = [
  { id: 'paper', name: 'Paper',  chips: ['#F4EFE6','#B23A2E'] },
  { id: 'ink',   name: 'Ink',    chips: ['#FAFAF8','#0F1115'] },
  { id: 'tea',   name: 'Tea',    chips: ['#EEF2EA','#2F6B4C'] },
  { id: 'slate', name: 'Slate',  chips: ['#ECEEF2','#2D5BA9'] },
  { id: 'bone',  name: 'Bone',   chips: ['#F2E7DA','#C44A20'] },
  { id: 'dusk',  name: 'Dusk',   chips: ['#1B1A22','#D77A5B'] },
  // Earned. The chips are the real tokens from globals.css, so a sealed theme still shows
  // what it looks like — a mystery box would make the milestone a gamble rather than a goal.
  { id: 'vellum',   name: 'Vellum',   chips: ['#EDE4D3','#7A3B2E'] },
  { id: 'sakura',   name: 'Sakura',   chips: ['#F7EDF0','#B24A6E'] },
  { id: 'midnight', name: 'Midnight', chips: ['#131824','#6E9BE0'] },
  { id: 'terminal', name: 'Terminal', chips: ['#0B0F0C','#4ADE80'] },
];

const FONTS: { id: Font; name: string; preview: string; hanFamily: string }[] = [
  { id: 'editorial-warm', name: 'Editorial warm', preview: 'Fraunces',    hanFamily: "'Noto Serif SC', serif" },
  { id: 'quiet-serif',    name: 'Quiet serif',    preview: 'Newsreader',  hanFamily: "'Noto Serif SC', serif" },
  { id: 'technical',      name: 'Technical',      preview: 'IBM Plex Serif', hanFamily: "'Noto Sans SC', sans-serif" },
  { id: 'classic',        name: 'Classic',        preview: 'Lora',        hanFamily: "'Noto Serif SC', serif" },
  { id: 'sans-modern',    name: 'Sans modern',    preview: 'Inter',       hanFamily: "'Noto Sans SC', sans-serif" },
  { id: 'grand',       name: 'Grand',      preview: 'Playfair Display', hanFamily: "'Noto Serif SC', serif" },
  { id: 'typewriter',  name: 'Typewriter', preview: 'Courier Prime',    hanFamily: "'Noto Serif SC', serif" },
];

const mono = { fontFamily: 'var(--f-mono)' } as const;
const label: React.CSSProperties = {
  ...mono, fontSize: 10.5, letterSpacing: '.18em', textTransform: 'uppercase',
  color: 'var(--ink-faint)', marginBottom: 12,
};

interface Props { open: boolean; onClose: () => void; }

export default function ThemeSheet({ open, onClose }: Props) {
  /**
   * Whether the drawer has EVER been opened, latched during render.
   *
   * The body is what reads the milestones, and `useAchievements` is not cheap — it loads all
   * four decks, the SRS state and the IndexedDB shelf. `ToastHost` already runs one copy of
   * it at the app root on every load; a second one mounted here would double that work on the
   * landing path for a drawer most sessions never open.
   *
   * A ref latched in render rather than state set in an effect, for the reason
   * lib/completionSurface.ts gives: React runs every render in a commit before any effect in
   * it, so the body is mounted in the SAME commit that sets `open` — it is on screen before
   * the 350ms slide finishes, instead of appearing a frame late. Setting the latch twice is a
   * no-op, so StrictMode's double render costs nothing and there is no state update in render
   * to warn about.
   */
  const opened = useRef(false);
  if (open) opened.current = true;

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
            style={{ ...mono, fontSize: 18, background: 'none', border: 'none', color: 'var(--ink-faint)' }}
          >
            ×
          </button>
        </div>

        {opened.current && <SheetBody />}
      </aside>
    </>
  );
}

function SheetBody() {
  const langConfig = getLanguageConfig(useLanguage());
  const sampleGlyph = langConfig.glyph;
  const { theme, font, setTheme, setFont } = useTheme();
  const { earned, next, ready } = useAchievements();

  const unlocked = unlockedCosmetics(earned.map(a => a.id));
  /**
   * Progress toward each locked cosmetic, read off the milestone rather than recomputed.
   *
   * `evaluate` already returns `have`/`need` for everything, so "31 / 50 words" comes from the
   * same numbers the Stats panel draws. Deriving it a second time here is how the drawer and
   * the badge cabinet would come to disagree about how far along someone is.
   */
  const progress = new Map(next.map(a => [a.id, { have: a.have, need: a.need }]));

  /**
   * THE REVEAL IS ADDITIVE, WHICH IS WHY `ready` IS NOT IN THESE TWO.
   *
   * `unlocked` is empty until the milestones arrive, so an earned cosmetic is simply absent
   * from the grid and then appears — rather than being offered, tapped, and yanked away when
   * the answer lands. Going the other way round would both flash and hand the learner a tile
   * that silently does nothing for the moment it is on screen.
   *
   * The applied theme or font is always shown, however the milestones come back. That is the
   * "never revoke what someone is wearing" half of lib/cosmetics.ts, and it is also what stops
   * the drawer looking broken to someone whose deck has not loaded yet.
   */
  const showTheme = (id: string) => canSelect(id, unlocked, theme);
  const showFont = (id: string) => canSelect(id, unlocked, font);

  /**
   * The sealed list waits for `ready`, unlike the grids above.
   *
   * Here the empty value genuinely would be a lie: before the decks load, EVERY earned
   * cosmetic looks unearned, so the section would open claiming 0/6 and telling a learner who
   * has finished fifty sessions that they have finished none. That is the loading state
   * rendered as an answer, so it renders nothing until it has one.
   */
  const lockedList = ready
    ? COSMETICS.filter(c => !unlocked.has(c.id) && c.id !== theme && c.id !== font)
    : [];

  return (
    <>
      {/* Color schemes */}
      <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--line-soft)' }}>
        <div style={label}>Color scheme</div>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.filter(t => showTheme(t.id)).map(t => (
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
        <div style={label}>Typography</div>
        <div className="flex flex-col gap-2">
          {FONTS.filter(f => showFont(f.id)).map(f => (
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
              <span style={{ ...mono, fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-faint)' }}>
                {f.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Sealed ──────────────────────────────────────────────────────────
          Shown rather than hidden, and shown with their real colours. A locked thing nobody
          can see is not a goal, and a locked thing whose look is a surprise is a gamble —
          the point is to want a specific one. Nothing here was ever free: see
          lib/cosmetics.ts. */}
      {lockedList.length > 0 && (
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--line-soft)' }}>
          <div className="flex items-baseline justify-between" style={{ marginBottom: 12 }}>
            <span style={{ ...label, marginBottom: 0 }}>Earned</span>
            <span style={{ ...mono, fontSize: 10, color: 'var(--ink-faint)' }}>
              {unlockedCount(unlocked)}/{COSMETICS.length}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {lockedList.map(c => {
              const p = progress.get(c.requires);
              const chips = THEMES.find(t => t.id === c.id)?.chips;
              const preview = FONTS.find(f => f.id === c.id)?.preview;
              return (
                <div
                  key={c.id}
                  className="rounded-[10px] px-3.5 py-3"
                  style={{ border: '1px dashed var(--line)', background: 'none', opacity: .82 }}
                >
                  <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                    {chips
                      ? chips.map((col, i) => (
                        <span key={i} className="w-[14px] h-[14px] rounded-[4px]"
                          style={{ background: col, border: '1px solid rgba(0,0,0,.06)' }} />
                      ))
                      : (
                        <span style={{ fontFamily: `'${preview}', serif`, fontSize: 15, lineHeight: 1, color: 'var(--ink-soft)' }}>
                          Aa
                        </span>
                      )}
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-soft)' }}>{c.name}</span>
                    <span className="ml-auto flex items-center" style={{ color: 'var(--ink-faint)' }}>
                      <Mark name="lock" size={12} />
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-faint)', lineHeight: 1.45 }}>
                    {c.unlockedBy}
                    {p && p.have > 0 && (
                      <span style={{ ...mono, marginLeft: 6, color: 'var(--ink-soft)' }}>
                        {Math.min(p.have, p.need)}/{p.need}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="px-5 py-4" style={{ color: 'var(--ink-faint)', fontSize: 12, lineHeight: 1.6 }}>
        Tweaks save to this device. Try them with a passage open to see the effect on{' '}
        {langConfig.name} type{langConfig.hasReadings ? ' and its reading marks' : ''}.
      </div>
    </>
  );
}
