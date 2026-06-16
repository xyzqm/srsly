'use client';

// ─── Voice selection ──────────────────────────────────────────────────────────

/**
 * Preferred Chinese voice names, ranked best-first.
 * Each entry is a substring match against the voice name.
 */
const VOICE_PRIORITY = [
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
  // macOS enhanced voices (System Preferences → Accessibility → Speech → Manage Voices)
  'Tingting',     // macOS zh-CN enhanced
  'Meijia',       // macOS zh-TW enhanced (still clear Mandarin)
  'Sinji',        // macOS zh-HK (Cantonese, but still recognisable)
];

let cachedVoice: SpeechSynthesisVoice | null | undefined = undefined; // undefined = not yet resolved

function rankVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const zh = voices.filter(v => /zh|cmn|Chinese|Mandarin/i.test(v.lang + ' ' + v.name));
  if (zh.length === 0) return null;

  for (const name of VOICE_PRIORITY) {
    const match = zh.find(v => v.name.includes(name));
    if (match) return match;
  }

  // Fall back: prefer zh-CN locale over other Chinese locales
  return zh.find(v => v.lang === 'zh-CN') ?? zh[0];
}

function resolveVoice(): Promise<SpeechSynthesisVoice | null> {
  // Only reuse the cache if we actually found a voice — don't short-circuit on null
  if (cachedVoice) return Promise.resolve(cachedVoice);

  return new Promise(resolve => {
    const immediate = speechSynthesis.getVoices();
    if (immediate.length > 0) {
      const v = rankVoices(immediate);
      if (v) cachedVoice = v; // only cache positive hits
      resolve(v);
      return;
    }

    // Voices load asynchronously on first call — wait for the event
    const onChanged = () => {
      speechSynthesis.removeEventListener('voiceschanged', onChanged);
      clearTimeout(timeout);
      const v = rankVoices(speechSynthesis.getVoices());
      if (v) cachedVoice = v;
      resolve(v);
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

/** Blob URL cache: text → object URL */
const apiCache = new Map<string, string>();

/**
 * Returns a Blob URL for the given text using the /api/tts route, or null if
 * no API key is configured or the request fails.
 */
async function fetchApiAudio(text: string): Promise<string | null> {
  if (apiCache.has(text)) return apiCache.get(text)!;

  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) return null; // 501 = no key, 500 = error — both fall back

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    apiCache.set(text, url);
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

/** Browser-only fallback using the best available Chinese voice. */
async function speakBrowser(
  text: string,
  gen: number,
  onEnd?: () => void,
): Promise<void> {
  const voice = await resolveVoice();
  if (gen !== currentGen) return;

  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = 0.82;    // Slightly slower → clearer tones
  u.pitch = 1.0;
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
    u.lang = 'zh-CN';
    u.rate = 0.82;
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
