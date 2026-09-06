/**
 * @vitest-environment jsdom
 *
 * jsdom because the whole point of this module is a localStorage entry, and under the default
 * node environment every read and write is a silent no-op — the tests would pass and prove
 * nothing.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getVoiceChoice, setVoiceChoice } from '@/lib/ttsVoice';

/**
 * The chosen system voice, per language, per DEVICE.
 *
 * The thing worth pinning is where it is NOT: `srsly-prefs`. A voice is a fact about the
 * machine rather than a preference about the app — a `voiceURI` from a Mac with the enhanced
 * Chinese voices installed does not exist on a phone — so syncing it would push a choice onto
 * a device that cannot honour it, and the silent fallback would look like a broken setting.
 */

beforeEach(() => localStorage.clear());

describe('the choice is per language', () => {
  it('keeps one language’s voice without disturbing another’s', () => {
    setVoiceChoice('zh', 'Tingting');
    setVoiceChoice('fr', 'Thomas');
    expect(getVoiceChoice('zh')).toBe('Tingting');
    expect(getVoiceChoice('fr')).toBe('Thomas');
  });

  it('reads an unset language as no choice', () => {
    expect(getVoiceChoice('ja')).toBeNull();
  });

  it('replaces rather than accumulates', () => {
    setVoiceChoice('zh', 'Tingting');
    setVoiceChoice('zh', 'Meijia');
    expect(getVoiceChoice('zh')).toBe('Meijia');
  });
});

describe('clearing restores the ranking', () => {
  /** Null is how a learner says "you pick" — it must remove the key, not store a blank. */
  it('null removes the entry', () => {
    setVoiceChoice('zh', 'Tingting');
    setVoiceChoice('zh', null);
    expect(getVoiceChoice('zh')).toBeNull();
    expect(JSON.parse(localStorage.getItem('srsly-tts-voice') ?? '{}')).toEqual({});
  });

  it('clearing one language leaves the others alone', () => {
    setVoiceChoice('zh', 'Tingting');
    setVoiceChoice('es', 'Monica');
    setVoiceChoice('zh', null);
    expect(getVoiceChoice('es')).toBe('Monica');
  });
});

describe('it never lives in the synced prefs blob', () => {
  it('writes only its own key', () => {
    setVoiceChoice('zh', 'Tingting');
    expect(localStorage.getItem('srsly-prefs')).toBeNull();
    expect(localStorage.getItem('srsly-tts-voice')).toBe('{"zh":"Tingting"}');
  });
});

describe('corrupt storage is not a crash', () => {
  it('reads junk as no choice', () => {
    for (const bad of ['{not json', 'null', '[]', '"x"', '5']) {
      localStorage.setItem('srsly-tts-voice', bad);
      expect(() => getVoiceChoice('zh')).not.toThrow();
      expect(getVoiceChoice('zh')).toBeNull();
    }
  });

  it('a write over junk still lands', () => {
    localStorage.setItem('srsly-tts-voice', '{not json');
    setVoiceChoice('zh', 'Tingting');
    expect(getVoiceChoice('zh')).toBe('Tingting');
  });
});
