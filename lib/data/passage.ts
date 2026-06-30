import type { PassageToken, Sentence } from '@/lib/types';

// Each entry: [text] | [text, pinyin] | [text, pinyin, meaning]
// length === 3 → vocab word (SRS penalty on click)
// length === 2 and in FREE_DICT → free lookup (no penalty)
// length === 1 or just punctuation → plain
type RawToken = [string] | [string, string] | [string, string, string];

const RAW: RawToken[] = [
  // Sentence 1
  ['我','wǒ'],['住','zhù'],['在','zài'],['一个','yí gè'],['很','hěn'],['大','dà'],['的','de'],
  ['城市','chéngshì','city; town'],['。'],
  // Sentence 2
  ['这里','zhèlǐ'],['每天','měitiān'],['都会','dōu huì'],['产生','chǎnshēng'],['很多','hěn duō'],
  ['垃圾','lājī','garbage; trash; rubbish'],['。'],
  // Sentence 3
  ['为了','wèile'],['保护','bǎohù','to protect; to safeguard'],['环境','huánjìng','environment; surroundings'],['，'],
  ['我们','wǒmen'],['应该','yīnggāi'],['减少','jiǎnshǎo','to reduce; to decrease'],['浪费','làngfèi'],['，'],
  ['把','bǎ'],['垃圾','lājī','garbage; trash; rubbish'],['分类','fēnlèi','to sort; to classify'],['，'],
  ['并且','bìngqiě'],['回收','huíshōu','to recycle; to reclaim'],['能','néng'],['再','zài'],['用','yòng'],['的','de'],['东西','dōngxi'],['。'],
  // Sentence 4
  ['如果','rúguǒ'],['每个','měi gè'],['人','rén'],['都','dōu'],['养成','yǎngchéng'],['这样','zhèyàng'],['的','de'],['好','hǎo'],
  ['习惯','xíguàn','habit; custom'],['，'],
  ['城市','chéngshì','city; town'],['就','jiù'],['会','huì'],['越来越','yuèláiyuè'],['干净','gānjìng'],['。'],
  // Sentence 5
  ['最近','zuìjìn'],['，'],
  ['政府','zhèngfǔ','government; administration'],
  ['开始','kāishǐ'],['推行','tuīxíng','to implement; to promote'],
  ['新','xīn'],['的','de'],
  ['垃圾','lājī','garbage; trash; rubbish'],
  ['分类','fēnlèi','to sort; to classify'],
  ['制度','zhìdù','system; institution'],['。'],
  // Sentence 6
  ['居民','jūmín','residents; inhabitants'],
  ['要','yào'],['把','bǎ'],
  ['生活','shēnghuó','daily life; to live'],
  ['垃圾','lājī','garbage; trash; rubbish'],
  ['分成','fēn chéng'],['可','kě'],
  ['回收','huíshōu','to recycle; to reclaim'],
  ['、'],
  ['有害','yǒuhài','harmful; hazardous'],
  ['和','hé'],['其他','qítā'],['几','jǐ'],['类','lèi'],['。'],
  // Sentence 7
  ['很多','hěn duō'],['人','rén'],['觉得','juéde'],
  ['麻烦','máfan','troublesome; a bother'],
  ['，'],['但','dàn'],['慢慢地','mànmànde'],['明白','míngbai'],
  ['了','le'],['分类','fēnlèi','to sort; to classify'],['的','de'],
  ['重要性','zhòngyàoxìng','importance; significance'],['。'],
  // Sentence 8
  ['我','wǒ'],
  ['相信','xiāngxìn','to believe; to trust'],
  ['，'],['只要','zhǐyào'],['大家','dàjiā'],
  ['共同','gòngtóng','jointly; together'],
  ['努力','nǔlì','to work hard; effort'],
  ['，'],
  ['城市','chéngshì','city; town'],
  ['一定','yīdìng'],['会','huì'],
  ['变得','biàndé'],['更加','gèngjiā'],
  ['美丽','měilì','beautiful; beauty'],['。'],
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
  // New entries for sentences 5–8
  '最近': 'recently · lately',
  '开始': 'to start · to begin',
  '新': 'new · fresh',
  '要': 'to want · to need',
  '分成': 'to divide into',
  '可': 'can · may',
  '和': 'and · with',
  '其他': 'other · the rest',
  '几': 'several · a few',
  '类': 'category · type',
  '觉得': 'to feel · to think',
  '但': 'but · however',
  '慢慢地': 'gradually · slowly',
  '明白': 'to understand · to realize',
  '了': '(completion particle)',
  '只要': 'as long as · provided that',
  '大家': 'everyone · all of us',
  '一定': 'definitely · certainly',
  '变得': 'to become',
  '更加': 'even more · further',
};

function rawToToken(raw: RawToken): PassageToken {
  if (raw.length === 3) {
    return { text: raw[0], reading: raw[1], meaning: raw[2], type: 'vocab' };
  }
  if (raw.length === 2) {
    const meaning = FREE_DICT[raw[0]];
    return { text: raw[0], reading: raw[1], meaning, type: meaning ? 'free' : undefined };
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
