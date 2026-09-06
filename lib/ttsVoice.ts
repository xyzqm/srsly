/**
 * Which system voice this device should speak with, per language.
 *
 * ── DEVICE-LOCAL, AND THAT IS NOT LAZINESS ──
 * Everything else a learner chooses lives in `srsly-prefs` and syncs. This must not, because
 * a voice is not a preference about the app — it is a fact about the MACHINE. Voices are
 * installed per device: a Mac with the enhanced Chinese voices downloaded and an iPhone
 * expose completely different lists, and a `voiceURI` from one simply does not exist on the
 * other. Syncing it would push a choice onto a device that cannot honour it, and the
 * fallback (silently ignore it and use the ranking) would look exactly like the setting not
 * working. `srsly-anthropic-key` is kept out of prefs for the same shape of reason: the
 * synced blob is the wrong home for something that belongs to one device.
 *
 * The SPEED multiplier is the opposite and does live in prefs — 0.8 means the same thing
 * everywhere, so it is a real preference and travels.
 */
const KEY = 'srsly-tts-voice';

type Choices = Record<string, string>;   // language base ('zh') → voiceURI

function read(): Choices {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return raw && typeof raw === 'object' ? raw as Choices : {};
  } catch {
    return {};
  }
}

/** The voiceURI chosen for this language on this device, or null for "let the app rank". */
export function getVoiceChoice(langBase: string): string | null {
  return read()[langBase] ?? null;
}

/** Passing null clears the choice, which is how a learner gets the ranking back. */
export function setVoiceChoice(langBase: string, voiceURI: string | null): void {
  if (typeof localStorage === 'undefined') return;
  const next = read();
  if (voiceURI) next[langBase] = voiceURI;
  else delete next[langBase];
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* quota — the ranking still works */ }
}
