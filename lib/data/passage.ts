import type { PassageToken, Sentence } from '@/lib/types';

// Each entry: [text] | [text, pinyin] | [text, pinyin, meaning]
// length === 3 → vocab word (SRS penalty on click)
// length === 2 and in FREE_DICT → free lookup (no penalty)
// length === 1 or just punctuation → plain
type RawToken = [string] | [string, string] | [string, string, string];

const RAW: RawToken[] = [
  ['我','wǒ'],['住','zhù'],['在','zài'],['一个','yí gè'],['很','hěn'],['大','dà'],['的','de'],
  ['城市','chéngshì','city; town'],['。'],
  ['这里','zhèlǐ'],['每天','měitiān'],['都会','dōu huì'],['产生','chǎnshēng'],['很多','hěn duō'],
  ['垃圾','lājī','garbage; trash; rubbish'],['。'],
  ['为了','wèile'],['保护','bǎohù','to protect; to safeguard'],['环境','huánjìng','environment; surroundings'],['，'],
  ['我们','wǒmen'],['应该','yīnggāi'],['减少','jiǎnshǎo','to reduce; to decrease'],['浪费','làngfèi'],['，'],
  ['把','bǎ'],['垃圾','lājī','garbage; trash; rubbish'],['分类','fēnlèi','to sort; to classify'],['，'],
  ['并且','bìngqiě'],['回收','huíshōu','to recycle; to reclaim'],['能','néng'],['再','zài'],['用','yòng'],['的','de'],['东西','dōngxi'],['。'],
  ['如果','rúguǒ'],['每个','měi gè'],['人','rén'],['都','dōu'],['养成','yǎngchéng'],['这样','zhèyàng'],['的','de'],['好','hǎo'],
  ['习惯','xíguàn','habit; custom'],['，'],
  ['城市','chéngshì','city; town'],['就','jiù'],['会','huì'],['越来越','yuèláiyuè'],['干净','gānjìng'],['。'],
];

export const FREE_DICT: Record<string, string> = {
  '我': 'I · me', '住': 'to live · to reside', '在': 'at · in · on',
  '一个': 'one (+ measure word)', '很': 'very · quite', '大': 'big · large',
  '的': '(modifier / possessive particle)', '这里': 'here · this place',
  '每天': 'every day', '都会': 'always will · is sure to',
  '产生': 'to produce · to generate', '很多': 'many · a lot of',
  '浪费': 'to waste · wasteful', '把': '(disposal / direct object particle)',
  '并且': 'moreover · and also', '能': 'can · to be able to',
  '再': 'again · once more', '用': 'to use · to employ',
  '东西': 'thing · stuff · object', '如果': 'if · supposing that',
  '每个': 'every · each', '人': 'person · people',
  '都': 'all · both · already', '养成': 'to develop (a habit) · to form',
  '这样': 'like this · in this way', '好': 'good · well · okay',
  '就': 'then · just · right away', '会': 'will · can · to be able to',
  '越来越': 'more and more · increasingly', '干净': 'clean · neat · tidy',
  '应该': 'should · ought to', '为了': 'in order to · for the purpose of',
  '我们': 'we · us · our',
};

function rawToToken(raw: RawToken): PassageToken {
  if (raw.length === 3) {
    return { text: raw[0], pinyin: raw[1], meaning: raw[2], type: 'vocab' };
  }
  if (raw.length === 2) {
    const meaning = FREE_DICT[raw[0]];
    return { text: raw[0], pinyin: raw[1], meaning, type: meaning ? 'free' : undefined };
  }
  return { text: raw[0], type: 'punct' };
}

export const PASSAGE_TOKENS: PassageToken[] = RAW.map(rawToToken);

// Split into sentences on 。
export const SENTENCES: Sentence[] = (() => {
  const out: Sentence[] = [];
  let cur: PassageToken[] = [];
  for (const t of PASSAGE_TOKENS) {
    cur.push(t);
    if (t.text === '。') {
      out.push({ tokens: cur, plainText: cur.map(t => t.text).join('') });
      cur = [];
    }
  }
  if (cur.length) out.push({ tokens: cur, plainText: cur.map(t => t.text).join('') });
  return out;
})();
