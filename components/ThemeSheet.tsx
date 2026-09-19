'use client';
import { useRef } from 'react';
import type { Theme, Font, Texture, BlankStyle } from '@/lib/types';
import { useTheme } from '@/hooks/useTheme';
import { useAchievements } from '@/hooks/useAchievements';
import { useLanguage } from '@/lib/LanguageContext';
import { getLanguageConfig } from '@/lib/languageConfig';
import {
  COSMETICS, unlockedCosmetics, canSelect, unlockedCount, canCustomiseAccent,
} from '@/lib/cosmetics';
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

/** The paper under everything, and the gaps you stare at. Free first, earned after. */
const TEXTURES: { id: Texture; name: string }[] = [
  { id: 'grain', name: 'Grain' },
  { id: 'laid', name: 'Laid paper' },
  { id: 'grid', name: 'Grid' },
  { id: 'smooth', name: 'Smooth' },
];

const BLANKS: { id: BlankStyle; name: string }[] = [
  { id: 'dotted', name: 'Dotted' },
  { id: 'solid', name: 'Solid rule' },
  { id: 'box', name: 'Boxed' },
  { id: 'shaded', name: 'Shaded' },
];

/**
 * Starting points for the custom accent, not a palette.
 *
 * A bare colour input opens on black on most platforms, which is the one value guaranteed to
 * look broken against every theme here. These are the six free themes' own accents, so the
 * first thing a learner sees is a row of colours that already work, and the native picker is
 * for going somewhere else from one of them.
 */
const ACCENT_PRESETS = ['#B23A2E', '#0F1115', '#2F6B4C', '#2D5BA9', '#C44A20', '#D77A5B'];

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
  const {
    theme, font, texture, blankStyle, accentColor,
    setTheme, setFont, setTexture, setBlankStyle, setAccentColor,
  } = useTheme();
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
  const showTexture = (id: string) => canSelect(id, unlocked, texture);
  const showBlank = (id: string) => canSelect(id, unlocked, blankStyle);

  /** Whatever is currently applied is never listed as sealed — see `canSelect`. */
  const worn = new Set<string>([theme, font, texture, blankStyle]);

  /**
   * The sealed list waits for `ready`, unlike the grids above.
   *
   * Here the empty value genuinely would be a lie: before the decks load, EVERY earned
   * cosmetic looks unearned, so the section would open claiming 0/13 and telling a learner who
   * has finished fifty sessions that they have finished none. That is the loading state
   * rendered as an answer, so it renders nothing until it has one.
   */
  const lockedList = ready
    ? COSMETICS.filter(c => !unlocked.has(c.id) && !worn.has(c.id))
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

      {/* ── Paper ─────────────────────────────────────────────────────────
          The grain layer under the whole app. Only shown once there is more than the free
          one to choose from — a picker with a single option is furniture. */}
      {TEXTURES.filter(t => showTexture(t.id)).length > 1 && (
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--line-soft)' }}>
          <div style={label}>Paper</div>
          <div className="grid grid-cols-2 gap-2">
            {TEXTURES.filter(t => showTexture(t.id)).map(t => (
              <button
                key={t.id}
                onClick={() => setTexture(t.id)}
                className="cursor-pointer rounded-[10px] p-[10px] text-left transition-all duration-150"
                style={{
                  border: texture === t.id ? '1px solid var(--accent)' : '1px solid var(--line)',
                  boxShadow: texture === t.id ? '0 0 0 2px var(--accent-soft)' : 'none',
                  background: 'none', color: 'var(--ink)', fontFamily: 'inherit',
                }}
              >
                {/* A swatch drawn with the same rules globals.css uses, so what you pick is
                    what you get rather than a label promising it. */}
                <span
                  aria-hidden
                  className="block mb-2 rounded-[5px]"
                  style={{
                    height: 26,
                    border: '1px solid var(--line)',
                    backgroundColor: 'var(--paper)',
                    backgroundImage: t.id === 'laid'
                      ? 'repeating-linear-gradient(to bottom, color-mix(in srgb, var(--line) 70%, transparent) 0 1px, transparent 1px 6px)'
                      : t.id === 'grid'
                        ? 'repeating-linear-gradient(to bottom, color-mix(in srgb, var(--line) 60%, transparent) 0 1px, transparent 1px 9px), repeating-linear-gradient(to right, color-mix(in srgb, var(--line) 60%, transparent) 0 1px, transparent 1px 9px)'
                        : t.id === 'grain'
                          ? 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'80\' height=\'80\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'.8\' numOctaves=\'3\'/%3E%3C/filter%3E%3Crect width=\'80\' height=\'80\' filter=\'url(%23n)\' opacity=\'.5\'/%3E%3C/svg%3E")'
                          : 'none',
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 500 }}>{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Blanks ────────────────────────────────────────────────────────
          The gap you type into, which is the thing on screen a learner looks at most. */}
      {BLANKS.filter(b => showBlank(b.id)).length > 1 && (
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--line-soft)' }}>
          <div style={label}>Blanks</div>
          <div className="grid grid-cols-2 gap-2">
            {BLANKS.filter(b => showBlank(b.id)).map(b => (
              <button
                key={b.id}
                onClick={() => setBlankStyle(b.id)}
                className="cursor-pointer rounded-[10px] p-[10px] text-left transition-all duration-150"
                style={{
                  border: blankStyle === b.id ? '1px solid var(--accent)' : '1px solid var(--line)',
                  boxShadow: blankStyle === b.id ? '0 0 0 2px var(--accent-soft)' : 'none',
                  background: 'none', color: 'var(--ink)', fontFamily: 'inherit',
                }}
              >
                <span
                  aria-hidden
                  className="block mb-2"
                  style={{
                    height: 22, width: '72%', borderRadius: b.id === 'box' ? 4 : b.id === 'shaded' ? 3 : 0,
                    border: b.id === 'box'
                      ? '1.5px solid color-mix(in srgb, var(--accent) 60%, transparent)'
                      : 'none',
                    borderBottom: b.id === 'dotted' ? '1.5px dotted var(--accent)'
                      : b.id === 'solid' ? '1.5px solid var(--accent)'
                        : b.id === 'box' ? '1.5px solid color-mix(in srgb, var(--accent) 60%, transparent)'
                          : '1.5px solid transparent',
                    background: b.id === 'shaded'
                      ? 'color-mix(in srgb, var(--accent) 13%, transparent)' : 'transparent',
                  }}
                />
                <span style={{ fontSize: 12, fontWeight: 500 }}>{b.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Custom colour ─────────────────────────────────────────────────
          The top of the ladder, and the only unlock that is a CONTROL rather than a value.
          One colour: --accent. Ink, paper, card and line stay with the chosen theme, so
          contrast remains the theme's problem and never the learner's — a full palette editor
          is a way to produce white-on-white and then file a bug about it. */}
      {canCustomiseAccent(unlocked) && (
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--line-soft)' }}>
          <div className="flex items-baseline justify-between" style={{ marginBottom: 12 }}>
            <span style={{ ...label, marginBottom: 0 }}>Your colour</span>
            {accentColor && (
              <button
                onClick={() => setAccentColor(null)}
                className="cursor-pointer"
                style={{ ...mono, fontSize: 10, background: 'none', border: 'none', color: 'var(--ink-faint)', textDecoration: 'underline' }}
              >
                reset
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {ACCENT_PRESETS.map(hex => (
              <button
                key={hex}
                onClick={() => setAccentColor(hex)}
                title={hex}
                className="cursor-pointer rounded-[6px]"
                style={{
                  width: 26, height: 26, background: hex,
                  border: accentColor === hex ? '2px solid var(--ink)' : '1px solid rgba(0,0,0,.15)',
                }}
              />
            ))}
            {/* The native picker, labelled — an unlabelled colour input reads as a swatch that
                does nothing until you happen to click it. */}
            <label
              className="cursor-pointer rounded-[6px] flex items-center justify-center"
              style={{
                width: 26, height: 26, border: '1px dashed var(--line)',
                ...mono, fontSize: 13, color: 'var(--ink-faint)',
              }}
              title="Pick any colour"
            >
              +
              <input
                type="color"
                value={accentColor ?? '#B23A2E'}
                onChange={e => setAccentColor(e.target.value)}
                style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
              />
            </label>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--ink-faint)', lineHeight: 1.5, marginTop: 10 }}>
            Sets the accent only — buttons, links, blanks and the marks on a passage. The text
            and paper stay with your theme, so nothing you pick here can make the app hard to
            read.
          </p>
        </div>
      )}

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
              /**
               * One swatch per KIND, because a sealed thing whose look is a surprise is a
               * gamble rather than a goal — the point is to want a specific one. A theme
               * shows its real colours, a typeface is set in itself, a blank is drawn the way
               * it will be drawn, and the palette unlock shows the spectrum it opens.
               */
              const chips = THEMES.find(t => t.id === c.id)?.chips;
              const preview = FONTS.find(f => f.id === c.id)?.preview;
              return (
                <div
                  key={c.id}
                  className="rounded-[10px] px-3.5 py-3"
                  style={{ border: '1px dashed var(--line)', background: 'none', opacity: .82 }}
                >
                  <div className="flex items-center gap-2" style={{ marginBottom: 4 }}>
                    {chips && chips.map((col, i) => (
                      <span key={i} className="w-[14px] h-[14px] rounded-[4px]"
                        style={{ background: col, border: '1px solid rgba(0,0,0,.06)' }} />
                    ))}
                    {preview && (
                      <span style={{ fontFamily: `'${preview}', serif`, fontSize: 15, lineHeight: 1, color: 'var(--ink-soft)' }}>
                        Aa
                      </span>
                    )}
                    {c.kind === 'texture' && (
                      <span
                        aria-hidden
                        className="w-[22px] h-[14px] rounded-[3px]"
                        style={{
                          border: '1px solid var(--line)',
                          backgroundColor: 'var(--paper-2)',
                          backgroundImage: c.id === 'laid'
                            ? 'repeating-linear-gradient(to bottom, color-mix(in srgb, var(--line) 80%, transparent) 0 1px, transparent 1px 4px)'
                            : c.id === 'grid'
                              ? 'repeating-linear-gradient(to bottom, color-mix(in srgb, var(--line) 70%, transparent) 0 1px, transparent 1px 6px), repeating-linear-gradient(to right, color-mix(in srgb, var(--line) 70%, transparent) 0 1px, transparent 1px 6px)'
                              : 'none',
                        }}
                      />
                    )}
                    {c.kind === 'blank' && (
                      <span
                        aria-hidden
                        className="w-[22px] h-[12px]"
                        style={{
                          borderRadius: c.id === 'box' ? 3 : c.id === 'shaded' ? 2 : 0,
                          border: c.id === 'box'
                            ? '1.5px solid color-mix(in srgb, var(--ink-faint) 70%, transparent)' : 'none',
                          borderBottom: c.id === 'solid'
                            ? '1.5px solid var(--ink-faint)'
                            : c.id === 'box'
                              ? '1.5px solid color-mix(in srgb, var(--ink-faint) 70%, transparent)'
                              : '1.5px solid transparent',
                          background: c.id === 'shaded'
                            ? 'color-mix(in srgb, var(--ink-faint) 30%, transparent)' : 'transparent',
                        }}
                      />
                    )}
                    {c.kind === 'palette' && (
                      <span
                        aria-hidden
                        className="w-[22px] h-[14px] rounded-[3px]"
                        style={{
                          border: '1px solid var(--line)',
                          background: 'linear-gradient(90deg,#B23A2E,#A9803C,#5C7355,#2D5BA9,#7A3B2E)',
                        }}
                      />
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
