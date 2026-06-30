/**
 * Static Japanese reading passages (one per JLPT level, N5 → N1), used as the fallback
 * when AI-generated daily content is unavailable. Mirrors the PassageData shape produced
 * by allPassages.ts. Readings are hiragana furigana.
 */
import type { PassageToken, Sentence, Question, FillItem } from '@/lib/types';
import type { PassageData } from './allPassages';
import { JLPT_STATIC_CONVOS } from './jlpt-staticConvos';

// [text] punctuation | [text, reading] word | [text, reading, meaning] vocab
type RawToken = [string] | [string, string] | [string, string, string];

function rawToToken(raw: RawToken): PassageToken {
  if (raw.length === 3) return { text: raw[0], reading: raw[1], meaning: raw[2], type: 'vocab' };
  if (raw.length === 2) return { text: raw[0], reading: raw[1] };
  return { text: raw[0], type: 'punct' };
}

function buildSentences(raw: RawToken[]): Sentence[] {
  const tokens = raw.map(rawToToken);
  const out: Sentence[] = [];
  let cur: PassageToken[] = [];
  for (const tk of tokens) {
    cur.push(tk);
    if (tk.text === '。' || tk.text === '！' || tk.text === '？') {
      out.push({ tokens: cur, plainText: cur.map(t => t.text).join('') });
      cur = [];
    }
  }
  if (cur.length) out.push({ tokens: cur, plainText: cur.map(t => t.text).join('') });
  return out;
}

/** Token helper for question/fill fragments. */
const w = (text: string, reading?: string): PassageToken => reading ? { text, reading } : { text, type: 'punct' };

function buildPassage(
  level: number,
  titleTokens: PassageToken[],
  raw: RawToken[],
  questions: Question[],
  fillItems: FillItem[],
  charCount: number,
): PassageData {
  const sentences = buildSentences(raw);
  const vocabSet = new Set(sentences.flatMap(s => s.tokens.filter(t => t.type === 'vocab').map(t => t.text)));
  return {
    level,
    titleText: titleTokens.map(t => t.text).join(''),
    titleTokens,
    sentences,
    vocabSet,
    questions,
    fillItems,
    conversation: JLPT_STATIC_CONVOS[level] ?? JLPT_STATIC_CONVOS[4],
    charCount,
  };
}

// ─── N5 — 私の一日 ───────────────────────────────────────────────────────────
const N5_RAW: RawToken[] = [
  ['私', 'わたし', 'I; me'], ['は', 'は'], ['毎朝', 'まいあさ', 'every morning'], ['六', 'ろく'], ['時', 'じ', "o'clock"], ['に', 'に'], ['起きます', 'おきます', 'to wake up'], ['。'],
  ['朝', 'あさ', 'morning'], ['ご飯', 'ごはん', 'meal; rice'], ['を', 'を'], ['食べて', 'たべて', 'to eat'], ['、'], ['学校', 'がっこう', 'school'], ['へ', 'へ'], ['行きます', 'いきます', 'to go'], ['。'],
  ['学校', 'がっこう', 'school'], ['で', 'で'], ['日本語', 'にほんご', 'Japanese language'], ['を', 'を'], ['勉強します', 'べんきょうします', 'to study'], ['。'],
  ['夜', 'よる', 'night'], ['は', 'は'], ['家', 'いえ', 'house; home'], ['で', 'で'], ['本', 'ほん', 'book'], ['を', 'を'], ['読みます', 'よみます', 'to read'], ['。'],
];
const N5_QUESTIONS: Question[] = [
  {
    q: [w('私', 'わたし'), w('は'), w('毎朝', 'まいあさ'), w('何', 'なん'), w('時', 'じ'), w('に'), w('起きます', 'おきます'), w('か'), w('？')],
    model: '六時に起きます。',
    key: ['六時', 'ろくじ'],
    options: [
      { tokens: [w('六', 'ろく'), w('時', 'じ')], correct: true },
      { tokens: [w('七', 'しち'), w('時', 'じ')], correct: false },
      { tokens: [w('八', 'はち'), w('時', 'じ')], correct: false },
    ],
  },
];
const N5_FILL: FillItem[] = [
  {
    before: [w('学校', 'がっこう'), w('で'), w('日本語', 'にほんご'), w('を')],
    answer: ['勉強します', 'べんきょうします'],
    after: [w('。')],
    options: [['勉強します', 'べんきょうします', true], ['食べます', 'たべます', false], ['起きます', 'おきます', false]],
  },
];

// ─── N4 — 週末の予定 ─────────────────────────────────────────────────────────
const N4_RAW: RawToken[] = [
  ['今度', 'こんど', 'next time'], ['の', 'の'], ['週末', 'しゅうまつ', 'weekend'], ['、'], ['友達', 'ともだち', 'friend'], ['と', 'と'], ['映画', 'えいが', 'movie'], ['を', 'を'], ['見に', 'みに', 'to see'], ['行く', 'いく', 'to go'], ['つもり', 'つもり', 'intend to'], ['です', 'です'], ['。'],
  ['映画', 'えいが', 'movie'], ['の', 'の'], ['後', 'あと', 'after'], ['で', 'で'], ['一緒に', 'いっしょに', 'together'], ['食事', 'しょくじ', 'meal'], ['を', 'を'], ['します', 'します', 'to do'], ['。'],
  ['天気', 'てんき', 'weather'], ['が', 'が'], ['よければ', 'よければ', 'if good'], ['、'], ['公園', 'こうえん', 'park'], ['も', 'も'], ['散歩', 'さんぽ', 'walk'], ['したい', 'したい', 'want to do'], ['です', 'です'], ['。'],
];
const N4_QUESTIONS: Question[] = [
  {
    q: [w('週末', 'しゅうまつ'), w('に'), w('誰', 'だれ'), w('と'), w('映画', 'えいが'), w('を'), w('見ます', 'みます'), w('か'), w('？')],
    model: '友達と見ます。',
    key: ['友達', 'ともだち'],
    options: [
      { tokens: [w('友達', 'ともだち')], correct: true },
      { tokens: [w('家族', 'かぞく')], correct: false },
      { tokens: [w('先生', 'せんせい')], correct: false },
    ],
  },
];
const N4_FILL: FillItem[] = [
  {
    before: [w('映画', 'えいが'), w('の'), w('後', 'あと'), w('で'), w('一緒に', 'いっしょに')],
    answer: ['食事', 'しょくじ'],
    after: [w('を'), w('します', 'します'), w('。')],
    options: [['食事', 'しょくじ', true], ['散歩', 'さんぽ', false], ['天気', 'てんき', false]],
  },
];

// ─── N3 — 新しい習慣 ─────────────────────────────────────────────────────────
const N3_RAW: RawToken[] = [
  ['最近', 'さいきん', 'recently'], ['、'], ['毎朝', 'まいあさ', 'every morning'], ['走る', 'はしる', 'to run'], ['ように', 'ように'], ['なりました', 'なりました', 'became'], ['。'],
  ['運動', 'うんどう', 'exercise'], ['を', 'を'], ['始めて', 'はじめて', 'to begin'], ['から', 'から'], ['、'], ['体', 'からだ', 'body'], ['の', 'の'], ['調子', 'ちょうし', 'condition'], ['が', 'が'], ['よく', 'よく'], ['なった', 'なった', 'became'], ['気がします', 'きがします', 'feel that'], ['。'],
  ['続ける', 'つづける', 'to continue'], ['こと', 'こと'], ['は', 'は'], ['簡単', 'かんたん', 'easy'], ['では', 'では'], ['ありません', 'ありません'], ['が', 'が'], ['、'], ['頑張りたい', 'がんばりたい', 'want to try hard'], ['です', 'です'], ['。'],
];
const N3_QUESTIONS: Question[] = [
  {
    q: [w('運動', 'うんどう'), w('を'), w('始めて', 'はじめて'), w('から'), w('何', 'なに'), w('が'), w('変わりました', 'かわりました'), w('か'), w('？')],
    model: '体の調子がよくなりました。',
    key: ['調子', 'ちょうし'],
    options: [
      { tokens: [w('体', 'からだ'), w('の'), w('調子', 'ちょうし')], correct: true },
      { tokens: [w('天気', 'てんき')], correct: false },
      { tokens: [w('仕事', 'しごと')], correct: false },
    ],
  },
];
const N3_FILL: FillItem[] = [
  {
    before: [w('続ける', 'つづける'), w('こと'), w('は')],
    answer: ['簡単', 'かんたん'],
    after: [w('では'), w('ありません', 'ありません'), w('。')],
    options: [['簡単', 'かんたん', true], ['運動', 'うんどう', false], ['最近', 'さいきん', false]],
  },
];

// ─── N2 — 環境問題 ───────────────────────────────────────────────────────────
const N2_RAW: RawToken[] = [
  ['地球', 'ちきゅう', 'the earth'], ['温暖化', 'おんだんか', 'global warming'], ['は', 'は'], ['、'], ['現代', 'げんだい', 'modern times'], ['社会', 'しゃかい', 'society'], ['が', 'が'], ['抱える', 'かかえる', 'to face'], ['大きな', 'おおきな', 'big'], ['課題', 'かだい', 'challenge'], ['です', 'です'], ['。'],
  ['一人', 'ひとり', 'one person'], ['一人', 'ひとり', 'one person'], ['の', 'の'], ['努力', 'どりょく', 'effort'], ['が', 'が'], ['、'], ['やがて', 'やがて', 'eventually'], ['大きな', 'おおきな', 'big'], ['変化', 'へんか', 'change'], ['に', 'に'], ['つながります', 'つながります', 'to lead to'], ['。'],
  ['私たち', 'わたしたち', 'we'], ['は', 'は'], ['資源', 'しげん', 'resources'], ['を', 'を'], ['大切に', 'たいせつに', 'carefully'], ['使う', 'つかう', 'to use'], ['べき', 'べき', 'should'], ['です', 'です'], ['。'],
];
const N2_QUESTIONS: Question[] = [
  {
    q: [w('地球', 'ちきゅう'), w('温暖化', 'おんだんか'), w('は'), w('どんな', 'どんな'), w('課題', 'かだい'), w('です', 'です'), w('か'), w('？')],
    model: '現代社会が抱える大きな課題です。',
    key: ['課題', 'かだい'],
    options: [
      { tokens: [w('大きな', 'おおきな'), w('課題', 'かだい')], correct: true },
      { tokens: [w('小さな', 'ちいさな'), w('問題', 'もんだい')], correct: false },
      { tokens: [w('簡単', 'かんたん'), w('な'), w('こと')], correct: false },
    ],
  },
];
const N2_FILL: FillItem[] = [
  {
    before: [w('私たち', 'わたしたち'), w('は'), w('資源', 'しげん'), w('を')],
    answer: ['大切に', 'たいせつに'],
    after: [w('使う', 'つかう'), w('べき'), w('です', 'です'), w('。')],
    options: [['大切に', 'たいせつに', true], ['自由に', 'じゆうに', false], ['簡単に', 'かんたんに', false]],
  },
];

// ─── N1 — 技術と社会 ─────────────────────────────────────────────────────────
const N1_RAW: RawToken[] = [
  ['人工', 'じんこう', 'artificial'], ['知能', 'ちのう', 'intelligence'], ['の', 'の'], ['急速', 'きゅうそく', 'rapid'], ['な', 'な'], ['発展', 'はってん', 'development'], ['は', 'は'], ['、'], ['社会', 'しゃかい', 'society'], ['の', 'の'], ['あり方', 'ありかた', 'the way things are'], ['を', 'を'], ['根本', 'こんぽん', 'fundamental'], ['から', 'から'], ['変えつつ', 'かえつつ', 'in the midst of changing'], ['あります', 'あります'], ['。'],
  ['利便', 'りべん', 'convenience'], ['性', 'せい', '-ness'], ['が', 'が'], ['高まる', 'たかまる', 'to increase'], ['一方', 'いっぽう', 'on the other hand'], ['で', 'で'], ['、'], ['雇用', 'こよう', 'employment'], ['や', 'や'], ['倫理', 'りんり', 'ethics'], ['を', 'を'], ['めぐる', 'めぐる', 'concerning'], ['課題', 'かだい', 'issue'], ['も', 'も'], ['浮かび上がって', 'うかびあがって', 'to emerge'], ['きました', 'きました'], ['。'],
  ['私たち', 'わたしたち', 'we'], ['には', 'には'], ['、'], ['技術', 'ぎじゅつ', 'technology'], ['と', 'と'], ['どう', 'どう'], ['向き合う', 'むきあう', 'to confront'], ['か', 'か'], ['が', 'が'], ['問われて', 'とわれて', 'to be questioned'], ['います', 'います'], ['。'],
];
const N1_QUESTIONS: Question[] = [
  {
    q: [w('人工', 'じんこう'), w('知能', 'ちのう'), w('の'), w('発展', 'はってん'), w('は'), w('社会', 'しゃかい'), w('を'), w('どう', 'どう'), w('変えて', 'かえて'), w('います', 'います'), w('か'), w('？')],
    model: '社会のあり方を根本から変えつつあります。',
    key: ['根本', 'こんぽん'],
    options: [
      { tokens: [w('根本', 'こんぽん'), w('から'), w('変えて', 'かえて'), w('いる')], correct: true },
      { tokens: [w('少し', 'すこし'), w('だけ'), w('変えて', 'かえて'), w('いる')], correct: false },
      { tokens: [w('全く', 'まったく'), w('変えて', 'かえて'), w('いない')], correct: false },
    ],
  },
];
const N1_FILL: FillItem[] = [
  {
    before: [w('雇用', 'こよう'), w('や'), w('倫理', 'りんり'), w('を'), w('めぐる', 'めぐる')],
    answer: ['課題', 'かだい'],
    after: [w('も'), w('浮かび上がって', 'うかびあがって'), w('きました', 'きました'), w('。')],
    options: [['課題', 'かだい', true], ['利便', 'りべん', false], ['発展', 'はってん', false]],
  },
];

export const JA_PASSAGES: PassageData[] = [
  buildPassage(5, [{ text: '私', reading: 'わたし', meaning: 'I; me' }, { text: 'の', reading: 'の' }, { text: '一日', reading: 'いちにち', meaning: 'one day' }], N5_RAW, N5_QUESTIONS, N5_FILL, 90),
  buildPassage(4, [{ text: '週末', reading: 'しゅうまつ', meaning: 'weekend' }, { text: 'の', reading: 'の' }, { text: '予定', reading: 'よてい', meaning: 'plans' }], N4_RAW, N4_QUESTIONS, N4_FILL, 110),
  buildPassage(3, [{ text: '新しい', reading: 'あたらしい', meaning: 'new' }, { text: '習慣', reading: 'しゅうかん', meaning: 'habit' }], N3_RAW, N3_QUESTIONS, N3_FILL, 130),
  buildPassage(2, [{ text: '環境', reading: 'かんきょう', meaning: 'environment' }, { text: '問題', reading: 'もんだい', meaning: 'problem' }], N2_RAW, N2_QUESTIONS, N2_FILL, 160),
  buildPassage(1, [{ text: '技術', reading: 'ぎじゅつ', meaning: 'technology' }, { text: 'と', reading: 'と' }, { text: '社会', reading: 'しゃかい', meaning: 'society' }], N1_RAW, N1_QUESTIONS, N1_FILL, 200),
];

/** N5 → N1 by level number (5 … 1). Defaults to N4. */
export function getJaPassageData(jlptLevel: number): PassageData {
  return JA_PASSAGES.find(p => p.level === jlptLevel) ?? JA_PASSAGES[1];
}
