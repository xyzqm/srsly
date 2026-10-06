'use client';
import type { ReactNode } from 'react';
import type { LanguageCode } from '@/lib/types';
import { SUPPORTED_LANGUAGES } from '@/lib/languageConfig';
import { useSRS } from '@/hooks/useSRS';
import StateFace from '@/components/shared/StateFace';

interface Props {
  onOpenTheme: () => void;
  accountSlot?: ReactNode;
  language: LanguageCode;
  /** Only the languages the learner has added — the picker is no longer a menu of
   *  everything srsly supports. Adding one goes through the placement flow instead. */
  languages: LanguageCode[];
  onLanguageChange: (lang: LanguageCode) => void;
  onAddLanguage: () => void;
}

/** Sentinel option value; a language code can never collide with it. */
const ADD = '__add__';

/**
 * The top bar: who you are, what you are studying, and how it looks.
 *
 * ── THE MARK IS DRAWN NOW, NOT TYPED ──
 *
 * This held a 28px system emoji — 🤔 and eleven others from `useSRS` — in the position a logo
 * occupies, which is why the app read as unfinished before a word of it had been used.
 * `components/shared/Mark.tsx` and `BadgeSeal` had both already refused emoji in writing, for
 * reasons that apply hardest here: it is the largest glyph on the screen, it is the first thing
 * anybody sees, and it was the one surface still rendering somebody else's artwork into a
 * palette assembled from ten themes. `StateFace` draws all twelve states instead.
 *
 * ── AND THE CONTROLS WERE MEASURED AGAINST A PHONE, WHICH THEY HAD NEVER BEEN ──
 *
 * Four controls sat in one `flex-wrap` row: the language picker, Theme, the account email, and
 * Sign out. At 375px that is about 500px of content in 343px of usable width, so it wrapped
 * into a second row with everything jammed to both margins — reported as the header looking
 * "cramped against the margins", which is exactly what it was.
 *
 * The fix is the move this file has already made once, recorded below: REMOVE INK, NOT
 * INFORMATION. Narrow screens drop the word "Theme" and keep its swatch, shorten the email to
 * its local part, and drop Sign out — which is NOT a feature being taken away, because the
 * email chip immediately beside it opens Settings → Account, where `AccountPanel` puts Sign out
 * at the top of the panel precisely so it is the first thing there. One tap, in the place the
 * answer to "what is my account doing" already lives. On a wide screen the room is free, so
 * the shortcut stays.
 */
export default function Header({ onOpenTheme, accountSlot, language, languages, onLanguageChange, onAddLanguage }: Props) {
  const { face, tip } = useSRS();

  return (
    <header
      className="flex items-center justify-between px-4 sm:px-7 py-4 sm:py-5 max-w-[1200px] mx-auto w-full relative z-[2] gap-x-3 gap-y-2 flex-wrap"
      style={{ borderBottom: '1px solid var(--line)' }}
    >
      <div className="flex items-center gap-2.5" style={{ color: 'var(--ink-soft)' }}>
        <StateFace name={face} size={25} title={tip} />
        <h1 style={{ fontFamily: 'var(--f-display)', fontWeight: 500, fontSize: 21, letterSpacing: '-.01em', color: 'var(--ink)' }}>
          srsly?
        </h1>
      </div>

      <div className="flex gap-1.5 sm:gap-2 items-center">
        {/*
          THE WORD "Studying" IS GONE AND THE PICKER IS NOT.
          The select already reads "Español · Spanish", which says what it is and what it is set
          to; the label in front of it was a caption for a control that captions itself, sitting
          in the most valuable strip of the screen. It keeps its accessible name through
          `aria-label`, so nothing is lost to a screen reader — this removes ink, not
          information.
        */}
        {languages.length > 0 && (
          <select
            aria-label="Language you are studying"
            value={language}
            onChange={e => {
              const v = e.target.value;
              if (v === ADD) { onAddLanguage(); return; }
              onLanguageChange(v as LanguageCode);
            }}
            className="header-select"
            style={{
              fontFamily: 'var(--f-ui)', fontSize: 13, color: 'var(--ink)',
              background: 'var(--card)', border: '1px solid var(--line)',
              borderRadius: 7, cursor: 'pointer', fontWeight: 500,
            }}
          >
            {SUPPORTED_LANGUAGES.filter(cfg => languages.includes(cfg.code)).map(cfg => (
              <option key={cfg.code} value={cfg.code}>{cfg.nativeName} · {cfg.name}</option>
            ))}
            {languages.length < SUPPORTED_LANGUAGES.length && (
              <option value={ADD}>+ Add a language…</option>
            )}
          </select>
        )}

        <button
          onClick={onOpenTheme}
          aria-label="Theme and appearance"
          title="Theme and appearance"
          className="flex items-center gap-2 cursor-pointer transition-all duration-150 px-2.5 sm:px-3 py-2"
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase',
            background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--ink-soft)',
            borderRadius: 7,
          }}
        >
          <span
            className="w-[11px] h-[11px] rounded-full"
            style={{ background: 'var(--accent)', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.08)' }}
          />
          {/* The word is the first thing to go on a narrow screen: the swatch is the control,
              and the label is a caption for it. `aria-label` above carries the name either
              way, so the button never becomes an unnamed icon to a screen reader. */}
          <span className="hidden sm:inline">Theme</span>
        </button>

        {accountSlot}
      </div>
    </header>
  );
}
