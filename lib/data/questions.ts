import type { Question, PassageToken } from '@/lib/types';

function t(text: string, pinyin?: string): PassageToken {
  return pinyin ? { text, pinyin } : { text, type: 'punct' };
}

export const QUESTIONS: Question[] = [
  {
    q: [t('为了','wèile'),t('保护','bǎohù'),t('环境','huánjìng'),t('，'),t('我们','wǒmen'),t('应该','yīnggāi'),t('怎么','zěnme'),t('做','zuò'),t('？')],
    model: '减少浪费、把垃圾分类、回收可以再用的东西。',
    key: ['减少','分类','回收','浪费'],
    options: [
      { tokens: [t('买','mǎi'),t('更多','gèng duō'),t('的','de'),t('东西','dōngxi')], correct: false },
      { tokens: [t('减少','jiǎnshǎo'),t('浪费','làngfèi'),t('，'),t('把','bǎ'),t('垃圾','lājī'),t('分类','fēnlèi')], correct: true },
      { tokens: [t('把','bǎ'),t('垃圾','lājī'),t('扔','rēng'),t('在','zài'),t('城市','chéngshì'),t('里','lǐ')], correct: false },
    ],
  },
  {
    q: [t('什么样','shénme yàng'),t('的','de'),t('东西','dōngxi'),t('不要','búyào'),t('扔掉','rēngdiào'),t('？')],
    model: '可以回收、能再用的东西，不要扔掉。',
    key: ['回收','再用','能'],
    options: [
      { tokens: [t('能','néng'),t('回收','huíshōu'),t('的','de'),t('东西','dōngxi')], correct: true },
      { tokens: [t('所有','suǒyǒu'),t('的','de'),t('东西','dōngxi')], correct: false },
      { tokens: [t('很','hěn'),t('大','dà'),t('的','de'),t('东西','dōngxi')], correct: false },
    ],
  },
  {
    q: [t('如果','rúguǒ'),t('每个','měi gè'),t('人','rén'),t('都','dōu'),t('养成','yǎngchéng'),t('好','hǎo'),t('习惯','xíguàn'),t('，'),t('城市','chéngshì'),t('会','huì'),t('怎么样','zěnme yàng'),t('？')],
    model: '城市会越来越干净。',
    key: ['城市','干净','越来越'],
    options: [
      { tokens: [t('越来越','yuèláiyuè'),t('大','dà')], correct: false },
      { tokens: [t('越来越','yuèláiyuè'),t('多','duō'),t('人','rén')], correct: false },
      { tokens: [t('越来越','yuèláiyuè'),t('干净','gānjìng')], correct: true },
    ],
  },
  {
    q: [t('作者','zuòzhě'),t('住','zhù'),t('在','zài'),t('什么','shénme'),t('地方','dìfang'),t('？')],
    model: '作者住在一个很大的城市。',
    key: ['城市','大','住'],
    options: [
      { tokens: [t('乡下','xiāngxia')], correct: false },
      { tokens: [t('一个','yí gè'),t('小','xiǎo'),t('村子','cūnzi')], correct: false },
      { tokens: [t('一个','yí gè'),t('很','hěn'),t('大','dà'),t('的','de'),t('城市','chéngshì')], correct: true },
    ],
  },
  {
    q: [t('为什么','wèi shénme'),t('我们','wǒmen'),t('要','yào'),t('把','bǎ'),t('垃圾','lājī'),t('分类','fēnlèi'),t('？')],
    model: '因为分类可以保护环境，减少浪费，也让城市更干净。',
    key: ['保护','环境','减少','干净'],
    options: [
      { tokens: [t('因为','yīnwèi'),t('好玩','hǎowán')], correct: false },
      { tokens: [t('为了','wèile'),t('保护','bǎohù'),t('环境','huánjìng'),t('和','hé'),t('减少','jiǎnshǎo'),t('浪费','làngfèi')], correct: true },
      { tokens: [t('因为','yīnwèi'),t('城市','chéngshì'),t('很','hěn'),t('大','dà')], correct: false },
    ],
  },
];
