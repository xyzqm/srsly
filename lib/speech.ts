'use client';

// ─── Voice selection ──────────────────────────────────────────────────────────

/**
 * Preferred voice names per language, ranked best-first; each is a substring match.
 *
 * This used to be a single Chinese list, and everything that wasn't Japanese fell through
 * to it. Since the list is only consulted *within* the matching-language voices now, an
 * unlisted language simply gets the generic ranking below — never another language's voice.
 */
const VOICE_PRIORITY: Record<string, string[]> = {
  zh: [
    // Microsoft neural (Edge / Windows) — best quality browser voice
    'Microsoft Xiaoxiao Online (Natural)',
    'Microsoft Yunxi Online (Natural)',
    'Microsoft Yaoyao Online (Natural)',
    'Microsoft Kangkang Online (Natural)',
    'Microsoft Huihui Online (Natural)',
    // Google (Chrome on any OS) — cloud-backed, very natural
    'Google 普通话（中国大陆）',
    'Google 普通话',
    'Google Chinese',
    // macOS (System Settings → Accessibility → Spoken Content → Manage Voices)
    'Tingting',     // macOS zh-CN
    'Meijia',       // macOS zh-TW (still clear Mandarin)
  ],
  ja: [
    'Microsoft Nanami Online (Natural)',
    'Google 日本語',
    'Kyoko',        // Apple's standard ja-JP voice
    'O-Ren',
    'Hattori',
  ],
  es: [
    'Microsoft Elvira Online (Natural)',
    'Microsoft Alvaro Online (Natural)',
    'Google español',
    'Mónica',       // Apple's standard es-ES voice
    'Monica',
    'Paulina',      // es-MX
  ],
  fr: [
    'Microsoft Denise Online (Natural)',
    'Microsoft Henri Online (Natural)',
    'Google français',
    'Thomas',       // Apple's standard fr-FR voice
    'Audrey',
    'Marie',
    'Amélie',       // fr-CA
  ],
};

/**
 * macOS ships a large set of joke voices — Eddy, Grandma, Bubbles, Zarvox — in EVERY
 * language, and they sort ahead of the real ones alphabetically. Picking "the first
 * Spanish voice" lands on "Eddy (Spanish (Spain))", which is a cartoon. They are only
 * excluded when a real voice exists, never outright: a locale that has nothing else
 * should still speak.
 */
const NOVELTY_VOICE = /\b(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Eddy|Flo|Fred|Good News|Grandma|Grandpa|Hysterical|Jester|Junior|Kathy|Organ|Princess|Ralph|Reed|Rocko|Sandy|Shelley|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/i;

/**
 * Speaking rate per language. Chinese is slowed most because tone contours are what a
 * learner is straining to hear; the Latin-script languages only need a light slowdown, and
 * the old blanket 0.82 made Spanish and French sound sluggish.
 */
const RATE: Record<string, number> = { zh: 0.82, ja: 0.9, es: 0.95, fr: 0.95 };

/** Resolved voice, tagged with the locale it was resolved FOR. The tag matters: voice
 *  resolution is async (it may wait on `voiceschanged`), so without it a resolve still in
 *  flight when the study language changes would cache a voice for the language just left. */
let cachedVoice: { locale: string; voice: SpeechSynthesisVoice } | null = null;

/** Active TTS locale (BCP-47). Set by the app when the study language changes; drives both
 *  browser-voice selection and the `lang` sent to the TTS API route. */
let currentLocale = 'zh-CN';

/** Set the speech locale (e.g. 'zh-CN' or 'es-ES'). */
export function setSpeechLang(bcp47: string): void {
  if (bcp47 === currentLocale) return;
  currentLocale = bcp47;
  cachedVoice = null;
}

/**
 * Best available voice for `currentLocale`, or null if the platform has none.
 *
 * Returning null is a real answer and the important one: it means "let the platform pick
 * from `utterance.lang`". This function must NEVER return a voice in a different language.
 * It used to — everything that wasn't Japanese fell through to the Chinese branch, so
 * Spanish and French flashcards were read aloud by Tingting, a Mandarin voice, which is
 * exactly as strange as it sounds. An assigned `voice` overrides `lang`, so the locale
 * being set correctly did nothing to save it.
 */
function rankVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const base = currentLocale.slice(0, 2).toLowerCase();
  // Match on lang only. Matching the NAME too is what let "Sinji" (a zh-HK voice) answer a
  // search for Japanese, and would let any voice called e.g. "Frank" answer one for French.
  const sameLang = voices.filter(v => v.lang.replace('_', '-').toLowerCase().startsWith(base));
  if (sameLang.length === 0) return null;

  for (const name of VOICE_PRIORITY[base] ?? []) {
    const match = sameLang.find(v => v.name.includes(name));
    if (match) return match;
  }

  // Nothing named: prefer the exact locale over a regional sibling (es-ES over es-MX), and
  // a real voice over a novelty one, but take a novelty voice rather than nothing.
  const exact = sameLang.filter(v => v.lang.replace('_', '-').toLowerCase() === currentLocale.toLowerCase());
  const real  = (list: SpeechSynthesisVoice[]) => list.filter(v => !NOVELTY_VOICE.test(v.name));
  return real(exact)[0] ?? real(sameLang)[0] ?? exact[0] ?? sameLang[0];
}

function resolveVoice(): Promise<SpeechSynthesisVoice | null> {
  // Only reuse the cache if we found a voice FOR THIS LOCALE — never short-circuit on null.
  if (cachedVoice?.locale === currentLocale) return Promise.resolve(cachedVoice.voice);
  const forLocale = currentLocale;
  const remember = (v: SpeechSynthesisVoice | null) => {
    if (v && forLocale === currentLocale) cachedVoice = { locale: forLocale, voice: v };
    return v;
  };

  return new Promise(resolve => {
    const immediate = speechSynthesis.getVoices();
    if (immediate.length > 0) {
      resolve(remember(rankVoices(immediate)));
      return;
    }

    // Voices load asynchronously on first call — wait for the event
    const onChanged = () => {
      speechSynthesis.removeEventListener('voiceschanged', onChanged);
      clearTimeout(timeout);
      resolve(remember(rankVoices(speechSynthesis.getVoices())));
    };
    speechSynthesis.addEventListener('voiceschanged', onChanged);

    // Safety timeout — resolve null but do NOT cache it, so the next call retries
    const timeout = setTimeout(() => {
      speechSynthesis.removeEventListener('voiceschanged', onChanged);
      resolve(null);
    }, 3000);
  });
}

// ─── API-backed TTS (OpenAI, requires OPENAI_API_KEY on the server) ───────────

/** Blob URL cache, keyed by locale AND text. Keying on text alone made homographs across
 *  languages collide — French `pain` and Spanish `pan` are distinct words that a shared key
 *  would have served the same audio for. */
const apiCache = new Map<string, string>();

/**
 * Returns a Blob URL for the given text using the /api/tts route, or null if
 * no API key is configured or the request fails.
 */
/** Latched once the server reports it has no TTS key — see the 501 branch below. */
let apiTtsUnavailable = false;

async function fetchApiAudio(text: string): Promise<string | null> {
  if (apiTtsUnavailable) return null;
  const key = currentLocale + '\u001f' + text;
  if (apiCache.has(key)) return apiCache.get(key)!;

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The locale matters most for the single words flashcards speak: "no", "pan" and
      // "casa" are all real words in more than one language, so text alone is ambiguous.
      body: JSON.stringify({ text, lang: currentLocale }),
    });

    // 501 is the server saying it has no OPENAI_API_KEY — an answer that cannot change while
    // this page is open. It used to fall back and then ask again on the very next word, so a
    // flashcard session fired one doomed round-trip per utterance and filled the console with
    // failures. Latch it and go straight to browser speech thereafter. Other failures are not
    // latched: a 500 or a dropped connection may well be transient.
    if (res.status === 501) { apiTtsUnavailable = true; return null; }
    if (!res.ok) return null;

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    apiCache.set(key, url);
    return url;
  } catch {
    return null;
  }
}

// ─── Generation guard (prevents stale callbacks after stop) ──────────────────

let currentGen = 0;

// ─── Public API ───────────────────────────────────────────────────────────────

export function stopAll(): void {
  currentGen++;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    speechSynthesis.cancel();
  }
}

/** Speak a single text string. Falls back to browser TTS if API is unavailable. */
export async function speak(text: string, onEnd?: () => void): Promise<void> {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  stopAll();
  const gen = currentGen;

  // Try API-backed audio first
  const url = await fetchApiAudio(text);
  if (gen !== currentGen) return; // stopped while fetching

  if (url) {
    const audio = new Audio(url);
    audio.playbackRate = 1.0;
    audio.onended = () => { if (gen === currentGen && onEnd) onEnd(); };
    audio.onerror = () => {
      if (gen === currentGen) speakBrowser(text, gen, onEnd);
    };
    audio.play().catch(() => {
      if (gen === currentGen) speakBrowser(text, gen, onEnd);
    });
    return;
  }

  speakBrowser(text, gen, onEnd);
}

/** Speaking rate for the active locale. */
function currentRate(): number {
  return RATE[currentLocale.slice(0, 2).toLowerCase()] ?? 0.95;
}

/** Browser-only fallback, using the best voice for the ACTIVE language (never another's). */
async function speakBrowser(
  text: string,
  gen: number,
  onEnd?: () => void,
): Promise<void> {
  const voice = await resolveVoice();
  if (gen !== currentGen) return;

  const u = new SpeechSynthesisUtterance(text);
  u.lang = currentLocale;
  u.rate = currentRate();
  u.pitch = 1.0;
  // Leaving `voice` unset when none matched is deliberate: the platform then picks from
  // `lang`, which is right. Assigning a wrong-language voice would silently override it.
  if (voice) u.voice = voice;
  if (onEnd) { u.onend = onEnd; u.onerror = onEnd; }
  speechSynthesis.speak(u);
}

/**
 * Speak sentences one-by-one, advancing automatically.
 * Returns a stop function.
 */
export function speakSequence(
  texts: string[],
  startIdx: number,
  onAdvance: (idx: number) => void,
  onDone: () => void,
): () => void {
  const gen = ++currentGen;

  async function speakAt(idx: number) {
    if (gen !== currentGen || idx >= texts.length) { onDone(); return; }
    onAdvance(idx);

    // Pre-fetch next sentence in parallel while this one plays
    if (idx + 1 < texts.length) fetchApiAudio(texts[idx + 1]).catch(() => {});

    const url = await fetchApiAudio(texts[idx]);
    if (gen !== currentGen) return;

    if (url) {
      const audio = new Audio(url);
      audio.playbackRate = 1.0;
      audio.onended = () => { if (gen === currentGen) speakAt(idx + 1); };
      audio.onerror = () => {
        if (gen === currentGen) speakAtBrowser(idx);
      };
      audio.play().catch(() => {
        if (gen === currentGen) speakAtBrowser(idx);
      });
      return;
    }

    speakAtBrowser(idx);
  }

  async function speakAtBrowser(idx: number) {
    if (gen !== currentGen || idx >= texts.length) { onDone(); return; }

    const voice = await resolveVoice();
    if (gen !== currentGen) return;

    const u = new SpeechSynthesisUtterance(texts[idx]);
    u.lang = currentLocale;
    u.rate = currentRate();
    u.pitch = 1.0;
    if (voice) u.voice = voice;
    u.onend = () => { if (gen === currentGen) speakAt(idx + 1); };
    u.onerror = () => { if (gen === currentGen) onDone(); };
    speechSynthesis.speak(u);
  }

  speakAt(startIdx);
  return () => { currentGen++; speechSynthesis.cancel(); };
}

/**
 * Speak a sentence with a deliberate pause where the blank is.
 * Reads `beforeText`, pauses `pauseMs`, then reads `afterText`.
 * If the answer has already been revealed, pass the full sentence to `speak()` instead.
 */
export function speakWithBlank(
  beforeText: string,
  afterText: string,
  pauseMs = 600,
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const before = beforeText.trim();
  const after  = afterText.trim();

  if (!before && !after) return;
  if (!before) { void speak(after); return; }
  if (!after)  { void speak(before); return; }

  // Speak before, then after a gap speak after.
  // Capture gen after `before` finishes so we can bail if the user stops during the gap.
  void speak(before, () => {
    const g = currentGen;
    setTimeout(() => {
      if (currentGen !== g) return; // stopped or re-triggered during the pause
      void speak(after);
    }, pauseMs);
  });
}

/**
 * Warm the audio cache for a text so a later speak() plays instantly. Safe to call
 * eagerly (e.g. when a flashcard is shown) — failures are swallowed.
 */
export async function prefetchAudio(text: string): Promise<void> {
  if (!text) return;
  try { await fetchApiAudio(text); } catch { /* ignore */ }
}

/** Prime the voice list — call once on a user gesture to avoid the async delay. */
export function primeTTS(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    resolveVoice();
  }
}
