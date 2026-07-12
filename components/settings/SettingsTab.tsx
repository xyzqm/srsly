'use client';
import { useState, useEffect, useRef } from 'react';
import { storage } from '@/lib/storage';
import { toCsv, downloadFile, parseBackup } from '@/lib/backup';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useLanguage } from '@/lib/LanguageContext';
import { getLanguageConfig, levelFor, recommendedWordsPerPassage, defaultWordsPerPassage } from '@/lib/languageConfig';
import { todayStr } from '@/lib/deck';
import SignInModal from '@/components/auth/SignInModal';

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

export default function SettingsTab() {
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
  const [wordsPerPassage,    setWordsPerPassage]    = useState(defaultWordsPerPassage(language, langConfig.defaultLevel));
  const [wordsPerPassageRaw, setWordsPerPassageRaw]  = useState(String(wordsPerPassage));
  const [saved,      setSaved]      = useState(false);

  useEffect(() => {
    storage.getPrefs().then(p => {
      setLevel(levelFor(language, p));
      const r = p.srsRetention ?? 0.90;
      setRetention(r);
      const md = p.srsMaxDays ?? 365;
      setMaxDays(md);
      setMaxDaysRaw(String(md));
      const npd = p.srsNewPerDay ?? 20;
      setNewPerDay(npd); setNewPerDayRaw(String(npd));
      const rpd = p.srsReviewsPerDay ?? 200;
      setRevPerDay(rpd); setRevPerDayRaw(String(rpd));
      const wpp = p.wordsPerPassage ?? defaultWordsPerPassage(language, levelFor(language, p));
      setWordsPerPassage(wpp); setWordsPerPassageRaw(String(wpp));
    });
  }, [language]);

  async function savePrefs(patch: Partial<{ hskLevel: number; jlptLevel: number; srsRetention: number; srsMaxDays: number; srsNewPerDay: number; srsReviewsPerDay: number; wordsPerPassage: number }>) {
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

  async function handleMaxDaysBlur() {
    const v = parseInt(maxDaysRaw, 10);
    if (!isNaN(v) && v >= 1) {
      const clamped = Math.min(Math.max(v, 1), 36500);
      setMaxDays(clamped);
      setMaxDaysRaw(String(clamped));
      await savePrefs({ srsMaxDays: clamped });
    } else {
      setMaxDaysRaw(String(maxDays)); // reset to last valid
    }
  }

  async function handleWordsPerPassageBlur() {
    const v = parseInt(wordsPerPassageRaw, 10);
    if (!isNaN(v)) {
      const clamped = Math.min(Math.max(v, 2), 12);
      setWordsPerPassage(clamped);
      setWordsPerPassageRaw(String(clamped));
      await savePrefs({ wordsPerPassage: clamped });
    } else {
      setWordsPerPassageRaw(String(wordsPerPassage)); // reset to last valid
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
      const clamped = Math.min(Math.max(v, 0), 9999);
      if (kind === 'new') { setNewPerDay(clamped); setNewPerDayRaw(String(clamped)); await savePrefs({ srsNewPerDay: clamped }); }
      else { setRevPerDay(clamped); setRevPerDayRaw(String(clamped)); await savePrefs({ srsReviewsPerDay: clamped }); }
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

      {/* ── Proficiency Level ─────────────────────────────────────────────── */}
      <SectionLabel>{language === 'ja' ? 'JLPT level' : 'HSK level'}</SectionLabel>
      <div className="flex flex-col gap-2.5 mb-10" style={{ maxWidth: 540 }}>
        {langConfig.levels.map(({ level: lvl, label, desc }) => {
          const active = level === lvl;
          return (
            <button
              key={lvl}
              onClick={() => handleSelectLevel(lvl)}
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
                  style={{ width: 28, height: 28, background: active ? 'var(--accent)' : 'var(--line-soft)', color: active ? '#fff' : 'var(--ink-faint)', fontFamily: 'var(--f-mono)', fontSize: 11, fontWeight: 600, transition: 'all .15s' }}
                >
                  {language === 'ja' ? `N${lvl}` : lvl}
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

      {/* ── Words per passage ─────────────────────────────────────────────── */}
      <SectionLabel>Words per passage</SectionLabel>
      <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '48ch', lineHeight: 1.55, marginBottom: 14 }}>
        How many due vocab words each AI-generated passage is built around. Fewer words keep
        a passage focused; more give it more to review at once.
      </p>
      <div className="flex items-center gap-3 mb-2" style={{ maxWidth: 320 }}>
        <input
          type="number"
          min={2}
          max={12}
          value={wordsPerPassageRaw}
          onChange={e => setWordsPerPassageRaw(e.target.value)}
          onBlur={handleWordsPerPassageBlur}
          onKeyDown={e => e.key === 'Enter' && handleWordsPerPassageBlur()}
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
        {(() => {
          const [min, max] = recommendedWordsPerPassage(language, level);
          const levelLabel = langConfig.levels.find(l => l.level === level)?.label
            ?? (language === 'ja' ? `JLPT N${level}` : `HSK ${level}`);
          return `For ${levelLabel}, we recommend studying between ${min}-${max} words per passage.`;
        })()}
      </div>
      <div className="flex gap-2 flex-wrap mb-10">
        {(() => {
          const [min, max] = recommendedWordsPerPassage(language, level);
          return (
            <button
              onClick={() => { const mid = Math.round((min + max) / 2); setWordsPerPassage(mid); setWordsPerPassageRaw(String(mid)); savePrefs({ wordsPerPassage: mid }); }}
              className="cursor-pointer transition-all duration-150 rounded-md px-3 py-1.5"
              style={{ fontFamily: 'var(--f-mono)', fontSize: 11, background: 'var(--card)', color: 'var(--ink-soft)', border: '1px solid var(--line)' }}
            >
              Use recommended
            </button>
          );
        })()}
      </div>

      {/* ── Desired Retention ─────────────────────────────────────────────── */}
      <SectionLabel>Desired retention</SectionLabel>
      <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '48ch', lineHeight: 1.55, marginBottom: 14 }}>
        How well you want to remember words at each review. Higher retention means cards come back more often — lower gives longer gaps but accepts more forgetting.
      </p>
      <div className="flex flex-col gap-2 mb-10" style={{ maxWidth: 540 }}>
        {RETENTION_PRESETS.map(preset => {
          const active = Math.abs(retention - preset.value) < 0.001;
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
          max={36500}
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
      <div className="flex gap-2 flex-wrap mb-10">
        {[30, 90, 180, 365].map(d => (
          <button
            key={d}
            onClick={() => { setMaxDays(d); setMaxDaysRaw(String(d)); savePrefs({ srsMaxDays: d }); }}
            className="cursor-pointer transition-all duration-150 rounded-md px-3 py-1.5"
            style={{ fontFamily: 'var(--f-mono)', fontSize: 11, background: maxDays === d ? 'var(--ink)' : 'var(--card)', color: maxDays === d ? 'var(--paper)' : 'var(--ink-soft)', border: `1px solid ${maxDays === d ? 'var(--ink)' : 'var(--line)'}` }}
          >
            {d === 30 ? '1 mo' : d === 90 ? '3 mo' : d === 180 ? '6 mo' : '1 yr'}
          </button>
        ))}
      </div>

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
            type="number" min={0} max={9999}
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
            type="number" min={0} max={9999}
            value={revPerDayRaw}
            onChange={e => setRevPerDayRaw(e.target.value)}
            onBlur={() => handleLimitBlur('review')}
            onKeyDown={e => e.key === 'Enter' && handleLimitBlur('review')}
            className="rounded-[9px] px-4 py-2.5"
            style={{ fontFamily: 'var(--f-mono)', fontSize: 14, width: 100, background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink)', outline: 'none' }}
          />
        </div>
      </div>

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
