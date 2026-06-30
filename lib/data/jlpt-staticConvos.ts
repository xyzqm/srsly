/**
 * Per-JLPT-level static fallback conversations (used when AI content is unavailable).
 * Keyed by level number: 5 = N5 (easiest) … 1 = N1 (hardest).
 */
import type { ConvoTurn } from '@/lib/types';

// token helper: reading = hiragana furigana; no reading ⇒ punctuation.
function t(text: string, reading?: string) {
  return reading ? { text, reading } : { text, type: 'punct' as const };
}

const N5_CONVO: ConvoTurn[] = [
  {
    key: ['名前', 'なまえ'],
    tokens: [t('お', 'お'), t('名前', 'なまえ'), t('は', 'は'), t('？', undefined)],
    suggestions: [
      [t('私', 'わたし'), t('は', 'は'), t('田中', 'たなか'), t('です', 'です'), t('。', undefined)],
    ],
  },
  {
    key: ['出身', 'しゅっしん'],
    tokens: [t('ご', 'ご'), t('出身', 'しゅっしん'), t('は', 'は'), t('どちら', 'どちら'), t('です', 'です'), t('か', 'か'), t('？', undefined)],
    suggestions: [
      [t('東京', 'とうきょう'), t('から', 'から'), t('来ました', 'きました'), t('。', undefined)],
    ],
  },
];

const N4_CONVO: ConvoTurn[] = [
  {
    key: ['趣味', 'しゅみ'],
    tokens: [t('趣味', 'しゅみ'), t('は', 'は'), t('何', 'なに'), t('です', 'です'), t('か', 'か'), t('？', undefined)],
    suggestions: [
      [t('音楽', 'おんがく'), t('を', 'を'), t('聞く', 'きく'), t('こと', 'こと'), t('です', 'です'), t('。', undefined)],
    ],
  },
];

const N3_CONVO: ConvoTurn[] = [
  {
    key: ['経験', 'けいけん'],
    tokens: [t('日本', 'にほん'), t('で', 'で'), t('働いた', 'はたらいた'), t('経験', 'けいけん'), t('が', 'が'), t('あります', 'あります'), t('か', 'か'), t('？', undefined)],
    suggestions: [
      [t('はい', 'はい'), t('、', undefined), t('二', 'に'), t('年間', 'ねんかん'), t('あります', 'あります'), t('。', undefined)],
    ],
  },
];

const N2_CONVO: ConvoTurn[] = [
  {
    key: ['意見', 'いけん'],
    tokens: [t('この', 'この'), t('問題', 'もんだい'), t('に', 'に'), t('ついて', 'ついて'), t('意見', 'いけん'), t('を', 'を'), t('聞かせて', 'きかせて'), t('ください', 'ください'), t('。', undefined)],
    suggestions: [
      [t('私', 'わたし'), t('は', 'は'), t('賛成', 'さんせい'), t('です', 'です'), t('。', undefined)],
    ],
  },
];

const N1_CONVO: ConvoTurn[] = [
  {
    key: ['影響', 'えいきょう'],
    tokens: [t('技術', 'ぎじゅつ'), t('の', 'の'), t('発展', 'はってん'), t('は', 'は'), t('社会', 'しゃかい'), t('に', 'に'), t('どんな', 'どんな'), t('影響', 'えいきょう'), t('を', 'を'), t('与えます', 'あたえます'), t('か', 'か'), t('？', undefined)],
    suggestions: [
      [t('大きな', 'おおきな'), t('変化', 'へんか'), t('を', 'を'), t('もたらします', 'もたらします'), t('。', undefined)],
    ],
  },
];

/** Keyed by JLPT level number (5 = N5 … 1 = N1). */
export const JLPT_STATIC_CONVOS: Record<number, ConvoTurn[]> = {
  5: N5_CONVO,
  4: N4_CONVO,
  3: N3_CONVO,
  2: N2_CONVO,
  1: N1_CONVO,
};
