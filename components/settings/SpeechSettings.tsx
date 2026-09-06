'use client';
import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import type { LanguageCode } from '@/lib/types';
import { getLanguageConfig } from '@/lib/languageConfig';
import { voiceOptions, clearVoiceCache, setSpeechSpeed, setSpeechLang, speak, stopAll, primeTTS } from '@/lib/speech';
import { getVoiceChoice, setVoiceChoice } from '@/lib/ttsVoice';

/**
 * Choosing the voice and the speed.
 *
 * Both were fixed constants: the voice came from a hand-ranked priority list and the speed
 * from a per-language table. The ranking is a good default and a bad only-option — it can
 * only pick from what this machine happens to have installed, and quality across system
 * voices varies more than anything else in the audio path.
 *
 * ── THE TWO SETTINGS ARE STORED IN DIFFERENT PLACES, ON PURPOSE ──
 * SPEED is a preference and syncs: 0.8 means the same thing on every device. VOICE is a fact
 * about the machine and stays local — a `voiceURI` from a Mac with the enhanced Chinese
 * voices downloaded does not exist on a phone, so syncing it would push a choice onto a
 * device that cannot honour it. See lib/ttsVoice.ts.
 *
 * ── WHY SPEED IS A MULTIPLIER ──
 * `RATE` in lib/speech.ts is calibrated per language, Chinese slowest because tone contours
 * are what a beginner strains to hear. One absolute number would flatten that and make one
 * language sluggish in order to make another intelligible.
 */

/**
 * A sentence to hear the difference on, per language.
 *
 * WRITTEN, not sourced, like the starter texts and the proverb seeds. Each is ordinary
 * everyday prose with a mix of tones/vowels rather than a pangram — the question being
 * answered is "would I want to listen to this for ten minutes", which a stunt sentence
 * cannot answer.
 */
const PREVIEW: Record<string, string> = {
  zh: '今天天气很好，我和朋友一起去公园散步。',
  ja: '今日は天気がいいので、友だちと公園を散歩します。',
  es: 'Hace buen tiempo hoy, así que voy al parque con mi amiga.',
  fr: 'Il fait beau aujourd’hui, alors je vais au parc avec mon amie.',
};

const mono = { fontFamily: 'var(--f-mono)' } as const;

interface Props {
  /** Absent = 1. Comes from prefs, so it arrives a tick after mount. */
  speed: number | undefined;
  onChangeSpeed: (speed: number) => void;
  /** Every language the learner has added — one voice each, all settable from here. */
  languages: LanguageCode[];
}

export default function SpeechSettings({ speed, onChangeSpeed, languages }: Props) {
  const studying = useLanguage();
  /**
   * WHICH language's voice is being set, which is not necessarily the one being studied.
   *
   * It used to follow `useLanguage()` alone, so someone studying four languages could only
   * ever set the voice for the one currently selected — and the section said "How Chinese is
   * read aloud" with no hint that the other three had their own. A voice is per language by
   * nature (a French voice cannot read Chinese), so the section needs its own selector rather
   * than borrowing the study language.
   */
  const [lang, setLang] = useState<LanguageCode>(studying);
  useEffect(() => { setLang(studying); }, [studying]);

  const base = lang.slice(0, 2).toLowerCase();
  const langConfig = getLanguageConfig(lang);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [chosen, setChosen] = useState<string>('');

  /**
   * The voice list arrives asynchronously, and on some browsers it is EMPTY on first call.
   * `voiceschanged` is the only reliable signal, and it can fire more than once.
   */
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const load = () => setVoices(voiceOptions(base));
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, [base]);

  useEffect(() => { setChosen(getVoiceChoice(base) ?? ''); }, [base]);

  const pick = useCallback((voiceURI: string) => {
    setChosen(voiceURI);
    setVoiceChoice(base, voiceURI || null);
    // The resolved voice is cached by LOCALE, which has not changed — without this the next
    // utterance would still use the old voice and the setting would look ignored.
    clearVoiceCache();
  }, [base]);

  /**
   * The preview must speak in the language being CONFIGURED, not the one being studied.
   *
   * `speak()` resolves its voice from the module's `currentLocale`, which the app sets from
   * the study language — so previewing French while studying Chinese would have read French
   * text through a Chinese voice, and the picker would have seemed to do nothing. The locale
   * is pushed for the preview and restored below.
   */
  const preview = useCallback(() => {
    primeTTS();
    stopAll();
    setSpeechLang(getLanguageConfig(lang).bcp47);
    void speak(PREVIEW[base] ?? PREVIEW.zh);
  }, [base, lang]);

  /**
   * Put the study language's locale back on the way out.
   *
   * A preview leaves `currentLocale` pointing at whatever was auditioned, and the next
   * flashcard would inherit it. Restoring on unmount covers leaving the tab, which is the
   * only way out of here.
   */
  useEffect(() => () => { setSpeechLang(getLanguageConfig(studying).bcp47); }, [studying]);

  const factor = speed ?? 1;
  const unsupported = typeof window !== 'undefined' && !('speechSynthesis' in window);

  return (
    <>
      {/* Only shown with more than one language added: a single-option switch is furniture. */}
      {languages.length > 1 && (
        <div className="flex gap-1.5 mb-3 flex-wrap">
          {languages.map(l => {
            const on = l === lang;
            return (
              <button
                key={l}
                onClick={() => setLang(l)}
                className="cursor-pointer"
                style={{
                  ...mono, fontSize: 11, letterSpacing: '.06em', padding: '5px 10px', borderRadius: 7,
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
                  background: on ? 'var(--accent-soft)' : 'var(--card)',
                  color: on ? 'var(--accent)' : 'var(--ink-soft)',
                }}
              >
                {getLanguageConfig(l).name}
              </button>
            );
          })}
        </div>
      )}

      <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', maxWidth: '48ch', lineHeight: 1.55, marginBottom: 14 }}>
        How {langConfig.name} is read aloud — in flashcards, passage playback and dictation.
        The voices are the ones installed on this device, so the list is different on a phone
        and a laptop, and the choice is remembered per device.
      </p>

      {unsupported ? (
        <p style={{ ...mono, fontSize: 12.5, color: 'var(--ink-faint)', marginBottom: 18 }}>
          This browser has no speech synthesis.
        </p>
      ) : voices.length === 0 ? (
        <p style={{ ...mono, fontSize: 12.5, color: 'var(--ink-faint)', lineHeight: 1.6, maxWidth: '48ch', marginBottom: 18 }}>
          No {langConfig.name} voices are installed on this device yet. On a Mac they are a
          free download — System Settings → Accessibility → Spoken Content → System Voice →
          Manage Voices — and the ones marked Premium or Enhanced are a large step up on the
          defaults.
        </p>
      ) : (
        <>
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <select
            value={chosen}
            onChange={e => pick(e.target.value)}
            className="rounded-[9px] px-3 py-2.5"
            style={{
              ...mono, fontSize: 13, maxWidth: 320,
              background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink)',
              outline: 'none',
            }}
          >
            {/* Empty value = no choice stored, which is how the ranking is restored. */}
            <option value="">Best available ({voices[0]?.name})</option>
            {voices.map(v => (
              <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
            ))}
          </select>
          <button
            onClick={preview}
            className="cursor-pointer"
            style={{
              ...mono, fontSize: 12, letterSpacing: '.06em', padding: '8px 13px',
              borderRadius: 8, border: '1px solid var(--line)',
              background: 'var(--card)', color: 'var(--ink)',
            }}
          >
            ▶ Preview
          </button>
        </div>
        {/* This is the first thing anyone hits after downloading a voice, so it is said here
            rather than left to be discovered. Browsers enumerate system voices once at
            startup; a voice installed since then is genuinely absent from the list, not
            filtered out of it. */}
        <p style={{ fontSize: 12, color: 'var(--ink-faint)', lineHeight: 1.55, maxWidth: '48ch', marginBottom: 16 }}>
          Just downloaded one and cannot see it? Quit the browser completely and reopen — the
          voice list is read once at startup. Some macOS voices are reserved for the system
          and are never offered to a web page.
        </p>
        </>
      )}

      <div className="flex items-center gap-3 mb-2" style={{ maxWidth: 380 }}>
        <input
          type="range"
          min={0.6}
          max={1.4}
          step={0.05}
          value={factor}
          onChange={e => {
            const next = Number(e.target.value);
            setSpeechSpeed(next);   // heard on the very next preview, not after a reload
            onChangeSpeed(next);
          }}
          style={{ flex: 1, accentColor: 'var(--accent)' }}
          aria-label="Speech speed"
        />
        <span style={{ ...mono, fontSize: 13, color: 'var(--ink-soft)', minWidth: 54, textAlign: 'right' }}>
          {factor.toFixed(2)}×
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-faint)', marginBottom: 10, maxWidth: '48ch', lineHeight: 1.55 }}>
        Applies to every language. It multiplies the pace already tuned for each one —
        Chinese is read slowest, because tone contours are the hardest part to catch — so
        1.00× leaves that calibration exactly as it is.
      </div>
    </>
  );
}
