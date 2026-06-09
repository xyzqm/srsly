'use client';

let currentGen = 0;

function getVoice(): SpeechSynthesisVoice | undefined {
  return speechSynthesis.getVoices().find(v => /zh|cmn|Chinese|Mandarin/i.test(v.lang + ' ' + v.name));
}

export function speak(text: string, onEnd?: () => void): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  stopAll();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = 0.8;
  const v = getVoice();
  if (v) u.voice = v;
  if (onEnd) { u.onend = onEnd; u.onerror = onEnd; }
  speechSynthesis.speak(u);
}

export function stopAll(): void {
  currentGen++;
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    speechSynthesis.cancel();
  }
}

/** Speak sentences one-by-one, advancing automatically. Returns a stop function. */
export function speakSequence(
  texts: string[],
  startIdx: number,
  onAdvance: (idx: number) => void,
  onDone: () => void,
): () => void {
  const gen = ++currentGen;

  function speakAt(idx: number) {
    if (gen !== currentGen || idx >= texts.length) { onDone(); return; }
    onAdvance(idx);
    const u = new SpeechSynthesisUtterance(texts[idx]);
    u.lang = 'zh-CN';
    u.rate = 0.8;
    const v = getVoice();
    if (v) u.voice = v;
    u.onend = () => { if (gen === currentGen) speakAt(idx + 1); };
    u.onerror = () => { if (gen === currentGen) onDone(); };
    speechSynthesis.speak(u);
  }

  speakAt(startIdx);
  return () => { currentGen++; speechSynthesis.cancel(); };
}

/** Prime the voices list (must be called once on user gesture) */
export function primeTTS(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  }
}
