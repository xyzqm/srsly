import { PASSAGES } from './allPassages';

export interface DictEntry { pinyin: string; meaning: string; }

const DICT: Record<string, DictEntry> = {};

for (const passage of PASSAGES) {
  for (const sentence of passage.sentences) {
    for (const token of sentence.tokens) {
      if (!token.pinyin || DICT[token.text]) continue;
      DICT[token.text] = { pinyin: token.pinyin, meaning: token.meaning || '' };
    }
  }
}

/** Look up a word's pinyin + meaning. Falls back to provided values. */
export function lookupWord(text: string, fallbackPinyin = '', fallbackMeaning = ''): DictEntry {
  const e = DICT[text];
  return {
    pinyin: e?.pinyin || fallbackPinyin,
    meaning: e?.meaning || fallbackMeaning,
  };
}
