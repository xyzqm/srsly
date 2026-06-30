import type { ConvoTurn } from '@/lib/types';

function t(text: string, reading?: string) {
  return reading ? { text, reading } : { text, type: 'punct' as const };
}

export const CONVO: ConvoTurn[] = [
  {
    key: ['城市','住','乡下'],
    tokens: [t('你好','nǐ hǎo'),t('！'),t('我们','wǒmen'),t('来','lái'),t('聊聊','liáoliao'),t('环境','huánjìng'),t('吧','ba'),t('。'),t('你','nǐ'),t('住','zhù'),t('在','zài'),t('城市','chéngshì'),t('吗','ma'),t('？')],
    suggestions: [
      [t('对','duì'),t('，'),t('我','wǒ'),t('住','zhù'),t('在','zài'),t('大','dà'),t('城市','chéngshì'),t('。')],
      [t('不','bù'),t('，'),t('我','wǒ'),t('住','zhù'),t('在','zài'),t('乡下','xiāngxia'),t('。')],
    ],
  },
  {
    key: ['分类','垃圾','习惯','会'],
    tokens: [t('城市','chéngshì'),t('里','lǐ'),t('每天','měitiān'),t('有','yǒu'),t('很多','hěn duō'),t('垃圾','lājī'),t('。'),t('你','nǐ'),t('会','huì'),t('把','bǎ'),t('垃圾','lājī'),t('分类','fēnlèi'),t('吗','ma'),t('？')],
    suggestions: [
      [t('会','huì'),t('，'),t('这','zhè'),t('是','shì'),t('我','wǒ'),t('的','de'),t('习惯','xíguàn'),t('。')],
      [t('不会','bú huì'),t('，'),t('我','wǒ'),t('常常','chángcháng'),t('忘记','wàngjì'),t('。')],
    ],
  },
  {
    key: ['保护','环境','同意','回收','减少'],
    tokens: [t('没关系','méi guānxi'),t('。'),t('如果','rúguǒ'),t('我们','wǒmen'),t('减少','jiǎnshǎo'),t('浪费','làngfèi'),t('，'),t('多','duō'),t('回收','huíshōu'),t('，'),t('就','jiù'),t('能','néng'),t('保护','bǎohù'),t('环境','huánjìng'),t('。')],
    suggestions: [
      [t('我','wǒ'),t('同意','tóngyì'),t('！'),t('保护','bǎohù'),t('环境','huánjìng'),t('很','hěn'),t('重要','zhòngyào'),t('。')],
    ],
  },
  {
    key: ['习惯','分类','减少','保护'],
    tokens: [t('你','nǐ'),t('平时','píngshí'),t('有','yǒu'),t('什么','shénme'),t('保护','bǎohù'),t('环境','huánjìng'),t('的','de'),t('好','hǎo'),t('习惯','xíguàn'),t('？')],
    suggestions: [
      [t('我','wǒ'),t('会','huì'),t('把','bǎ'),t('垃圾','lājī'),t('分类','fēnlèi'),t('，'),t('也','yě'),t('减少','jiǎnshǎo'),t('浪费','làngfèi'),t('。')],
      [t('我','wǒ'),t('会','huì'),t('多','duō'),t('回收','huíshōu'),t('瓶子','píngzi'),t('和','hé'),t('纸','zhǐ'),t('。')],
    ],
  },
  {
    key: ['继续','加油'],
    tokens: [t('说','shuō'),t('得','de'),t('真','zhēn'),t('好','hǎo'),t('！'),t('再','zài'),t('聊聊','liáoliao'),t('你','nǐ'),t('住','zhù'),t('的','de'),t('城市','chéngshì'),t('吧','ba'),t('—'),t('有','yǒu'),t('什么','shénme'),t('可以','kěyǐ'),t('更好','gèng hǎo'),t('？')],
    suggestions: [],
  },
];
