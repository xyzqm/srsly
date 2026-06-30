import type { PassageToken, Sentence, Question, FillItem, ConvoTurn, LanguageCode } from '@/lib/types';
import { STATIC_CONVOS } from './staticConvos';
import { getJaPassageData } from './jlpt-passages';

type RawToken = [string] | [string, string] | [string, string, string];

function rawToToken(raw: RawToken, freeDict: Record<string, string>): PassageToken {
  if (raw.length === 3) return { text: raw[0], reading: raw[1], meaning: raw[2], type: 'vocab' };
  if (raw.length === 2) {
    const meaning = freeDict[raw[0]];
    return { text: raw[0], reading: raw[1], meaning, type: meaning ? 'free' : undefined };
  }
  return { text: raw[0], type: 'punct' };
}

function buildSentences(raw: RawToken[], freeDict: Record<string, string>): Sentence[] {
  const tokens = raw.map(r => rawToToken(r, freeDict));
  const out: Sentence[] = [];
  let cur: PassageToken[] = [];
  for (const t of tokens) {
    cur.push(t);
    if (t.text === '。' || t.text === '！' || t.text === '？') {
      out.push({ tokens: cur, plainText: cur.map(t => t.text).join('') });
      cur = [];
    }
  }
  if (cur.length) out.push({ tokens: cur, plainText: cur.map(t => t.text).join('') });
  return out;
}

function pt(text: string, reading?: string): PassageToken {
  return reading ? { text, reading } : { text, type: 'punct' };
}

export interface PassageData {
  level: number;
  titleText: string;
  titleTokens: PassageToken[];
  sentences: Sentence[];
  vocabSet: Set<string>;
  questions: Question[];
  fillItems: FillItem[];
  conversation: ConvoTurn[];
  charCount: number;
}

// ─────────────────────────────────────────────
// HSK 1 — 我的家 (My Home)
// ─────────────────────────────────────────────
const HSK1_FREE: Record<string, string> = {
  '我': 'I · me', '有': 'to have', '一个': 'one (measure word)',
  '小': 'small · little', '家': 'home · family', '很': 'very · quite',
  '高': 'tall · high', '和': 'and · with', '他': 'he · him',
  '猫': 'cat', '每天': 'every day', '早上': 'in the morning',
  '一起': 'together', '早饭': 'breakfast', '晚上': 'in the evening',
  '坐': 'to sit', '看': 'to watch · to look', '电视': 'television · TV',
  '水': 'water', '茶': 'tea', '家人': 'family members',
  '的': '(modifier particle)', '在': 'at · in',
  '我们': 'we · us', '也': 'also · too',
};

const HSK1_RAW: RawToken[] = [
  ['我','wǒ'], ['有','yǒu'], ['一个','yī gè'], ['小','xiǎo'], ['家','jiā'], ['。'],
  ['我','wǒ'], ['的','de'], ['爸爸', 'bàba', 'father · dad'],
  ['很','hěn'], ['高','gāo'], ['，'],
  ['妈妈', 'māma', 'mother · mom'], ['很','hěn'], ['漂亮', 'piàoliang', 'pretty · beautiful'], ['。'],
  ['我','wǒ'], ['有','yǒu'], ['一个','yī gè'],
  ['哥哥', 'gēge', 'older brother'],
  ['，'], ['他','tā'],
  ['喜欢', 'xǐhuān', 'to like · to enjoy'],
  ['吃', 'chī', 'to eat'],
  ['面条', 'miàntiáo', 'noodles'], ['。'],
  ['我们','wǒmen'], ['家','jiā'], ['有','yǒu'], ['一只','yī zhī'],
  ['猫','māo'], ['，'], ['很','hěn'], ['可爱', 'kě\'ài', 'cute · adorable'], ['。'],
  ['每天','měitiān'], ['早上','zǎoshang'], ['，'],
  ['我们','wǒmen'], ['一起','yìqǐ'], ['吃','chī'], ['早饭','zǎofàn'], ['。'],
  ['妈妈','māma'],
  ['喜欢','xǐhuān'],
  ['喝', 'hē', 'to drink'],
  ['茶','chá'], ['，'],
  ['爸爸','bàba'],
  ['喜欢','xǐhuān'], ['喝','hē'], ['水','shuǐ'], ['。'],
  ['晚上','wǎnshang'], ['，'],
  ['我们','wǒmen'], ['坐','zuò'], ['在','zài'], ['一起','yìqǐ'], ['看','kàn'], ['电视','diànshì'], ['。'],
  ['我','wǒ'], ['很','hěn'],
  ['爱', 'ài', 'to love · love'],
  ['我','wǒ'], ['的','de'], ['家人','jiārén'], ['。'],
  // Extended sentences
  ['我们','wǒmen'], ['的','de'], ['家','jiā'], ['有','yǒu'], ['一个','yī gè'], ['小','xiǎo'],
  ['花园', 'huāyuán', 'garden · flower garden'], ['。'],
  ['爸爸','bàba'], ['喜欢','xǐhuān'], ['在','zài'], ['那里','nàlǐ'],
  ['种', 'zhòng', 'to plant · to grow'],
  ['花', 'huā', 'flower · blossom'], ['。'],
  ['周末','zhōumò'], ['，'],
  ['我们','wǒmen'], ['有时候','yǒu shíhou'], ['一起','yìqǐ'],
  ['去','qù'],
  ['超市', 'chāoshì', 'supermarket'],
  ['买','mǎi'],
  ['东西', 'dōngxi', 'things · stuff'], ['。'],
  ['我','wǒ'], ['有','yǒu'], ['自己','zìjǐ'], ['的','de'], ['小','xiǎo'],
  ['房间', 'fángjiān', 'room · bedroom'], ['，'],
  ['里面','lǐmiàn'], ['有','yǒu'], ['很多','hěn duō'],
  ['书', 'shū', 'book'], ['。'],
];

const HSK1_QUESTIONS: Question[] = [
  {
    q: [pt('爸爸','bàba'), pt('长','zhǎng'), pt('得','de'), pt('怎么样','zěnme yàng'), pt('？')],
    model: '爸爸很高。',
    key: ['爸爸', '高'],
    options: [
      { tokens: [pt('很','hěn'), pt('矮','ǎi')], correct: false },
      { tokens: [pt('很','hěn'), pt('高','gāo')], correct: true },
      { tokens: [pt('很','hěn'), pt('胖','pàng')], correct: false },
    ],
  },
  {
    q: [pt('哥哥','gēge'), pt('喜欢','xǐhuān'), pt('吃','chī'), pt('什么','shénme'), pt('？')],
    model: '哥哥喜欢吃面条。',
    key: ['面条'],
    options: [
      { tokens: [pt('米饭','mǐfàn')], correct: false },
      { tokens: [pt('面条','miàntiáo')], correct: true },
      { tokens: [pt('包子','bāozi')], correct: false },
    ],
  },
  {
    q: [pt('妈妈','māma'), pt('喜欢','xǐhuān'), pt('喝','hē'), pt('什么','shénme'), pt('？')],
    model: '妈妈喜欢喝茶。',
    key: ['茶'],
    options: [
      { tokens: [pt('水','shuǐ')], correct: false },
      { tokens: [pt('茶','chá')], correct: true },
      { tokens: [pt('果汁','guǒzhī')], correct: false },
    ],
  },
  {
    q: [pt('晚上','wǎnshang'), pt('，'), pt('家人','jiārén'), pt('一起','yìqǐ'), pt('做','zuò'), pt('什么','shénme'), pt('？')],
    model: '晚上一起看电视。',
    key: ['电视', '看'],
    options: [
      { tokens: [pt('出去','chūqù'), pt('散步','sànbù')], correct: false },
      { tokens: [pt('看','kàn'), pt('电视','diànshì')], correct: true },
      { tokens: [pt('打','dǎ'), pt('游戏','yóuxì')], correct: false },
    ],
  },
  {
    q: [pt('作者','zuòzhě'), pt('家','jiā'), pt('有','yǒu'), pt('什么','shénme'), pt('动物','dòngwù'), pt('？')],
    model: '家里有一只猫。',
    key: ['猫'],
    options: [
      { tokens: [pt('狗','gǒu')], correct: false },
      { tokens: [pt('鱼','yú')], correct: false },
      { tokens: [pt('猫','māo')], correct: true },
    ],
  },
];

const HSK1_FILL: FillItem[] = [
  {
    before: [pt('我'), pt('很')],
    answer: ['爱', 'ài'],
    after: [pt('我'), pt('的'), pt('家人','jiārén'), pt('。')],
    options: [['爱','ài',true], ['喝','hē',false], ['吃','chī',false], ['看','kàn',false]],
  },
  {
    before: [pt('妈妈','māma'), pt('喜欢','xǐhuān')],
    answer: ['喝', 'hē'],
    after: [pt('茶'), pt('。')],
    options: [['喝','hē',true], ['吃','chī',false], ['看','kàn',false], ['爱','ài',false]],
  },
  {
    before: [pt('哥哥','gēge'), pt('喜欢','xǐhuān'), pt('吃','chī')],
    answer: ['面条', 'miàntiáo'],
    after: [pt('。')],
    options: [['面条','miàntiáo',true], ['妈妈','māma',false], ['爸爸','bàba',false], ['猫','māo',false]],
  },
  {
    before: [pt('我'), pt('有'), pt('一个')],
    answer: ['哥哥', 'gēge'],
    after: [pt('。')],
    options: [['哥哥','gēge',true], ['爸爸','bàba',false], ['妈妈','māma',false], ['猫','māo',false]],
  },
];

// ─────────────────────────────────────────────
// HSK 2 — 周末去公园 (Weekend at the Park)
// ─────────────────────────────────────────────
const HSK2_FREE: Record<string, string> = {
  '每个': 'every · each', '我': 'I · me', '在': 'at · in · on',
  '那里': 'there · that place', '也': 'also · too', '常常': 'often · frequently',
  '我们': 'we · us', '感觉': 'feeling · to feel', '有时候': 'sometimes',
  '下午': 'afternoon', '孩子们': 'children', '上': 'on',
  '很': 'very', '好': 'good · nice', '的': '(modifier particle)',
  '是': 'to be', '个': '(measure word for people/things)', '地方': 'place · location',
  '一个': 'one (measure word)', '去': 'to go', '很多': 'many · a lot of',
  '和': 'and · with', '早上': 'morning', '人': 'person · people',
  '朋友': 'friend', '一起': 'together',
};

const HSK2_RAW: RawToken[] = [
  ['每个','měi gè'], ['周末', 'zhōumò', 'weekend'],
  ['，'], ['我','wǒ'], ['喜欢', 'xǐhuān', 'to like · to enjoy'],
  ['去','qù'], ['附近', 'fùjìn', 'nearby · in the vicinity'],
  ['的','de'], ['公园', 'gōngyuán', 'park'], ['。'],
  ['公园','gōngyuán'], ['里','lǐ'], ['有','yǒu'], ['很多','hěn duō'],
  ['树', 'shù', 'tree'],
  ['和','hé'], ['漂亮', 'piàoliang', 'beautiful · pretty'],
  ['的','de'], ['花', 'huā', 'flower'], ['。'],
  ['早上','zǎoshang'], ['，'],
  ['很多','hěn duō'], ['人','rén'], ['在','zài'], ['那里','nàlǐ'],
  ['跑步', 'pǎobù', 'to run · jogging'], ['。'],
  ['我','wǒ'], ['的','de'], ['朋友','péngyou'], ['小红'],
  ['也','yě'], ['常常','cháng cháng'], ['去','qù'], ['那里','nàlǐ'], ['。'],
  ['我们','wǒmen'], ['一起','yìqǐ'],
  ['聊天', 'liáotiān', 'to chat · to talk'],
  ['，'], ['感觉','gǎnjué'], ['很','hěn'],
  ['开心', 'kāixīn', 'happy · joyful'], ['。'],
  ['有时候','yǒu shíhou'], ['，'], ['我们','wǒmen'],
  ['带', 'dài', 'to bring · to carry'],
  ['水','shuǐ'], ['和','hé'],
  ['零食', 'língshí', 'snacks'], ['。'],
  ['下午','xiàwǔ'], ['，'],
  ['孩子们','háizimen'], ['在','zài'], ['草地', 'cǎodì', 'lawn · grassland'],
  ['上','shàng'],
  ['玩', 'wán', 'to play · to have fun'],
  ['游戏', 'yóuxì', 'game'], ['。'],
  ['我','wǒ'], ['觉得','juéde'], ['去','qù'], ['公园','gōngyuán'],
  ['是','shì'], ['一个','yī gè'], ['很','hěn'], ['好','hǎo'], ['的','de'],
  ['习惯', 'xíguàn', 'habit · custom'], ['。'],
  // Extended sentences
  ['公园','gōngyuán'], ['里','lǐ'], ['还','hái'], ['有','yǒu'], ['一个','yī gè'], ['小','xiǎo'],
  ['湖', 'hú', 'lake'], ['，'],
  ['有','yǒu'], ['人','rén'], ['在','zài'], ['那里','nàlǐ'],
  ['钓鱼', 'diào yú', 'to fish · to go fishing'], ['。'],
  ['一些','yīxiē'],
  ['老人', 'lǎorén', 'elderly person · old person'],
  ['在','zài'], ['草地','cǎodì'], ['上','shàng'],
  ['打太极拳', 'dǎ tàijíquán', 'to practice tai chi'], ['。'],
  ['公园','gōngyuán'], ['外面','wàimiàn'], ['有','yǒu'],
  ['卖','mài'],
  ['水果', 'shuǐguǒ', 'fruit'],
  ['和','hé'],
  ['小吃', 'xiǎochī', 'snack · street food'],
  ['的','de'],
  ['摊位', 'tānwèi', 'stall · stand · booth'], ['，'],
  ['我们','wǒmen'], ['常常','cháng cháng'], ['在','zài'], ['那里','nàlǐ'], ['买','mǎi'], ['东西','dōngxi'], ['吃','chī'], ['。'],
  ['每次','měi cì'], ['回家','huíjiā'], ['，'],
  ['我','wǒ'], ['都','dōu'], ['感觉','gǎnjué'], ['很','hěn'],
  ['满足', 'mǎnzú', 'satisfied · content · fulfilled'], ['。'],
];

const HSK2_QUESTIONS: Question[] = [
  {
    q: [pt('作者','zuòzhě'), pt('每个','měi gè'), pt('周末','zhōumò'), pt('喜欢','xǐhuān'), pt('做','zuò'), pt('什么','shénme'), pt('？')],
    model: '每个周末喜欢去附近的公园。',
    key: ['公园', '附近', '周末'],
    options: [
      { tokens: [pt('在','zài'), pt('家','jiā'), pt('休息','xiūxi')], correct: false },
      { tokens: [pt('去','qù'), pt('附近','fùjìn'), pt('的','de'), pt('公园','gōngyuán')], correct: true },
      { tokens: [pt('去','qù'), pt('图书馆','túshūguǎn')], correct: false },
    ],
  },
  {
    q: [pt('早上','zǎoshang'), pt('公园','gōngyuán'), pt('里','lǐ'), pt('的','de'), pt('人','rén'), pt('在','zài'), pt('做','zuò'), pt('什么','shénme'), pt('？')],
    model: '很多人在那里跑步。',
    key: ['跑步'],
    options: [
      { tokens: [pt('唱歌','chànggē')], correct: false },
      { tokens: [pt('跑步','pǎobù')], correct: true },
      { tokens: [pt('睡觉','shuìjiào')], correct: false },
    ],
  },
  {
    q: [pt('作者','zuòzhě'), pt('和','hé'), pt('朋友','péngyou'), pt('一起','yìqǐ'), pt('做','zuò'), pt('什么','shénme'), pt('？')],
    model: '一起聊天，感觉很开心。',
    key: ['聊天', '开心'],
    options: [
      { tokens: [pt('一起','yìqǐ'), pt('跑步','pǎobù')], correct: false },
      { tokens: [pt('一起','yìqǐ'), pt('聊天','liáotiān')], correct: true },
      { tokens: [pt('一起','yìqǐ'), pt('吃饭','chīfàn')], correct: false },
    ],
  },
  {
    q: [pt('下午','xiàwǔ'), pt('孩子们','háizimen'), pt('在','zài'), pt('哪里','nǎlǐ'), pt('玩','wán'), pt('？')],
    model: '孩子们在草地上玩游戏。',
    key: ['草地', '游戏'],
    options: [
      { tokens: [pt('树','shù'), pt('上','shàng')], correct: false },
      { tokens: [pt('草地','cǎodì'), pt('上','shàng')], correct: true },
      { tokens: [pt('水','shuǐ'), pt('里','lǐ')], correct: false },
    ],
  },
  {
    q: [pt('作者','zuòzhě'), pt('觉得','juéde'), pt('去','qù'), pt('公园','gōngyuán'), pt('是','shì'), pt('什么','shénme'), pt('？')],
    model: '觉得去公园是一个很好的习惯。',
    key: ['习惯'],
    options: [
      { tokens: [pt('很','hěn'), pt('麻烦','máfan')], correct: false },
      { tokens: [pt('很','hěn'), pt('好','hǎo'), pt('的','de'), pt('习惯','xíguàn')], correct: true },
      { tokens: [pt('很','hěn'), pt('无聊','wúliáo')], correct: false },
    ],
  },
];

const HSK2_FILL: FillItem[] = [
  {
    before: [pt('每个'), pt('周末','zhōumò'), pt('，'), pt('我'), pt('喜欢','xǐhuān'), pt('去')],
    answer: ['公园', 'gōngyuán'],
    after: [pt('。')],
    options: [['公园','gōngyuán',true], ['学校','xuéxiào',false], ['超市','chāoshì',false], ['医院','yīyuàn',false]],
  },
  {
    before: [pt('我们'), pt('一起')],
    answer: ['聊天', 'liáotiān'],
    after: [pt('，'), pt('感觉'), pt('很'), pt('开心','kāixīn'), pt('。')],
    options: [['聊天','liáotiān',true], ['跑步','pǎobù',false], ['吃饭','chīfàn',false], ['睡觉','shuìjiào',false]],
  },
  {
    before: [pt('有时候'), pt('我们'),  pt('带','dài')],
    answer: ['零食', 'língshí'],
    after: [pt('去'), pt('公园','gōngyuán'), pt('。')],
    options: [['零食','língshí',true], ['习惯','xíguàn',false], ['花','huā',false], ['游戏','yóuxì',false]],
  },
  {
    before: [pt('早上'), pt('很多'), pt('人'), pt('在'), pt('公园','gōngyuán'), pt('里')],
    answer: ['跑步', 'pǎobù'],
    after: [pt('。')],
    options: [['跑步','pǎobù',true], ['开心','kāixīn',false], ['附近','fùjìn',false], ['带','dài',false]],
  },
];

// ─────────────────────────────────────────────
// HSK 3 — 学中文 (Learning Chinese)
// ─────────────────────────────────────────────
const HSK3_FREE: Record<string, string> = {
  '我': 'I · me', '从': 'from · since', '去年': 'last year',
  '有时候': 'sometimes', '因为': 'because', '很': 'very',
  '但是': 'but · however', '每天': 'every day', '最': 'most',
  '可以': 'can · may', '更好地': 'better', '自己': 'oneself · self',
  '放学后': 'after school', '常常': 'often', '来': 'to come · in order to',
  '也': 'also', '的': '(modifier particle)',
  '是': 'to be', '新': 'new', '一口': 'one mouth · fluently',
  '有一天': 'one day · someday', '能': 'can · be able to', '说': 'to speak',
};

const HSK3_RAW: RawToken[] = [
  ['我','wǒ'], ['从','cóng'], ['去年','qùnián'],
  ['开始', 'kāishǐ', 'to start · to begin'],
  ['学习', 'xuéxí', 'to study · to learn'],
  ['中文', 'zhōngwén', 'Chinese (language)'], ['。'],
  ['学中文','xué zhōngwén'], ['有时候','yǒu shíhou'], ['很','hěn'],
  ['难', 'nán', 'difficult · hard'],
  ['，'], ['因为','yīnwèi'],
  ['汉字', 'hànzì', 'Chinese character'],
  ['很','hěn'], ['多','duō'], ['。'],
  ['但是','dànshì'], ['，'], ['我','wǒ'], ['每天','měitiān'],
  ['练习', 'liànxí', 'to practice'],
  ['写','xiě'], ['汉字','hànzì'],
  ['和','hé'], ['听','tīng'],
  ['录音', 'lùyīn', 'audio recording'], ['。'],
  ['我','wǒ'], ['的','de'],
  ['老师', 'lǎoshī', 'teacher'],
  ['说','shuō'], ['，'],
  ['坚持', 'jiānchí', 'to persist · to keep going'],
  ['是','shì'], ['最','zuì'],
  ['重要', 'zhòngyào', 'important'],
  ['的','de'], ['。'],
  ['上课','shàngkè'], ['的','de'], ['时候','shíhou'], ['，'],
  ['同学', 'tóngxué', 'classmate'],
  ['们','men'], ['一起','yìqǐ'], ['读','dú'],
  ['课文', 'kèwén', 'text · lesson passage'],
  ['，'], ['互相','hùxiāng'],
  ['帮助', 'bāngzhù', 'to help · to assist'],
  ['。'],
  ['我','wǒ'], ['最','zuì'],
  ['喜欢','xǐhuān'],
  ['学','xué'], ['新','xīn'],
  ['词语', 'cíyǔ', 'vocabulary · word'],
  ['，'],
  ['因为','yīnwèi'], ['可以','kěyǐ'], ['更好地','gèng hǎo de'],
  ['表达', 'biǎodá', 'to express'],
  ['自己','zìjǐ'], ['。'],
  ['放学后','fàngxué hòu'], ['，'], ['我','wǒ'], ['常常','cháng cháng'],
  ['看','kàn'], ['中文','zhōngwén'], ['视频','shìpín'], ['来','lái'],
  ['练习','liànxí'], ['听力', 'tīnglì', 'listening comprehension'], ['。'],
  ['我','wǒ'], ['希望', 'xīwàng', 'to hope · to wish'],
  ['有一天','yǒu yī tiān'], ['能','néng'], ['说','shuō'], ['一口','yī kǒu'],
  ['流利', 'liúlì', 'fluent · fluency'],
  ['的','de'], ['中文','zhōngwén'], ['。'],
  // Extended sentences
  ['我','wǒ'], ['还','hái'],
  ['尝试', 'chángshì', 'to try · to attempt'],
  ['用','yòng'], ['中文','zhōngwén'],
  ['写','xiě'],
  ['日记', 'rìjì', 'diary · journal'], ['，'],
  ['这样','zhèyàng'], ['可以','kěyǐ'],
  ['提高', 'tígāo', 'to improve · to raise'],
  ['写作', 'xiězuò', 'writing · written work'],
  ['能力','nénglì'], ['。'],
  ['学校','xuéxiào'], ['里','lǐ'], ['有','yǒu'], ['一个','yī gè'],
  ['中文','zhōngwén'],
  ['角', 'jiǎo', 'corner · nook'],
  ['，'],
  ['同学们','tóngxuémen'], ['每周','měi zhōu'], ['在','zài'], ['那里','nàlǐ'],
  ['讨论', 'tǎolùn', 'to discuss · discussion'],
  ['中国','Zhōngguó'],
  ['文化', 'wénhuà', 'culture · civilization'],
  ['和','hé'],
  ['习俗', 'xísú', 'customs · tradition'], ['。'],
  ['通过','tōngguò'], ['不断','bùduàn'],
  ['练习','liànxí'], ['，'],
  ['我','wǒ'], ['的','de'], ['中文','zhōngwén'],
  ['水平', 'shuǐpíng', 'level · standard · proficiency'],
  ['慢慢地','mànmànde'],
  ['进步', 'jìnbù', 'to improve · progress'],
  ['了','le'], ['。'],
];

const HSK3_QUESTIONS: Question[] = [
  {
    q: [pt('作者','zuòzhě'), pt('从','cóng'), pt('什么','shénme'), pt('时候','shíhou'), pt('开始','kāishǐ'), pt('学','xué'), pt('中文','zhōngwén'), pt('？')],
    model: '从去年开始学习中文。',
    key: ['去年', '开始'],
    options: [
      { tokens: [pt('今年','jīnnián')], correct: false },
      { tokens: [pt('去年','qùnián')], correct: true },
      { tokens: [pt('小时候','xiǎoshíhou')], correct: false },
    ],
  },
  {
    q: [pt('为什么','wèishénme'), pt('学','xué'), pt('中文','zhōngwén'), pt('有时候','yǒushíhou'), pt('很','hěn'), pt('难','nán'), pt('？')],
    model: '因为汉字很多。',
    key: ['汉字'],
    options: [
      { tokens: [pt('因为','yīnwèi'), pt('老师','lǎoshī'), pt('很','hěn'), pt('严格','yángé')], correct: false },
      { tokens: [pt('因为','yīnwèi'), pt('汉字','hànzì'), pt('很','hěn'), pt('多','duō')], correct: true },
      { tokens: [pt('因为','yīnwèi'), pt('没有','méiyǒu'), pt('朋友','péngyou')], correct: false },
    ],
  },
  {
    q: [pt('老师','lǎoshī'), pt('说','shuō'), pt('学中文','xué zhōngwén'), pt('最','zuì'), pt('重要','zhòngyào'), pt('的','de'), pt('是','shì'), pt('什么','shénme'), pt('？')],
    model: '老师说坚持是最重要的。',
    key: ['坚持'],
    options: [
      { tokens: [pt('记','jì'), pt('很多','hěn duō'), pt('单词','dāncí')], correct: false },
      { tokens: [pt('坚持','jiānchí')], correct: true },
      { tokens: [pt('每天','měitiān'), pt('背','bèi'), pt('课文','kèwén')], correct: false },
    ],
  },
  {
    q: [pt('放学后','fàngxué hòu'), pt('作者','zuòzhě'), pt('怎么','zěnme'), pt('练习','liànxí'), pt('听力','tīnglì'), pt('？')],
    model: '放学后常常看中文视频来练习听力。',
    key: ['视频', '听力'],
    options: [
      { tokens: [pt('听','tīng'), pt('广播','guǎngbō')], correct: false },
      { tokens: [pt('看','kàn'), pt('中文','zhōngwén'), pt('视频','shìpín')], correct: true },
      { tokens: [pt('跟','gēn'), pt('老师','lǎoshī'), pt('练习','liànxí')], correct: false },
    ],
  },
  {
    q: [pt('作者','zuòzhě'), pt('希望','xīwàng'), pt('有一天','yǒu yī tiān'), pt('能','néng'), pt('做','zuò'), pt('什么','shénme'), pt('？')],
    model: '希望有一天能说一口流利的中文。',
    key: ['流利', '中文'],
    options: [
      { tokens: [pt('当','dāng'), pt('老师','lǎoshī')], correct: false },
      { tokens: [pt('说','shuō'), pt('一口','yīkǒu'), pt('流利','liúlì'), pt('的','de'), pt('中文','zhōngwén')], correct: true },
      { tokens: [pt('去','qù'), pt('中国','Zhōngguó'), pt('旅游','lǚyóu')], correct: false },
    ],
  },
];

const HSK3_FILL: FillItem[] = [
  {
    before: [pt('我'), pt('每天'), pt('都')],
    answer: ['练习', 'liànxí'],
    after: [pt('写'), pt('汉字','hànzì'), pt('。')],
    options: [['练习','liànxí',true], ['帮助','bāngzhù',false], ['表达','biǎodá',false], ['希望','xīwàng',false]],
  },
  {
    before: [pt('老师','lǎoshī'), pt('说'), pt('，')],
    answer: ['坚持', 'jiānchí'],
    after: [pt('是'), pt('最'), pt('重要','zhòngyào'), pt('的'), pt('。')],
    options: [['坚持','jiānchí',true], ['流利','liúlì',false], ['难','nán',false], ['词语','cíyǔ',false]],
  },
  {
    before: [pt('我'), pt('最'), pt('喜欢'), pt('学'), pt('新')],
    answer: ['词语', 'cíyǔ'],
    after: [pt('。')],
    options: [['词语','cíyǔ',true], ['汉字','hànzì',false], ['课文','kèwén',false], ['录音','lùyīn',false]],
  },
  {
    before: [pt('我'), pt('希望','xīwàng'), pt('能'), pt('说'), pt('一口')],
    answer: ['流利', 'liúlì'],
    after: [pt('的'), pt('中文','zhōngwén'), pt('。')],
    options: [['流利','liúlì',true], ['坚持','jiānchí',false], ['难','nán',false], ['表达','biǎodá',false]],
  },
];

// ─────────────────────────────────────────────
// HSK 4 — 城市里的环境 (Environment in the City)
// This is the original passage, imported from passage.ts content
// ─────────────────────────────────────────────
const HSK4_FREE: Record<string, string> = {
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
  '最近': 'recently · lately', '开始': 'to start · to begin',
  '新': 'new · fresh', '要': 'to want · to need',
  '分成': 'to divide into', '可': 'can · may', '和': 'and · with',
  '其他': 'other · the rest', '几': 'several · a few', '类': 'category · type',
  '觉得': 'to feel · to think', '但': 'but · however',
  '慢慢地': 'gradually · slowly', '明白': 'to understand · to realize',
  '了': '(completion particle)', '只要': 'as long as · provided that',
  '大家': 'everyone · all of us', '一定': 'definitely · certainly',
  '变得': 'to become', '更加': 'even more · further',
};

const HSK4_RAW: RawToken[] = [
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
  // Extended sentences
  ['以前','yǐqián'],['，'],
  ['城市','chéngshì'],['里','lǐ'],['垃圾','lājī'],
  ['随处可见','suí chù kě jiàn','can be seen everywhere'],['，'],
  ['空气', 'kōngqì', 'air · atmosphere'],
  ['质量', 'zhìliàng', 'quality · standard'],
  ['也','yě'],['不太','bú tài'],['好','hǎo'],['。'],
  ['现在','xiànzài'],['，'],
  ['我','wǒ'],['每天','měitiān'],['认真','rènzhēn'],['地','de'],
  ['把','bǎ'],['垃圾','lājī'],['分类','fēnlèi'],['，'],
  ['邻居', 'línjū', 'neighbor'],
  ['们','men'],['也','yě'],['开始','kāishǐ'],
  ['养成','yǎngchéng'],['这个','zhège'],['好','hǎo'],['习惯','xíguàn'],['了','le'],['。'],
  ['我','wǒ'],['相信','xiāngxìn'],
  ['将来', 'jiānglái', 'future · in the future'],
  ['的','de'],['城市','chéngshì'],
  ['一定','yīdìng'],['会','huì'],['更加','gèngjiā'],
  ['美好', 'měihǎo', 'beautiful · wonderful'],['。'],
];

const HSK4_QUESTIONS: Question[] = [
  {
    q: [pt('为了','wèile'),pt('保护','bǎohù'),pt('环境','huánjìng'),pt('，'),pt('我们','wǒmen'),pt('应该','yīnggāi'),pt('怎么','zěnme'),pt('做','zuò'),pt('？')],
    model: '减少浪费、把垃圾分类、回收可以再用的东西。',
    key: ['减少','分类','回收','浪费'],
    options: [
      { tokens: [pt('买','mǎi'),pt('更多','gèng duō'),pt('的','de'),pt('东西','dōngxi')], correct: false },
      { tokens: [pt('减少','jiǎnshǎo'),pt('浪费','làngfèi'),pt('，'),pt('把','bǎ'),pt('垃圾','lājī'),pt('分类','fēnlèi')], correct: true },
      { tokens: [pt('把','bǎ'),pt('垃圾','lājī'),pt('扔','rēng'),pt('在','zài'),pt('城市','chéngshì'),pt('里','lǐ')], correct: false },
    ],
  },
  {
    q: [pt('什么样','shénme yàng'),pt('的','de'),pt('东西','dōngxi'),pt('不要','búyào'),pt('扔掉','rēngdiào'),pt('？')],
    model: '可以回收、能再用的东西，不要扔掉。',
    key: ['回收','再用','能'],
    options: [
      { tokens: [pt('能','néng'),pt('回收','huíshōu'),pt('的','de'),pt('东西','dōngxi')], correct: true },
      { tokens: [pt('所有','suǒyǒu'),pt('的','de'),pt('东西','dōngxi')], correct: false },
      { tokens: [pt('很','hěn'),pt('大','dà'),pt('的','de'),pt('东西','dōngxi')], correct: false },
    ],
  },
  {
    q: [pt('如果','rúguǒ'),pt('每个','měi gè'),pt('人','rén'),pt('都','dōu'),pt('养成','yǎngchéng'),pt('好','hǎo'),pt('习惯','xíguàn'),pt('，'),pt('城市','chéngshì'),pt('会','huì'),pt('怎么样','zěnme yàng'),pt('？')],
    model: '城市会越来越干净。',
    key: ['城市','干净','越来越'],
    options: [
      { tokens: [pt('越来越','yuèláiyuè'),pt('大','dà')], correct: false },
      { tokens: [pt('越来越','yuèláiyuè'),pt('多','duō'),pt('人','rén')], correct: false },
      { tokens: [pt('越来越','yuèláiyuè'),pt('干净','gānjìng')], correct: true },
    ],
  },
  {
    q: [pt('作者','zuòzhě'),pt('住','zhù'),pt('在','zài'),pt('什么','shénme'),pt('地方','dìfang'),pt('？')],
    model: '作者住在一个很大的城市。',
    key: ['城市','大','住'],
    options: [
      { tokens: [pt('乡下','xiāngxia')], correct: false },
      { tokens: [pt('一个','yí gè'),pt('小','xiǎo'),pt('村子','cūnzi')], correct: false },
      { tokens: [pt('一个','yí gè'),pt('很','hěn'),pt('大','dà'),pt('的','de'),pt('城市','chéngshì')], correct: true },
    ],
  },
  {
    q: [pt('为什么','wèi shénme'),pt('我们','wǒmen'),pt('要','yào'),pt('把','bǎ'),pt('垃圾','lājī'),pt('分类','fēnlèi'),pt('？')],
    model: '因为分类可以保护环境，减少浪费，也让城市更干净。',
    key: ['保护','环境','减少','干净'],
    options: [
      { tokens: [pt('因为','yīnwèi'),pt('好玩','hǎowán')], correct: false },
      { tokens: [pt('为了','wèile'),pt('保护','bǎohù'),pt('环境','huánjìng'),pt('和','hé'),pt('减少','jiǎnshǎo'),pt('浪费','làngfèi')], correct: true },
      { tokens: [pt('因为','yīnwèi'),pt('城市','chéngshì'),pt('很','hěn'),pt('大','dà')], correct: false },
    ],
  },
];

const HSK4_FILL: FillItem[] = [
  {
    before: [pt('请','qǐng'), pt('把','bǎ')],
    answer: ['垃圾', 'lājī'],
    after: [pt('放进','fàngjìn'), pt('桶','tǒng'), pt('里','lǐ'), pt('。')],
    options: [['垃圾','lājī',true], ['城市','chéngshì',false], ['习惯','xíguàn',false], ['保护','bǎohù',false]],
  },
  {
    before: [pt('我们','wǒmen'), pt('要','yào')],
    answer: ['保护', 'bǎohù'],
    after: [pt('环境','huánjìng'), pt('。')],
    options: [['保护','bǎohù',true], ['分类','fēnlèi',false], ['减少','jiǎnshǎo',false], ['回收','huíshōu',false]],
  },
  {
    before: [pt('可以','kěyǐ')],
    answer: ['回收', 'huíshōu'],
    after: [pt('的','de'), pt('东西','dōngxi'), pt('，'), pt('不要','búyào'), pt('扔掉','rēngdiào'), pt('。')],
    options: [['城市','chéngshì',false], ['回收','huíshōu',true], ['浪费','làngfèi',false], ['习惯','xíguàn',false]],
  },
  {
    before: [pt('每天','měitiān'), pt('运动','yùndòng'), pt('是','shì'), pt('一个','yí gè'), pt('好','hǎo')],
    answer: ['习惯', 'xíguàn'],
    after: [pt('。')],
    options: [['环境','huánjìng',false], ['习惯','xíguàn',true], ['回收','huíshōu',false], ['分类','fēnlèi',false]],
  },
];

// ─────────────────────────────────────────────
// HSK 5 — 网络与生活 (The Internet and Life)
// ─────────────────────────────────────────────
const HSK5_FREE: Record<string, string> = {
  '如今': 'nowadays · these days', '人们': 'people · the public',
  '可以': 'can · may', '通过': 'through · via · by means of',
  '网络': 'the internet · network', '之间': 'between · among',
  '然而': 'however · yet', '也': 'also · too',
  '很多': 'many · a lot of', '长时间': 'for a long time',
  '因此': 'therefore · thus', '在': 'at · in · on',
  '同时': 'at the same time', '我们': 'we · us',
  '更加': 'even more', '自己': 'oneself',
  '的': '(modifier particle)', '这': 'this',
  '一些': 'some · a few',
};

const HSK5_RAW: RawToken[] = [
  ['互联网', 'hùliánwǎng', 'the internet'],
  ['的','de'],
  ['发展', 'fāzhǎn', 'development; to develop'],
  ['彻底', 'chèdǐ', 'thorough; completely'],
  ['改变', 'gǎibiàn', 'to change; to transform'],
  ['了','le'],
  ['我们','wǒmen'],
  ['的','de'],
  ['生活', 'shēnghuó', 'life; to live'],
  ['方式', 'fāngshì', 'way; manner; mode'],
  ['。'],
  ['如今','rújīn'],['，'],
  ['人们','rénmen'], ['可以','kěyǐ'], ['通过','tōngguò'], ['网络','wǎngluò'],
  ['购物', 'gòuwù', 'to shop; shopping'],
  ['、'],
  ['学习','xuéxí'], ['和','hé'],
  ['娱乐', 'yúlè', 'entertainment; amusement'],
  ['。'],
  ['社交媒体', 'shèjiāo méitǐ', 'social media'],
  ['让','ràng'],
  ['朋友','péngyou'],
  ['和','hé'], ['家人','jiārén'],
  ['之间','zhījiān'], ['的','de'],
  ['联系', 'liánxì', 'connection; to contact'],
  ['更加','gèngjiā'],
  ['紧密', 'jǐnmì', 'close; tight; intimate'],
  ['。'],
  ['然而','rán\'ér'], ['，'],
  ['过度', 'guòdù', 'excessive; too much'],
  ['使用','shǐyòng'],
  ['手机', 'shǒujī', 'mobile phone; smartphone'],
  ['也','yě'], ['带来','dài lái'], ['了','le'], ['一些','yīxiē'],
  ['问题', 'wèntí', 'problem; question'],
  ['。'],
  ['很多','hěn duō'], ['年轻人','niánqīng rén'], ['长时间','cháng shíjiān'],
  ['盯着', 'dīngzhe', 'staring at; gazing at'],
  ['屏幕', 'píngmù', 'screen'],
  ['，'],
  ['影响', 'yǐngxiǎng', 'to affect; influence'],
  ['了','le'],
  ['睡眠', 'shuìmián', 'sleep'],
  ['和','hé'],
  ['健康', 'jiànkāng', 'health; healthy'],
  ['。'],
  ['网络','wǎngluò'], ['上','shàng'], ['的','de'],
  ['信息', 'xìnxī', 'information; news'],
  ['量','liàng'], ['巨大','jùdà'], ['，'],
  ['但','dàn'], ['并非','bìngfēi'],
  ['所有','suǒyǒu'], ['内容','nèiróng'], ['都是','dōu shì'],
  ['真实', 'zhēnshí', 'true; real; authentic'],
  ['可靠', 'kěkào', 'reliable; dependable'],
  ['的','de'], ['。'],
  ['因此','yīncǐ'], ['，'],
  ['培养', 'péiyǎng', 'to cultivate; to develop'],
  ['辨别', 'biànbié', 'to distinguish; to differentiate'],
  ['信息','xìnxī'],
  ['真伪', 'zhēnwěi', 'authenticity; true or false'],
  ['的','de'], ['能力','nénglì'],
  ['非常','fēicháng'], ['重要','zhòngyào'], ['。'],
  ['在','zài'],
  ['享受', 'xiǎngshòu', 'to enjoy'],
  ['技术', 'jìshù', 'technology; technique'],
  ['便利', 'biànlì', 'convenient; convenience'],
  ['的','de'], ['同时','tóngshí'], ['，'],
  ['我们','wǒmen'], ['也','yě'], ['要','yào'],
  ['学会','xuéhuì'], ['合理','hélǐ'], ['使用','shǐyòng'], ['网络','wǎngluò'], ['。'],
  // Extended sentences
  ['互联网','hùliánwǎng'], ['还','hái'],
  ['推动', 'tuīdòng', 'to drive forward · to promote'],
  ['了','le'],
  ['在线', 'zàixiàn', 'online · on the internet'],
  ['教育', 'jiàoyù', 'education'],
  ['的','de'],
  ['迅速', 'xùnsù', 'rapid · swift · speedy'],
  ['发展','fāzhǎn'], ['。'],
  ['人们','rénmen'], ['可以','kěyǐ'], ['足不出户', 'zú bù chū hù', 'without leaving home'],
  ['地','de'],
  ['学习','xuéxí'],
  ['优质', 'yōuzhì', 'high-quality · excellent'],
  ['大学','dàxué'], ['的','de'],
  ['课程', 'kèchéng', 'course · curriculum'], ['。'],
  ['远程', 'yuǎnchéng', 'remote · long-distance'],
  ['办公', 'bàngōng', 'office work · to work in an office'],
  ['模式','móshì'],
  ['也','yě'], ['越来越','yuèláiyuè'],
  ['普遍', 'pǔbiàn', 'widespread · common · universal'], ['，'],
  ['打破', 'dǎpò', 'to break · to break through'],
  ['了','le'],
  ['地理','dìlǐ'], ['位置','wèizhi'], ['的','de'],
  ['限制', 'xiànzhì', 'limitation · restriction'], ['。'],
  ['培养','péiyǎng'],
  ['良好','liánghǎo'],
  ['的','de'],
  ['数字','shùzì'],
  ['素养', 'sùyǎng', 'literacy · cultivation · digital competency'],
  ['，'],
  ['已经','yǐjīng'],
  ['成为','chéngwéi'],
  ['现代','xiàndài'],['人','rén'],
  ['必不可少', 'bì bù kě shǎo', 'indispensable · essential'],
  ['的','de'],
  ['核心','héxīn'],
  ['能力','nénglì'], ['。'],
];

const HSK5_QUESTIONS: Question[] = [
  {
    q: [pt('互联网','hùliánwǎng'), pt('的','de'), pt('发展','fāzhǎn'), pt('怎么','zěnme'), pt('改变','gǎibiàn'), pt('了','le'), pt('我们','wǒmen'), pt('的','de'), pt('生活','shēnghuó'), pt('？')],
    model: '彻底改变了我们的生活方式。',
    key: ['改变', '生活', '方式'],
    options: [
      { tokens: [pt('让','ràng'), pt('生活','shēnghuó'), pt('变得','biàndé'), pt('更加','gèngjiā'), pt('复杂','fùzá')], correct: false },
      { tokens: [pt('彻底','chèdǐ'), pt('改变','gǎibiàn'), pt('了','le'), pt('生活','shēnghuó'), pt('方式','fāngshì')], correct: true },
      { tokens: [pt('没有','méiyǒu'), pt('太大','tài dà'), pt('影响','yǐngxiǎng')], correct: false },
    ],
  },
  {
    q: [pt('过度','guòdù'), pt('使用','shǐyòng'), pt('手机','shǒujī'), pt('会','huì'), pt('有','yǒu'), pt('什么','shénme'), pt('问题','wèntí'), pt('？')],
    model: '影响了睡眠和健康。',
    key: ['睡眠', '健康', '影响'],
    options: [
      { tokens: [pt('影响','yǐngxiǎng'), pt('睡眠','shuìmián'), pt('和','hé'), pt('健康','jiànkāng')], correct: true },
      { tokens: [pt('让','ràng'), pt('人','rén'), pt('更','gèng'), pt('聪明','cōngmíng')], correct: false },
      { tokens: [pt('减少','jiǎnshǎo'), pt('朋友','péngyou'), pt('的','de'), pt('数量','shùliàng')], correct: false },
    ],
  },
  {
    q: [pt('网络','wǎngluò'), pt('上','shàng'), pt('的','de'), pt('信息','xìnxī'), pt('是否','shìfǒu'), pt('都','dōu'), pt('可靠','kěkào'), pt('？')],
    model: '不是，不是所有内容都是真实可靠的。',
    key: ['真实', '可靠'],
    options: [
      { tokens: [pt('是','shì'), pt('的','de'), pt('，'), pt('全部','quánbù'), pt('可靠','kěkào')], correct: false },
      { tokens: [pt('不','bù'), pt('一定','yīdìng'), pt('，'), pt('并非','bìngfēi'), pt('都','dōu'), pt('真实','zhēnshí'), pt('可靠','kěkào')], correct: true },
      { tokens: [pt('很难','hěn nán'), pt('判断','pànduàn')], correct: false },
    ],
  },
  {
    q: [pt('培养','péiyǎng'), pt('什么','shénme'), pt('能力','nénglì'), pt('很','hěn'), pt('重要','zhòngyào'), pt('？')],
    model: '培养辨别信息真伪的能力很重要。',
    key: ['辨别', '信息', '真伪'],
    options: [
      { tokens: [pt('快速','kuàisù'), pt('浏览','liúlǎn'), pt('信息','xìnxī')], correct: false },
      { tokens: [pt('辨别','biànbié'), pt('信息','xìnxī'), pt('真伪','zhēnwěi')], correct: true },
      { tokens: [pt('掌握','zhǎngwò'), pt('编程','biānchéng'), pt('技术','jìshù')], correct: false },
    ],
  },
  {
    q: [pt('享受','xiǎngshòu'), pt('技术','jìshù'), pt('便利','biànlì'), pt('的','de'), pt('同时','tóngshí'), pt('，'), pt('我们','wǒmen'), pt('还','hái'), pt('应该','yīnggāi'), pt('怎样','zěnyàng'), pt('？')],
    model: '学会合理使用网络。',
    key: ['合理', '网络'],
    options: [
      { tokens: [pt('完全','wánquán'), pt('放弃','fàngqì'), pt('手机','shǒujī')], correct: false },
      { tokens: [pt('学会','xuéhuì'), pt('合理','hélǐ'), pt('使用','shǐyòng'), pt('网络','wǎngluò')], correct: true },
      { tokens: [pt('购买','gòumǎi'), pt('更多','gèng duō'), pt('设备','shèbèi')], correct: false },
    ],
  },
];

const HSK5_FILL: FillItem[] = [
  {
    before: [pt('互联网','hùliánwǎng'), pt('的')],
    answer: ['发展', 'fāzhǎn'],
    after: [pt('改变','gǎibiàn'), pt('了'), pt('我们'), pt('的'), pt('生活','shēnghuó'), pt('方式','fāngshì'), pt('。')],
    options: [['发展','fāzhǎn',true], ['影响','yǐngxiǎng',false], ['使用','shǐyòng',false], ['培养','péiyǎng',false]],
  },
  {
    before: [pt('过度','guòdù'), pt('使用'), pt('手机','shǒujī'), pt('会'),  pt('影响','yǐngxiǎng')],
    answer: ['睡眠', 'shuìmián'],
    after: [pt('和'), pt('健康','jiànkāng'), pt('。')],
    options: [['睡眠','shuìmián',true], ['信息','xìnxī',false], ['便利','biànlì',false], ['真实','zhēnshí',false]],
  },
  {
    before: [pt('我们'), pt('要'),  pt('培养','péiyǎng')],
    answer: ['辨别', 'biànbié'],
    after: [pt('信息','xìnxī'), pt('真伪','zhēnwěi'), pt('的'), pt('能力'), pt('。')],
    options: [['辨别','biànbié',true], ['可靠','kěkào',false], ['购物','gòuwù',false], ['紧密','jǐnmì',false]],
  },
  {
    before: [pt('要'), pt('学会'), pt('合理'), pt('使用')],
    answer: ['网络', 'wǎngluò'],
    after: [pt('。')],
    options: [['网络','wǎngluò',true], ['手机','shǒujī',false], ['信息','xìnxī',false], ['技术','jìshù',false]],
  },
];

// ─────────────────────────────────────────────
// HSK 6 — 传统文化的传承 (Inheritance of Traditional Culture)
// ─────────────────────────────────────────────
const HSK6_FREE: Record<string, string> = {
  '在这一': 'in this', '如何': 'how · in what way',
  '成为': 'to become', '许多': 'many · a great number of',
  '从': 'from · since', '到': 'to · until', '无不': 'none of them fail to',
  '随着': 'along with · as', '部分': 'part · portion',
  '越来越多': 'more and more', '对此': 'regarding this · in response',
  '只有': 'only by · only if', '才能': 'can only then',
  '真正': 'truly · genuinely', '实现': 'to realize · to achieve',
  '的': '(modifier particle)', '与': 'and · with',
  '其': 'its · their',
};

const HSK6_RAW: RawToken[] = [
  ['随着','suízhe'],
  ['经济', 'jīngjì', 'economy; economic'],
  ['全球化', 'quánqiúhuà', 'globalization'],
  ['的','de'],
  ['深入', 'shēnrù', 'in-depth; to go deep into'],
  ['发展','fāzhǎn'],
  ['，'],
  ['各国','gè guó'], ['文化','wénhuà'], ['之间','zhījiān'], ['的','de'],
  ['交流', 'jiāoliú', 'exchange; communication'],
  ['与','yǔ'],
  ['碰撞', 'pèngzhuàng', 'collision; clash; to collide'],
  ['日益', 'rìyì', 'increasingly; day by day'],
  ['频繁', 'pínfán', 'frequent; frequent'],
  ['。'],
  ['在这一','zài zhè yī'], ['背景下','bèijǐng xià'], ['，'],
  ['如何','rúhé'],
  ['保护','bǎohù'], ['和','hé'],
  ['传承', 'chuánchéng', 'to inherit and pass on; inheritance'],
  ['本','běn'],
  ['民族', 'mínzú', 'ethnic group; nationality'],
  ['的','de'],
  ['传统', 'chuántǒng', 'traditional; tradition'],
  ['文化', 'wénhuà', 'culture; civilization'],
  ['，'],
  ['成为','chéngwéi'], ['了','le'], ['许多','xǔduō'], ['国家','guójiā'],
  ['面临', 'miànlín', 'to face; to confront'],
  ['的','de'],
  ['共同','gòngtóng'], ['挑战', 'tiǎozhàn', 'challenge; to challenge'],
  ['。'],
  ['中国','Zhōngguó'], ['拥有', 'yōngyǒu', 'to possess; to have'],
  ['五千年','wǔ qiān nián'], ['的','de'],
  ['文明', 'wénmíng', 'civilization; civilized'],
  ['历史','lìshǐ'],
  ['，'],
  ['积累', 'jīlěi', 'to accumulate; accumulation'],
  ['了','le'], ['极为','jíwéi'], ['丰富', 'fēngfù', 'rich; abundant; plentiful'],
  ['的','de'],
  ['文化','wénhuà'], ['遗产', 'yíchǎn', 'heritage; legacy'],
  ['。'],
  ['从','cóng'], ['传统','chuántǒng'], ['节日','jiérì'],
  ['到','dào'], ['民间', 'mínjiān', 'folk; among the people; popular'],
  ['艺术', 'yìshù', 'art; artistic'],
  ['，'],
  ['从','cóng'], ['古典','gǔdiǎn'], ['文学','wénxué'],
  ['到','dào'], ['传统','chuántǒng'], ['建筑','jiànzhù'],
  ['，'],
  ['无不','wúbù'],
  ['体现', 'tǐxiàn', 'to embody; to reflect; to show'],
  ['着','zhe'],
  ['中华','Zhōnghuá'], ['民族','mínzú'], ['的','de'],
  ['智慧', 'zhìhuì', 'wisdom; intelligence'],
  ['与','yǔ'], ['创造力', 'chuàngzàolì', 'creativity; creative power'],
  ['。'],
  ['然而','rán\'ér'], ['，'],
  ['随着','suízhe'], ['现代化','xiàndàihuà'], ['进程','jìnchéng'], ['的','de'], ['加快','jiākuài'], ['，'],
  ['部分','bùfen'], ['传统','chuántǒng'], ['技艺', 'jìyì', 'skill; artistry; craft'],
  ['面临','miànlín'],
  ['失传', 'shīchuán', 'to be lost (of skills or arts)'],
  ['的','de'], ['危机', 'wēijī', 'crisis; danger'],
  ['。'],
  ['越来越多','yuèláiyuè duō'], ['的','de'],
  ['年轻人','niánqīng rén'],
  ['背离', 'bèilí', 'to deviate from; to turn away from'],
  ['传统','chuántǒng'], ['，'],
  ['转而','zhuǎn\'ér'],
  ['追求', 'zhuīqiú', 'to pursue; to seek'],
  ['外来','wàilái'], ['的','de'],
  ['流行', 'liúxíng', 'popular; prevalent; fashionable'],
  ['文化','wénhuà'], ['。'],
  ['对此','duì cǐ'], ['，'],
  ['专家', 'zhuānjiā', 'expert; specialist'],
  ['指出','zhǐchū'], ['，'],
  ['传统','chuántǒng'], ['文化','wénhuà'], ['的','de'], ['传承','chuánchéng'],
  ['需要','xūyào'], ['创新', 'chuàngxīn', 'innovation; to innovate'],
  ['与','yǔ'], ['时代','shídài'],
  ['精神', 'jīngshén', 'spirit; morale'],
  ['相结合','xiāng jiéhé'], ['，'],
  ['使其','shǐ qí'],
  ['焕发', 'huànfā', 'to glow with; to radiate; to rejuvenate'],
  ['新','xīn'], ['的','de'],
  ['活力', 'huólì', 'vitality; energy'],
  ['。'],
  ['只有','zhǐyǒu'], ['让','ràng'], ['传统','chuántǒng'], ['文化','wénhuà'],
  ['在','zài'], ['现代化','xiàndàihuà'], ['生活','shēnghuó'], ['中','zhōng'],
  ['找到','zhǎodào'], ['自己','zìjǐ'], ['的','de'], ['位置','wèizhi'],
  ['，'],
  ['才能','cái néng'], ['真正','zhēnzhèng'],
  ['实现','shíxiàn'], ['文化','wénhuà'], ['的','de'],
  ['可持续', 'kě chíxù', 'sustainable'],
  ['发展','fāzhǎn'], ['。'],
  // Extended sentences
  ['京剧', 'jīngjù', 'Peking opera · Beijing opera'],
  ['、'],
  ['书法', 'shūfǎ', 'calligraphy · Chinese calligraphy'],
  ['、'],
  ['剪纸', 'jiǎnzhǐ', 'paper-cut art · paper cutting'],
  ['等','děng'], ['传统','chuántǒng'], ['技艺','jìyì'],
  ['正','zhèng'], ['面临','miànlín'],
  ['后继无人', 'hòu jì wú rén', 'no successors · lack of inheritors'],
  ['的','de'],
  ['困境', 'kùnjìng', 'difficult situation · predicament'], ['。'],
  ['近年来','jìn nián lái'], ['，'],
  ['政府','zhèngfǔ'], ['和','hé'],
  ['社会各界','shèhuì gè jiè'],
  ['积极','jījí'],
  ['推动','tuīdòng'],
  ['非物质', 'fēi wùzhì', 'intangible; non-material'],
  ['文化遗产','wénhuà yíchǎn'],
  ['的','de'], ['保护','bǎohù'], ['工作','gōngzuò'], ['。'],
  ['许多','xǔduō'], ['年轻人','niánqīng rén'],
  ['开始','kāishǐ'],
  ['重新','chóngxīn'],
  ['关注','guānzhù'],
  ['传统','chuántǒng'], ['文化','wénhuà'], ['，'],
  ['并','bìng'],
  ['尝试','chángshì'],
  ['将','jiāng'], ['其','qí'],
  ['融入', 'róngrù', 'to integrate · to blend into'],
  ['当代','dāngdài'], ['生活','shēnghuó'], ['与','yǔ'],
  ['创作', 'chuàngzuò', 'creation · creative work'],
  ['之中','zhīzhōng'], ['。'],
  ['事实上','shìshí shàng'], ['，'],
  ['传统','chuántǒng'], ['文化','wénhuà'], ['并非','bìngfēi'],
  ['一成不变', 'yī chéng bù biàn', 'unchanging · immutable · static'],
  ['，'], ['而是','érshì'], ['在','zài'],
  ['创新','chuàngxīn'], ['与','yǔ'],
  ['融合', 'rónghé', 'integration · fusion · to merge'],
  ['中','zhōng'],
  ['焕发','huànfā'], ['出','chū'], ['新','xīn'], ['的','de'],
  ['生命力', 'shēngmìnglì', 'vitality · life force · vigor'],
  ['。'],
];

const HSK6_QUESTIONS: Question[] = [
  {
    q: [pt('在全球化背景下','zài quánqiúhuà bèijǐng xià'), pt('，'), pt('许多','xǔduō'), pt('国家','guójiā'), pt('面临','miànlín'), pt('什么','shénme'), pt('挑战','tiǎozhàn'), pt('？')],
    model: '如何保护和传承本民族的传统文化。',
    key: ['传承', '传统', '文化'],
    options: [
      { tokens: [pt('如何','rúhé'), pt('发展','fāzhǎn'), pt('经济','jīngjì')], correct: false },
      { tokens: [pt('如何','rúhé'), pt('保护','bǎohù'), pt('和','hé'), pt('传承','chuánchéng'), pt('传统','chuántǒng'), pt('文化','wénhuà')], correct: true },
      { tokens: [pt('如何','rúhé'), pt('推广','tuīguǎng'), pt('外来','wàilái'), pt('文化','wénhuà')], correct: false },
    ],
  },
  {
    q: [pt('中国','Zhōngguó'), pt('的','de'), pt('文化遗产','wénhuà yíchǎn'), pt('从哪些','cóng nǎ xiē'), pt('方面','fāngmiàn'), pt('体现','tǐxiàn'), pt('了','le'), pt('民族','mínzú'), pt('智慧','zhìhuì'), pt('？')],
    model: '从传统节日、民间艺术、古典文学到传统建筑，无不体现着中华民族的智慧与创造力。',
    key: ['艺术', '智慧', '创造力'],
    options: [
      { tokens: [pt('只有','zhǐyǒu'), pt('传统','chuántǒng'), pt('节日','jiérì')], correct: false },
      { tokens: [pt('节日','jiérì'), pt('、'), pt('民间','mínjiān'), pt('艺术','yìshù'), pt('、'), pt('文学','wénxué'), pt('、'), pt('建筑','jiànzhù')], correct: true },
      { tokens: [pt('主要是','zhǔyào shì'), pt('经济','jīngjì'), pt('发展','fāzhǎn')], correct: false },
    ],
  },
  {
    q: [pt('传统技艺','chuántǒng jìyì'), pt('面临','miànlín'), pt('怎样','zěnyàng'), pt('的','de'), pt('危机','wēijī'), pt('？')],
    model: '面临失传的危机。',
    key: ['失传', '危机'],
    options: [
      { tokens: [pt('缺乏','quēfá'), pt('资金','zījīn'), pt('支持','zhīchí')], correct: false },
      { tokens: [pt('面临','miànlín'), pt('失传','shīchuán'), pt('的','de'), pt('危机','wēijī')], correct: true },
      { tokens: [pt('无人','wú rén'), pt('欣赏','xīnshǎng')], correct: false },
    ],
  },
  {
    q: [pt('专家','zhuānjiā'), pt('认为','rènwéi'), pt('传统文化','chuántǒng wénhuà'), pt('的','de'), pt('传承','chuánchéng'), pt('需要','xūyào'), pt('什么','shénme'), pt('？')],
    model: '需要创新与时代精神相结合，使其焕发新的活力。',
    key: ['创新', '精神', '焕发', '活力'],
    options: [
      { tokens: [pt('完全','wánquán'), pt('保持','bǎochí'), pt('原样','yuányàng')], correct: false },
      { tokens: [pt('创新','chuàngxīn'), pt('与','yǔ'), pt('时代','shídài'), pt('精神','jīngshén'), pt('结合','jiéhé')], correct: true },
      { tokens: [pt('依靠','yīkào'), pt('政府','zhèngfǔ'), pt('推广','tuīguǎng')], correct: false },
    ],
  },
  {
    q: [pt('怎样','zěnyàng'), pt('才能','cái néng'), pt('实现','shíxiàn'), pt('文化','wénhuà'), pt('的','de'), pt('可持续','kě chíxù'), pt('发展','fāzhǎn'), pt('？')],
    model: '只有让传统文化在现代生活中找到自己的位置，才能真正实现文化的可持续发展。',
    key: ['可持续', '发展', '传统'],
    options: [
      { tokens: [pt('推广','tuīguǎng'), pt('外来','wàilái'), pt('文化','wénhuà')], correct: false },
      { tokens: [pt('让','ràng'), pt('传统','chuántǒng'), pt('文化','wénhuà'), pt('在','zài'), pt('现代','xiàndài'), pt('生活','shēnghuó'), pt('中','zhōng'), pt('找到','zhǎodào'), pt('位置','wèizhi')], correct: true },
      { tokens: [pt('禁止','jìnzhǐ'), pt('外来','wàilái'), pt('文化','wénhuà'), pt('传入','chuánrù')], correct: false },
    ],
  },
];

const HSK6_FILL: FillItem[] = [
  {
    before: [pt('各国文化之间的交流与')],
    answer: ['碰撞', 'pèngzhuàng'],
    after: [pt('日益','rìyì'), pt('频繁','pínfán'), pt('。')],
    options: [['碰撞','pèngzhuàng',true], ['传承','chuánchéng',false], ['焕发','huànfā',false], ['追求','zhuīqiú',false]],
  },
  {
    before: [pt('传统技艺面临')],
    answer: ['失传', 'shīchuán'],
    after: [pt('的'), pt('危机','wēijī'), pt('。')],
    options: [['失传','shīchuán',true], ['创新','chuàngxīn',false], ['发展','fāzhǎn',false], ['活力','huólì',false]],
  },
  {
    before: [pt('传统文化的传承需要')],
    answer: ['创新', 'chuàngxīn'],
    after: [pt('与'), pt('时代'), pt('精神','jīngshén'), pt('相结合'), pt('。')],
    options: [['创新','chuàngxīn',true], ['碰撞','pèngzhuàng',false], ['遗产','yíchǎn',false], ['失传','shīchuán',false]],
  },
  {
    before: [pt('使其')],
    answer: ['焕发', 'huànfā'],
    after: [pt('新'), pt('的'), pt('活力','huólì'), pt('。')],
    options: [['焕发','huànfā',true], ['传承','chuánchéng',false], ['背离','bèilí',false], ['积累','jīlěi',false]],
  },
];

// ─────────────────────────────────────────────
// Build and export
// ─────────────────────────────────────────────
function buildPassage(
  level: number,
  titleText: string,
  titleTokensRaw: PassageToken[],
  raw: RawToken[],
  freeDict: Record<string, string>,
  questions: Question[],
  fillItems: FillItem[],
  charCount: number,
): PassageData {
  const sentences = buildSentences(raw, freeDict);
  const vocabSet = new Set(
    sentences.flatMap(s => s.tokens.filter(t => t.type === 'vocab').map(t => t.text))
  );
  const conversation = STATIC_CONVOS[level] ?? STATIC_CONVOS[4];
  return { level, titleText, titleTokens: titleTokensRaw, sentences, vocabSet, questions, fillItems, conversation, charCount };
}

export const PASSAGES: PassageData[] = [
  buildPassage(1, '我的家', [
    { text: '我', reading: 'wǒ', meaning: 'I · me' },
    { text: '的', reading: 'de', meaning: '(modifier particle)' },
    { text: '家', reading: 'jiā', meaning: 'home · family' },
  ], HSK1_RAW, HSK1_FREE, HSK1_QUESTIONS, HSK1_FILL, 125),

  buildPassage(2, '周末去公园', [
    { text: '周末', reading: 'zhōumò', meaning: 'weekend' },
    { text: '去', reading: 'qù', meaning: 'to go' },
    { text: '公园', reading: 'gōngyuán', meaning: 'park' },
  ], HSK2_RAW, HSK2_FREE, HSK2_QUESTIONS, HSK2_FILL, 155),

  buildPassage(3, '学中文', [
    { text: '学', reading: 'xué', meaning: 'to study · to learn' },
    { text: '中文', reading: 'zhōngwén', meaning: 'Chinese (language)' },
  ], HSK3_RAW, HSK3_FREE, HSK3_QUESTIONS, HSK3_FILL, 185),

  buildPassage(4, '城市里的环境', [
    { text: '城市', reading: 'chéngshì', meaning: 'city; town' },
    { text: '里', reading: 'lǐ', meaning: 'inside; within' },
    { text: '的', reading: 'de', meaning: '(modifier / possessive particle)' },
    { text: '环境', reading: 'huánjìng', meaning: 'environment; surroundings' },
  ], HSK4_RAW, HSK4_FREE, HSK4_QUESTIONS, HSK4_FILL, 200),

  buildPassage(5, '网络与生活', [
    { text: '网络', reading: 'wǎngluò', meaning: 'the internet · network' },
    { text: '与', reading: 'yǔ', meaning: 'and · with' },
    { text: '生活', reading: 'shēnghuó', meaning: 'life · to live' },
  ], HSK5_RAW, HSK5_FREE, HSK5_QUESTIONS, HSK5_FILL, 250),

  buildPassage(6, '传统文化的传承', [
    { text: '传统', reading: 'chuántǒng', meaning: 'traditional · tradition' },
    { text: '文化', reading: 'wénhuà', meaning: 'culture · civilization' },
    { text: '的', reading: 'de', meaning: '(modifier particle)' },
    { text: '传承', reading: 'chuánchéng', meaning: 'inheritance · to pass on' },
  ], HSK6_RAW, HSK6_FREE, HSK6_QUESTIONS, HSK6_FILL, 305),
];

export function getPassageData(hskLevel: number): PassageData {
  return PASSAGES.find(p => p.level === hskLevel) ?? PASSAGES[3]; // default HSK 4
}

/** Language-aware static passage lookup. Chinese uses HSK levels; Japanese uses JLPT. */
export function getPassageDataForLanguage(lang: LanguageCode, level: number): PassageData {
  if (lang === 'ja') return getJaPassageData(level);
  return getPassageData(level);
}
