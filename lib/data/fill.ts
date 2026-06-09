import type { FillItem } from '@/lib/types';

function t(text: string, pinyin?: string) {
  return pinyin ? { text, pinyin } : { text, type: 'punct' as const };
}

export const FILL_ITEMS: FillItem[] = [
  {
    before: [t('请','qǐng'), t('把','bǎ')],
    answer: ['垃圾', 'lājī'],
    after: [t('放进','fàngjìn'), t('桶','tǒng'), t('里','lǐ'), t('。')],
    options: [['垃圾','lājī',true], ['城市','chéngshì',false], ['习惯','xíguàn',false], ['保护','bǎohù',false]],
  },
  {
    before: [t('我们','wǒmen'), t('要','yào')],
    answer: ['保护', 'bǎohù'],
    after: [t('环境','huánjìng'), t('。')],
    options: [['保护','bǎohù',true], ['分类','fēnlèi',false], ['减少','jiǎnshǎo',false], ['回收','huíshōu',false]],
  },
  {
    before: [t('可以','kěyǐ')],
    answer: ['回收', 'huíshōu'],
    after: [t('的','de'), t('东西','dōngxi'), t('，'), t('不要','búyào'), t('扔掉','rēngdiào'), t('。')],
    options: [['城市','chéngshì',false], ['回收','huíshōu',true], ['浪费','làngfèi',false], ['习惯','xíguàn',false]],
  },
  {
    before: [t('每天','měitiān'), t('运动','yùndòng'), t('是','shì'), t('一个','yí gè'), t('好','hǎo')],
    answer: ['习惯', 'xíguàn'],
    after: [t('。')],
    options: [['环境','huánjìng',false], ['习惯','xíguàn',true], ['回收','huíshōu',false], ['分类','fēnlèi',false]],
  },
];
