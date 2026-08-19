'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { storage } from '@/lib/storage';
import { toCsv, downloadFile, parseBackup } from '@/lib/backup';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useLanguage } from '@/lib/LanguageContext';
import { getLanguageConfig, levelFor, levelLabel, wordsForDensity, RECOMMENDED_BLANK_DENSITY } from '@/lib/languageConfig';
import { RECOMMENDED_POOL_ACTIVATE, HIGH_POOL_ACTIVATE, DEFAULT_SRS_SETTINGS } from '@/lib/fsrs';
import { todayStr } from '@/lib/deck';
import { useVocabDeck } from '@/hooks/useVocabDeck';
import type { LanguageCode } from '@/lib/types';
import { SUPPORTED_LANGUAGES } from '@/lib/languageConfig';
import { removeLanguage } from '@/lib/onboarding';
import { loadLevelTable } from '@/lib/curriculum';
import { levelStandings, wordsToUnlockNext, gateFor, levelAfter, RETAINED_FRACTION, type LevelStanding } from '@/lib/unlock';
import SignInModal from '@/components/auth/SignInModal';
import LevelTest from '@/components/level/LevelTest';

const RETENTION_PRESETS = [
  { value: 0.70, label: '70%', desc: 'Relaxed — longer intervals, more forgetting accepted' },
  { value: 0.80, label: '80%', desc: 'Balanced — moderate spacing' },
  { value: 0.90, label: '90%', desc: 'Standard — FSRS default' },
  { value: 0.95, label: '95%', desc: 'Strict — shorter intervals, reviewed more often' },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: 'var(--f-mono)', fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: 12 }}>
      {children}
    </div>
  );
}

interface Props {
  /** Languages the learner has added. */
  languages: LanguageCode[];
  /** Opens the add-a-language flow, which runs the placement test. */
  onAddLanguage: () => void;
  /** Reports a changed list, and the language to switch to when the active one was removed. */
  onLanguagesChanged: (languages: LanguageCode[], active?: LanguageCode) => void;
}

/** Above this a daily cap stops being a cap. Advisory only — nothing enforces it. */
/**
 * One-click reset to whatever this app considers sensible.
 *
 * Every numeric setting states a recommendation and then leaves the field open — nothing is
 * clamped. That combination needs a way back: having typed 36500 into the interval cap to
 * see what happens, the learner should not have to remember it used to say 365.
 */
function UseRecommended({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <div className="flex gap-2 flex-wrap mb-10">
      <button
        onClick={onClick}
        disabled={disabled}
        className="cursor-pointer transition-all duration-150 rounded-md px-3 py-1.5 disabled:opacity-40 disabled:cursor-default"
        style={{ fontFamily: 'var(--f-mono)', fontSize: 11, background: 'var(--card)', color: 'var(--ink-soft)', border: '1px solid var(--line)' }}
      >
        Use recommended
      </button>
    </div>
  );
}

const RECOMMENDED_MAX_PER_DAY = 500;

/** Past this share there is no prose left between the gaps. Advisory only. */
const HIGH_BLANK_DENSITY = 35;

export default function SettingsTab({ languages, onAddLanguage, onLanguagesChanged }: Props) {
  const { enabled: authEnabled, signedIn, user, signOut } = useAuth();
  const language = useLanguage();
  const langConfig = getLanguageConfig(language);
  const [signInOpen, setSignInOpen] = useState(false);
  const [hasDismissed, setHasDismissed] = useState(false); // New state to safely track local dismissal
  const [level,      setLevel]      = useState(langConfig.defaultLevel);
  const [retention,  setRetention]  = useState(0.90);
  const [maxDays,    setMaxDays]    = useState(365);
  const [maxDaysRaw, setMaxDaysRaw] = useState('365');
  const [newPerDay,     setNewPerDay]     = useState(20);
  const [newPerDayRaw,  setNewPerDayRaw]  = useState('20');
  const [revPerDay,     setRevPerDay]     = useState(200);
  const [revPerDayRaw,  setRevPerDayRaw]  = useState('200');
  const [poolActivate,    setPoolActivate]    = useState(RECOMMENDED_POOL_ACTIVATE);
  const [poolActivateRaw, setPoolActivateRaw] = useState(String(RECOMMENDED_POOL_ACTIVATE));
  const [autoActivate, setAutoActivate] = useState(false);
  const [blankDensity,    setBlankDensity]    = useState(RECOMMENDED_BLANK_DENSITY);
  const [blankDensityRaw, setBlankDensityRaw] = useState(String(RECOMMENDED_BLANK_DENSITY));
  const [saved,      setSaved]      = useState(false);
  /**
   * Whether prefs have arrived. Until they have, NOTHING renders as selected.
   *
   * The initial values above are placeholders — `langConfig.defaultLevel`, 0.90, 365 — and
   * showing them as the active choice makes the first frame a lie that then animates away:
   * Japanese defaults to N4, so opening Settings highlighted N4 and slid to N5 a moment
   * later, and the same held for anyone whose retention or maximum interval wasn't the
   * default. An unhighlighted frame is imperceptible; the wrong one is not.
   */
  const [loaded, setLoaded] = useState(false);

  // ── Level unlocking ──────────────────────────────────────────────────────
  const { deck } = useVocabDeck(language);
  const [levelTable, setLevelTable] = useState<Record<number, string[]> | null>(null);
  const [testedLevel, setTestedLevel] = useState(0);
  /**
   * The level being examined by an open challenge, or null.
   *
   * This is the GATE of the level the learner clicked, not that level itself: the row says
   * "426 more A1 words to retain, or take a test to unlock it", and the test has to measure
   * the same thing that sentence promises. Passing it opens the level above — see
   * lib/unlock.ts. Placement lives in onboarding now and never starts from here.
   */
  const [test, setTest] = useState<number | null>(null);
  const [removing, setRemoving] = useState<LanguageCode | null>(null);

  async function confirmRemove(lang: LanguageCode) {
    const next = await removeLanguage(lang);
    setRemoving(null);
    onLanguagesChanged(next.languages ?? [], next.language);
  }

  useEffect(() => {
    let live = true;
    setLevelTable(null);
    // Close any open challenge: "test out of B1" is a Spanish intention, and carrying it
    // into Japanese would silently start an N3 test the learner never asked for.
    setTest(null);
    loadLevelTable(language).then(t => { if (live) setLevelTable(t); });
    return () => { live = false; };
  }, [language]);

  const standings: LevelStanding[] = useMemo(
    // The level already selected counts as unlocked, whatever the deck says. Anyone who set
    // B2 before unlocking existed would otherwise be demoted by this feature shipping, which
    // is not a thing a settings screen should do to you on upgrade.
    () => (levelTable
      ? levelStandings(deck, levelTable, langConfig.levels.map(l => l.level), { testedLevel, selectedLevel: level })
      : []),
    [levelTable, deck, langConfig, testedLevel, level],
  );
  const byLevel = useMemo(() => new Map(standings.map(r => [r.level, r])), [standings]);
  // Until the tables load, don't lock anything — a slow chunk must never look like a wall.
  const isLocked = (lvl: number) => standings.length > 0 && !byLevel.get(lvl)?.unlocked;

  async function recordTestResult(through: number) {
    if (through <= testedLevel) return;
    setTestedLevel(through);
    const prefs = await storage.getPrefs();
    await storage.savePrefs({
      ...prefs,
      testedLevels: { ...prefs.testedLevels, [language]: through },
    });
  }

  useEffect(() => {
    setLoaded(false);
    storage.getPrefs().then(p => {
      setLevel(levelFor(language, p));
      setTestedLevel(p.testedLevels?.[language] ?? 0);
      const r = p.srsRetention ?? 0.90;
      setRetention(r);
      const md = p.srsMaxDays ?? 365;
      setMaxDays(md);
      setMaxDaysRaw(String(md));
      const npd = p.srsNewPerDay ?? 20;
      setNewPerDay(npd); setNewPerDayRaw(String(npd));
      const rpd = p.srsReviewsPerDay ?? 200;
      setRevPerDay(rpd); setRevPerDayRaw(String(rpd));
      const bd = p.blankDensity ?? RECOMMENDED_BLANK_DENSITY;
      setBlankDensity(bd); setBlankDensityRaw(String(bd));
      const pa = p.poolActivateCount ?? RECOMMENDED_POOL_ACTIVATE;
      setPoolActivate(pa); setPoolActivateRaw(String(pa));
      setAutoActivate(p.autoActivatePool === true);
      setLoaded(true);
    });
  }, [language]);

  async function savePrefs(patch: Partial<{ hskLevel: number; jlptLevel: number; cefrLevel: number; srsRetention: number; srsMaxDays: number; srsNewPerDay: number; srsReviewsPerDay: number; blankDensity: number; poolActivateCount: number; autoActivatePool: boolean }>) {
    const prefs = await storage.getPrefs();
    await storage.savePrefs({ ...prefs, ...patch });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  async function handleSelectLevel(newLevel: number) {
    setLevel(newLevel);
    await savePrefs({ [langConfig.levelPrefKey]: newLevel });
  }

  async function handleRetention(value: number) {
    setRetention(value);
    await savePrefs({ srsRetention: value });
  }

  /**
   * These three handlers advise rather than overrule.
   *
   * They used to silently clamp — typing 100000000 into the interval cap left 36500 sitting
   * in the box, which reads as the field being broken rather than as a limit being applied,
   * because nothing said a limit existed. The recommendation and the "not recommended"
   * warning are already on screen; a number past them is the learner's call to make.
   *
   * Only the floor is enforced, because it is not a preference: an interval below one day
   * and a negative daily limit have no meaning for the scheduler.
   */
  async function handleMaxDaysBlur() {
    const v = parseInt(maxDaysRaw, 10);
    if (!isNaN(v) && v >= 1) {
      setMaxDays(v);
      setMaxDaysRaw(String(v));
      await savePrefs({ srsMaxDays: v });
    } else {
      setMaxDaysRaw(String(maxDays)); // reset to last valid
    }
  }

  async function handlePoolActivateBlur() {
    const v = parseInt(poolActivateRaw, 10);
    if (!isNaN(v) && v >= 1) {
      setPoolActivate(v);
      setPoolActivateRaw(String(v));
      await savePrefs({ poolActivateCount: v });
    } else {
      setPoolActivateRaw(String(poolActivate)); // reset to last valid
    }
  }

  async function handleBlankDensityBlur() {
    const v = parseInt(blankDensityRaw, 10);
    // 1–100 is the range the number can mean at all, not a recommendation; the note under
    // the field carries the advice, as with the interval cap and the daily limits.
    if (!isNaN(v) && v >= 1 && v <= 100) {
      setBlankDensity(v);
      setBlankDensityRaw(String(v));
      await savePrefs({ blankDensity: v });
    } else {
      setBlankDensityRaw(String(blankDensity)); // reset to last valid
    }
  }

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleExport(format: 'json' | 'csv') {
    const date = todayStr();
    const deck = await storage.getVocabDeck(language);
    if (format === 'csv') {
      downloadFile(`srsly-deck-${date}.csv`, toCsv(deck), 'text/csv;charset=utf-8');
      return;
    }
    const prefs = await storage.getPrefs();
    const backup = { version: 1, exportedAt: new Date().toISOString(), deck, prefs };
    downloadFile(`srsly-backup-${date}.json`, JSON.stringify(backup, null, 2), 'application/json');
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    try {
      const backup = parseBackup(await file.text());
      const cur = await storage.getVocabDeck(language);
      if (!window.confirm(`Restore ${backup.deck.length} word${backup.deck.length === 1 ? '' : 's'} from this backup? This replaces your current ${langConfig.name} deck of ${cur.length}.`)) return;
      await storage.saveVocabDeck(language, backup.deck);
      if (backup.prefs) await storage.savePrefs(backup.prefs);
      window.location.reload();
    } catch (err) {
      window.alert(`Couldn't restore: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleLimitBlur(kind: 'new' | 'review') {
    const raw = kind === 'new' ? newPerDayRaw : revPerDayRaw;
    const last = kind === 'new' ? newPerDay : revPerDay;
    const v = parseInt(raw, 10);
    if (!isNaN(v) && v >= 0) {
      if (kind === 'new') { setNewPerDay(v); setNewPerDayRaw(String(v)); await savePrefs({ srsNewPerDay: v }); }
      else { setRevPerDay(v); setRevPerDayRaw(String(v)); await savePrefs({ srsReviewsPerDay: v }); }
    } else {
      if (kind === 'new') setNewPerDayRaw(String(last)); else setRevPerDayRaw(String(last));
    }
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
        Adjust your {langConfig.name} proficiency level and spaced-repetition schedule.
      </p>

      {/* ── Account ───────────────────────────────────────────────────────── */}
      {authEnabled && (
        <>
          <SectionLabel>Account</SectionLabel>
          {signedIn ? (
            <div className="flex items-center gap-3 flex-wrap mb-10">
              <span style={{ fontSize: 14, color: 'var(--ink)' }}>
                Signed in as <strong>{user?.email ?? 'your account'}</strong> — synced across devices.
              </span>
              <button
                onClick={signOut}
                className="cursor-pointer transition-all duration-150 rounded-[9px]"
                style={{ fontFamily: 'var(--f-mono)', fontSize: 11.5, letterSpacing: '.04em', background: 'var(--card)', color: 'var(--ink-soft)', border: '1px solid var(--line)', padding: '9px 14px' }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="mb-10">
              <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '48ch', lineHeight: 1.55, marginBottom: 12 }}>
                You&apos;re studying as a guest — your deck lives on this device. Sign in to sync it
                across devices and unlock unlimited AI-generated content.
              </p>
              <button
                onClick={() => {
                  setHasDismissed(false); // Reset dismissal condition if intentionally clicked
                  setSignInOpen(true);
                }}
                className="cursor-pointer transition-all duration-150 rounded-[9px]"
                style={{ fontFamily: 'var(--f-mono)', fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase', fontWeight: 500, background: 'var(--accent)', color: '#fff', border: 'none', padding: '11px 18px', boxShadow: '0 2px 0 var(--accent-deep)' }}
              >
                Sign in
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Languages ─────────────────────────────────────────────────────── */}
      <SectionLabel>Languages</SectionLabel>
      <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '52ch', lineHeight: 1.55, marginBottom: 12 }}>
        Adding a language starts with a placement test, so the reading begins at the right
        level. Removing one hides it here — your deck is kept, and re-adding it finds
        everything where you left it.
      </p>
      <div className="flex flex-col gap-2 mb-4" style={{ maxWidth: 540 }}>
        {SUPPORTED_LANGUAGES.filter(cfg => languages.includes(cfg.code)).map(cfg => (
          <div key={cfg.code} className="flex items-center gap-3 rounded-[10px] px-4 py-3"
            style={{ background: 'var(--card)', border: `1px solid ${cfg.code === language ? 'var(--accent)' : 'var(--line)'}` }}>
            <span style={{ fontFamily: 'var(--f-han)', fontSize: 17, minWidth: 58 }}>{cfg.nativeName}</span>
            <span className="flex-1" style={{ fontFamily: 'var(--f-display)', fontSize: 15 }}>{cfg.name}</span>
            {cfg.code === language && (
              <span style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                studying
              </span>
            )}
            {removing === cfg.code ? (
              <span className="flex items-center gap-1.5">
                <button onClick={() => confirmRemove(cfg.code)} className="cursor-pointer"
                  style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 10px' }}>
                  Remove
                </button>
                <button onClick={() => setRemoving(null)} className="cursor-pointer"
                  style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', background: 'none', color: 'var(--ink-faint)', border: '1px solid var(--line)', borderRadius: 6, padding: '5px 10px' }}>
                  Keep
                </button>
              </span>
            ) : (
              <button onClick={() => setRemoving(cfg.code)} className="cursor-pointer"
                style={{ fontFamily: 'var(--f-mono)', fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', background: 'none', color: 'var(--ink-faint)', border: '1px solid var(--line)', borderRadius: 6, padding: '5px 10px' }}>
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
      {languages.length < SUPPORTED_LANGUAGES.length && (
        <button onClick={onAddLanguage} className="cursor-pointer mb-10"
          style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 18px', boxShadow: '0 2px 0 var(--accent-deep)' }}>
          + Add a language
        </button>
      )}

      {/* ── Proficiency Level ─────────────────────────────────────────────── */}
      <SectionLabel>{langConfig.levelSectionLabel}</SectionLabel>
      <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '52ch', lineHeight: 1.55, marginBottom: 12 }}>
        A level opens once you hold {Math.round(RETAINED_FRACTION * 100)}% of the one below it
        for a week or more — or as soon as you pass its test. Click a locked level to take
        one; testing is a shortcut, never a requirement.
      </p>

      {test !== null && (
        <>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', maxWidth: '48ch', lineHeight: 1.5, marginBottom: -4 }}>
            Testing your {levelLabel(language, test)} vocabulary — passing it unlocks{' '}
            {levelLabel(language, levelAfter(langConfig.levels.map(l => l.level), test) ?? test)}.
          </p>
          <LevelTest
            language={language}
            mode={test}
            onFinish={recordTestResult}
            onClose={() => setTest(null)}
          />
        </>
      )}

      <div className="flex flex-col gap-2.5 mb-4" style={{ maxWidth: 540 }}>
        {langConfig.levels.map(({ level: lvl, label, badge, desc }) => {
          const active = loaded && level === lvl;
          const locked = isLocked(lvl);
          // The gate is the level one step EASIER, which is `lvl - 1` only for the
          // ascending curricula. Japanese counts down, so this named N3 as the gate for N4
          // and left N1 with none at all.
          const row    = byLevel.get(lvl);
          const below  = row ? gateFor(standings, row) : undefined;
          return (
            <button
              key={lvl}
              onClick={() => (locked ? (below && setTest(below.level)) : handleSelectLevel(lvl))}
              className="text-left cursor-pointer transition-all duration-150 rounded-[11px] px-5 py-4"
              style={{
                background: active
                  ? 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, var(--card)), var(--card))'
                  : 'var(--card)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                boxShadow: active ? '0 2px 8px rgba(0,0,0,.06)' : 'none',
                opacity: locked ? 0.72 : 1,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="shrink-0 flex items-center justify-center rounded-full"
                  style={{ width: 28, height: 28, background: active ? 'var(--accent)' : 'var(--line-soft)', color: active ? '#fff' : 'var(--ink-faint)', fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 600, transition: 'all .15s' }}
                >
                  {locked ? '🔒' : badge}
                </div>
                <div className="min-w-0">
                  <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, fontWeight: 600, letterSpacing: '.04em', color: active ? 'var(--accent)' : locked ? 'var(--ink-soft)' : 'var(--ink)' }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 2, lineHeight: 1.4 }}>
                    {locked
                      ? below
                        ? <>Locked — {wordsToUnlockNext(below)} more {levelLabel(language, below.level)} word{wordsToUnlockNext(below) === 1 ? '' : 's'} to retain, or <span style={{ color: 'var(--accent)', fontWeight: 500 }}>take the {levelLabel(language, below.level)} test to unlock it</span>.</>
                        : <>Locked — <span style={{ color: 'var(--accent)', fontWeight: 500 }}>take the test</span> to unlock.</>
                      : desc}
                  </div>
                </div>
                {!locked && byLevel.get(lvl)?.via === 'tested' && (
                  <span className="ml-auto shrink-0" style={{ fontFamily: 'var(--f-mono)', fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--jade)', border: '1px solid color-mix(in srgb, var(--jade) 45%, transparent)', borderRadius: 5, padding: '2px 6px' }}>
                    tested
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Blank density ─────────────────────────────────────────────────── */}
      <SectionLabel>Blank density</SectionLabel>
      <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '48ch', lineHeight: 1.55, marginBottom: 14 }}>
        How much of each passage is blanked out for you to fill in. This is a share rather
        than a word count, so it keeps its meaning as passages get longer — you set it once
        and it still fits when you move up a level.
      </p>
      <div className="flex items-center gap-3 mb-2" style={{ maxWidth: 320 }}>
        <input
          type="number"
          min={1}
          max={100}
          value={blankDensityRaw}
          onChange={e => setBlankDensityRaw(e.target.value)}
          onBlur={handleBlankDensityBlur}
          onKeyDown={e => e.key === 'Enter' && handleBlankDensityBlur()}
          className="rounded-[9px] px-4 py-2.5 transition-all duration-150"
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 14, width: 100,
            background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink)',
            outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--accent)'; }}
          onBlurCapture={e => { e.target.style.borderColor = 'var(--line)'; }}
        />
        <span style={{ fontSize: 13.5, color: 'var(--ink-soft)', fontFamily: 'var(--f-mono)' }}>% of words</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginBottom: 10 }}>
        {`We recommend ${RECOMMENDED_BLANK_DENSITY}% — about one word in ${Math.round(100 / RECOMMENDED_BLANK_DENSITY)}. `}
        {`At ${levelLabel(language, level)} that works out to roughly ${wordsForDensity(language, level, blankDensity)} word${wordsForDensity(language, level, blankDensity) === 1 ? '' : 's'} per passage.`}
      </div>
      {blankDensityRaw !== '' && Number(blankDensityRaw) > HIGH_BLANK_DENSITY && (
        <p style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--gold)', lineHeight: 1.55, maxWidth: '48ch', marginBottom: 10 }}>
          Not recommended above {HIGH_BLANK_DENSITY}%. Past roughly a third, there is not
          enough prose left between the gaps to work any of them out from context — it stops
          being reading and becomes a list of blanks.
        </p>
      )}
      <UseRecommended
        disabled={loaded && blankDensity === RECOMMENDED_BLANK_DENSITY}
        onClick={() => { setBlankDensity(RECOMMENDED_BLANK_DENSITY); setBlankDensityRaw(String(RECOMMENDED_BLANK_DENSITY)); savePrefs({ blankDensity: RECOMMENDED_BLANK_DENSITY }); }}
      />

      {/* ── Desired Retention ─────────────────────────────────────────────── */}
      <SectionLabel>Desired retention</SectionLabel>
      <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '48ch', lineHeight: 1.55, marginBottom: 14 }}>
        How well you want to remember words at each review. Higher retention means cards come back more often — lower gives longer gaps but accepts more forgetting.
      </p>
      <div className="flex flex-col gap-2 mb-10" style={{ maxWidth: 540 }}>
        {RETENTION_PRESETS.map(preset => {
          const active = loaded && Math.abs(retention - preset.value) < 0.001;
          return (
            <button
              key={preset.value}
              onClick={() => handleRetention(preset.value)}
              className="text-left cursor-pointer transition-all duration-150 rounded-[10px] px-4 py-3"
              style={{
                background: active ? 'color-mix(in srgb, var(--accent) 8%, var(--card))' : 'var(--card)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
              }}
            >
              <div className="flex items-center gap-3">
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 13, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--ink)', minWidth: 36 }}>
                  {preset.label}
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.4 }}>
                  {preset.desc}
                  {preset.value === 0.90 && <span style={{ marginLeft: 6, fontFamily: 'var(--f-mono)', fontSize: 10, color: 'var(--jade)', letterSpacing: '.04em' }}>recommended</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Maximum Interval ──────────────────────────────────────────────── */}
      <SectionLabel>Maximum interval</SectionLabel>
      <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '48ch', lineHeight: 1.55, marginBottom: 14 }}>
        Cap how far out a card can be scheduled. Useful when studying for an upcoming exam or if you want cards to recur at least monthly.
      </p>
      <div className="flex items-center gap-3 mb-2" style={{ maxWidth: 320 }}>
        <input
          type="number"
          min={1}
          value={maxDaysRaw}
          onChange={e => setMaxDaysRaw(e.target.value)}
          onBlur={handleMaxDaysBlur}
          onKeyDown={e => e.key === 'Enter' && handleMaxDaysBlur()}
          className="rounded-[9px] px-4 py-2.5 transition-all duration-150"
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 14, width: 100,
            background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink)',
            outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--accent)'; }}
          onBlurCapture={e => { e.target.style.borderColor = 'var(--line)'; }}
        />
        <span style={{ fontSize: 13.5, color: 'var(--ink-soft)', fontFamily: 'var(--f-mono)' }}>days</span>
        <span style={{ fontSize: 12, color: 'var(--ink-faint)', fontFamily: 'var(--f-mono)', marginLeft: 4 }}>
          {maxDays >= 365 ? `(${(maxDays / 365).toFixed(maxDays % 365 === 0 ? 0 : 1)} yr${maxDays >= 730 ? 's' : ''})` : maxDays >= 30 ? `(${Math.round(maxDays / 30)} mo)` : ''}
        </span>
      </div>
      {maxDays > 365 && (
        // Above a year the setting still works — it is the user's call — but it stops being
        // a study aid. FSRS keeps ~90% recall by reviewing you just before you would forget;
        // pushing the ceiling out means the scheduler can't do that any more, and by the time
        // a card comes back a miss costs a full relearn.
        <p style={{ fontSize: 12.5, color: 'var(--gold)', fontFamily: 'var(--f-mono)', lineHeight: 1.5, maxWidth: '46ch', marginTop: 8 }}>
          Not recommended above a year. Gaps this long mean a card you have half-forgotten
          waits {(maxDays / 365).toFixed(maxDays % 365 === 0 ? 0 : 1)} years before you find out — and
          then costs a full relearn.
        </p>
      )}
      <div className="flex gap-2 flex-wrap mb-2 mt-3">
        {[30, 90, 180, 365].map(d => (
          <button
            key={d}
            onClick={() => { setMaxDays(d); setMaxDaysRaw(String(d)); savePrefs({ srsMaxDays: d }); }}
            className="cursor-pointer transition-all duration-150 rounded-md px-3 py-1.5"
            style={{ fontFamily: 'var(--f-mono)', fontSize: 11, background: loaded && maxDays === d ? 'var(--ink)' : 'var(--card)', color: loaded && maxDays === d ? 'var(--paper)' : 'var(--ink-soft)', border: `1px solid ${loaded && maxDays === d ? 'var(--ink)' : 'var(--line)'}` }}
          >
            {d === 30 ? '1 mo' : d === 90 ? '3 mo' : d === 180 ? '6 mo' : '1 yr'}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginBottom: 10 }}>
        {`We recommend ${DEFAULT_SRS_SETTINGS.maxIntervalDays} days — a year. Long enough that a well-known card is barely `}
        {'interrupted, short enough that the scheduler can still catch you before you forget.'}
      </div>
      <UseRecommended
        disabled={loaded && maxDays === DEFAULT_SRS_SETTINGS.maxIntervalDays}
        onClick={() => {
          const d = DEFAULT_SRS_SETTINGS.maxIntervalDays;
          setMaxDays(d); setMaxDaysRaw(String(d)); savePrefs({ srsMaxDays: d });
        }}
      />

      {/* ── Activate from pool ────────────────────────────────────────────── */}
      <SectionLabel>Activate from pool</SectionLabel>
      <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '48ch', lineHeight: 1.55, marginBottom: 14 }}>
        How many pooled words the Vocab tab offers to bring into circulation at once. This
        is the batch size on the Activate button, not a limit — you can always type a
        different number there.
      </p>
      <div className="flex items-center gap-3 mb-2" style={{ maxWidth: 320 }}>
        <input
          type="number"
          min={1}
          value={poolActivateRaw}
          onChange={e => setPoolActivateRaw(e.target.value)}
          onBlur={handlePoolActivateBlur}
          onKeyDown={e => e.key === 'Enter' && handlePoolActivateBlur()}
          className="rounded-[9px] px-4 py-2.5 transition-all duration-150"
          style={{
            fontFamily: 'var(--f-mono)', fontSize: 14, width: 100,
            background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink)',
            outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--accent)'; }}
          onBlurCapture={e => { e.target.style.borderColor = 'var(--line)'; }}
        />
        <span style={{ fontSize: 13.5, color: 'var(--ink-soft)', fontFamily: 'var(--f-mono)' }}>words</span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginBottom: 10 }}>
        {`We recommend ${RECOMMENDED_POOL_ACTIVATE} — a day's worth of new material, and under your `}
        {`${newPerDay} new cards/day, so a batch you activate is one you can actually start today.`}
      </div>
      {poolActivateRaw !== '' && Number(poolActivateRaw) > HIGH_POOL_ACTIVATE && (
        <p style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--gold)', lineHeight: 1.55, maxWidth: '48ch', marginBottom: 10 }}>
          Not recommended above {HIGH_POOL_ACTIVATE}. Activating more than you can start
          just moves the backlog from the pool into your review queue — and in the reading
          passage, which has no daily cap, every one of them counts as due immediately.
        </p>
      )}
      <UseRecommended
        disabled={loaded && poolActivate === RECOMMENDED_POOL_ACTIVATE}
        onClick={() => { setPoolActivate(RECOMMENDED_POOL_ACTIVATE); setPoolActivateRaw(String(RECOMMENDED_POOL_ACTIVATE)); savePrefs({ poolActivateCount: RECOMMENDED_POOL_ACTIVATE }); }}
      />

      {/* Off unless chosen. It changes how much work arrives without being asked, and
          someone with a large pool should not find it draining itself because they
          updated. See lib/poolAutoActivate.ts for the once-a-day rule and the cap. */}
      <label
        className="flex items-start gap-3 mt-5 cursor-pointer"
        style={{ maxWidth: '48ch' }}
      >
        <input
          type="checkbox"
          checked={autoActivate}
          onChange={e => { setAutoActivate(e.target.checked); savePrefs({ autoActivatePool: e.target.checked }); }}
          style={{ marginTop: 3, width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }}
        />
        <span>
          <span style={{ fontSize: 13.5, color: 'var(--ink)' }}>Activate a batch automatically each day</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-faint)', lineHeight: 1.5, marginTop: 3 }}>
            The first time you open the app each day, {poolActivate} word
            {poolActivate === 1 ? '' : 's'} move out of the pool on their own. Never more than
            one batch, however long you have been away — a week off does not become a week&apos;s
            worth of new cards.
          </span>
        </span>
      </label>

      {/* ── Daily limits ──────────────────────────────────────────────────── */}
      <SectionLabel>Daily limits</SectionLabel>
      <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '48ch', lineHeight: 1.55, marginBottom: 14 }}>
        Cap how many cards you study per day to smooth out peaks (and avoid a wall of
        reviews after a break). Counted across sessions; learning cards are never capped.
        Set to 0 to introduce no new cards. Held-back cards return the next day.
      </p>
      <div className="flex flex-wrap gap-8 mb-10">
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.06em', color: 'var(--ink-soft)', marginBottom: 7 }}>New cards / day</div>
          <input
            type="number" min={0}
            value={newPerDayRaw}
            onChange={e => setNewPerDayRaw(e.target.value)}
            onBlur={() => handleLimitBlur('new')}
            onKeyDown={e => e.key === 'Enter' && handleLimitBlur('new')}
            className="rounded-[9px] px-4 py-2.5"
            style={{ fontFamily: 'var(--f-mono)', fontSize: 14, width: 100, background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink)', outline: 'none' }}
          />
        </div>
        <div>
          <div style={{ fontFamily: 'var(--f-mono)', fontSize: 11, letterSpacing: '.06em', color: 'var(--ink-soft)', marginBottom: 7 }}>Max reviews / day</div>
          <input
            type="number" min={0}
            value={revPerDayRaw}
            onChange={e => setRevPerDayRaw(e.target.value)}
            onBlur={() => handleLimitBlur('review')}
            onKeyDown={e => e.key === 'Enter' && handleLimitBlur('review')}
            className="rounded-[9px] px-4 py-2.5"
            style={{ fontFamily: 'var(--f-mono)', fontSize: 14, width: 100, background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink)', outline: 'none' }}
          />
        </div>
      </div>
      {/* Advice, not a ceiling — the handler no longer clamps, so this is the only thing
          telling the learner a number is unreasonable. */}
      {(newPerDayRaw !== '' && Number(newPerDayRaw) > RECOMMENDED_MAX_PER_DAY) ||
       (revPerDayRaw !== '' && Number(revPerDayRaw) > RECOMMENDED_MAX_PER_DAY) ? (
        <p style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--gold)', lineHeight: 1.55, maxWidth: '48ch', marginTop: -28, marginBottom: 10 }}>
          Not recommended above {RECOMMENDED_MAX_PER_DAY} a day. A limit this high is the
          same as no limit — the point of the cap is to stop a backlog arriving all at once.
        </p>
      ) : null}
      <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginTop: -28, marginBottom: 10 }}>
        {`We recommend ${DEFAULT_SRS_SETTINGS.newPerDay} new and ${DEFAULT_SRS_SETTINGS.reviewsPerDay} reviews a day. `}
        {'New cards are the expensive ones — each becomes a review you owe for weeks.'}
      </div>
      <UseRecommended
        disabled={loaded && newPerDay === DEFAULT_SRS_SETTINGS.newPerDay && revPerDay === DEFAULT_SRS_SETTINGS.reviewsPerDay}
        onClick={() => {
          const { newPerDay: n, reviewsPerDay: r } = DEFAULT_SRS_SETTINGS;
          setNewPerDay(n); setNewPerDayRaw(String(n));
          setRevPerDay(r); setRevPerDayRaw(String(r));
          savePrefs({ srsNewPerDay: n, srsReviewsPerDay: r });
        }}
      />

      {/* ── Backup & data ─────────────────────────────────────────────────── */}
      <SectionLabel>Backup &amp; data</SectionLabel>
      <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '48ch', lineHeight: 1.55, marginBottom: 14 }}>
        Your deck lives on this device. Export a backup to keep it safe or move it
        elsewhere — JSON preserves all scheduling; CSV is a plain word list. Restoring a
        JSON backup replaces your current deck.
      </p>
      <div className="flex flex-wrap gap-2 mb-10">
        {([['Export backup (JSON)', () => handleExport('json')],
           ['Export words (CSV)',  () => handleExport('csv')],
           ['Restore from backup', () => fileInputRef.current?.click()]] as const).map(([label, onClick]) => (
          <button
            key={label}
            onClick={onClick}
            className="cursor-pointer transition-all duration-150 rounded-[9px]"
            style={{
              fontFamily: 'var(--f-mono)', fontSize: 11.5, letterSpacing: '.04em',
              background: 'var(--card)', color: 'var(--ink-soft)', border: '1px solid var(--line)',
              padding: '9px 14px',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.color = 'var(--ink-soft)'; }}
          >
            {label}
          </button>
        ))}
        <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} style={{ display: 'none' }} />
      </div>

      {/* Saved indicator */}
      <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12, color: 'var(--jade)', letterSpacing: '.06em', visibility: saved ? 'visible' : 'hidden', opacity: saved ? 1 : 0, transition: 'opacity .2s' }}>
        Saved.
      </div>

      <SignInModal 
        open={signInOpen && !hasDismissed} 
        onClose={() => {
          setSignInOpen(false);
          setHasDismissed(true);
        }} 
      />
    </div>
  );
}
