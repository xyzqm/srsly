import { FREE_DICT, PASSAGE_TOKENS } from './passage';

export interface DictEntry { pinyin: string; meaning: string; }

const DICT: Record<string, DictEntry> = {};

for (const token of PASSAGE_TOKENS) {
  if (!token.pinyin || DICT[token.text]) continue;
  DICT[token.text] = {
    pinyin: token.pinyin,
    meaning: token.meaning || FREE_DICT[token.text] || '',
  };
}

/** Look up a word's pinyin + meaning. Falls back to provided values. */
export function lookupWord(text: string, fallbackPinyin = '', fallbackMeaning = ''): DictEntry {
  const e = DICT[text];
  return {
    pinyin: e?.pinyin || fallbackPinyin,
    meaning: e?.meaning || fallbackMeaning,
  };
}
