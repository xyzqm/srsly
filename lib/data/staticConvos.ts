/**
 * Per-level static fallback conversations.
 * Used when AI-generated daily content is not available.
 * Each matches its level's passage theme.
 */
import type { ConvoTurn } from '@/lib/types';

function t(text: string, pinyin?: string) {
  return pinyin ? { text, pinyin } : { text, type: 'punct' as const };
}

// ─── HSK 1 — 我的家 ──────────────────────────────────────────────────────────
export const HSK1_CONVO: ConvoTurn[] = [
  {
    key: ['家', '家人'],
    tokens: [t('你','nǐ'),t('家里','jiā lǐ'),t('有','yǒu'),t('几','jǐ'),t('个','gè'),t('人','rén'),t('？')],
    suggestions: [
      [t('我','wǒ'),t('家','jiā'),t('有','yǒu'),t('四','sì'),t('个','gè'),t('人','rén'),t('。')],
      [t('我','wǒ'),t('家','jiā'),t('有','yǒu'),t('爸爸','bàba'),t('、'),t('妈妈','māma'),t('和','hé'),t('哥哥','gēge'),t('。')],
    ],
  },
  {
    key: ['猫', '喜欢'],
    tokens: [t('你','nǐ'),t('家','jiā'),t('有','yǒu'),t('猫','māo'),t('吗','ma'),t('？')],
    suggestions: [
      [t('有','yǒu'),t('，'),t('我','wǒ'),t('家','jiā'),t('有','yǒu'),t('一只','yī zhī'),t('猫','māo'),t('。')],
      [t('没有','méiyǒu'),t('，'),t('我','wǒ'),t('喜欢','xǐhuān'),t('猫','māo'),t('。')],
    ],
  },
  {
    key: ['早饭', '一起'],
    tokens: [t('你','nǐ'),t('们','men'),t('家','jiā'),t('早上','zǎoshang'),t('一起','yìqǐ'),t('吃','chī'),t('早饭','zǎofàn'),t('吗','ma'),t('？')],
    suggestions: [
      [t('对','duì'),t('，'),t('我们','wǒmen'),t('每天','měitiān'),t('一起','yìqǐ'),t('吃','chī'),t('早饭','zǎofàn'),t('。')],
      [t('不','bù'),t('，'),t('大家','dàjiā'),t('都','dōu'),t('很','hěn'),t('忙','máng'),t('。')],
    ],
  },
  {
    key: ['喜欢', '吃', '面条'],
    tokens: [t('你','nǐ'),t('喜欢','xǐhuān'),t('吃','chī'),t('什么','shénme'),t('早饭','zǎofàn'),t('？')],
    suggestions: [
      [t('我','wǒ'),t('喜欢','xǐhuān'),t('吃','chī'),t('面条','miàntiáo'),t('。')],
      [t('我','wǒ'),t('喜欢','xǐhuān'),t('喝','hē'),t('茶','chá'),t('。')],
    ],
  },
  {
    key: ['家人'],
    tokens: [t('你','nǐ'),t('觉得','juéde'),t('家人','jiārén'),t('对','duì'),t('你','nǐ'),t('重要','zhòngyào'),t('吗','ma'),t('？')],
    suggestions: [],
  },
];

// ─── HSK 2 — 周末去公园 ──────────────────────────────────────────────────────
export const HSK2_CONVO: ConvoTurn[] = [
  {
    key: ['周末', '公园'],
    tokens: [t('你','nǐ'),t('周末','zhōumò'),t('一般','yìbān'),t('去','qù'),t('哪里','nǎlǐ'),t('？')],
    suggestions: [
      [t('我','wǒ'),t('喜欢','xǐhuān'),t('去','qù'),t('公园','gōngyuán'),t('。')],
      [t('我','wǒ'),t('常常','chángcháng'),t('在','zài'),t('家','jiā'),t('休息','xiūxi'),t('。')],
    ],
  },
  {
    key: ['跑步', '树', '花'],
    tokens: [t('公园','gōngyuán'),t('里','lǐ'),t('有','yǒu'),t('什么','shénme'),t('？')],
    suggestions: [
      [t('有','yǒu'),t('很多','hěn duō'),t('树','shù'),t('和','hé'),t('花','huā'),t('。')],
      [t('很多','hěn duō'),t('人','rén'),t('在','zài'),t('那里','nàlǐ'),t('跑步','pǎobù'),t('。')],
    ],
  },
  {
    key: ['聊天', '开心'],
    tokens: [t('你','nǐ'),t('会','huì'),t('和','hé'),t('朋友','péngyou'),t('一起','yìqǐ'),t('去','qù'),t('吗','ma'),t('？')],
    suggestions: [
      [t('会','huì'),t('，'),t('我们','wǒmen'),t('常常','chángcháng'),t('一起','yìqǐ'),t('聊天','liáotiān'),t('，'),t('感觉','gǎnjué'),t('很','hěn'),t('开心','kāixīn'),t('。')],
      [t('有时候','yǒu shíhou'),t('一个人','yī gè rén'),t('去','qù'),t('。')],
    ],
  },
  {
    key: ['玩', '游戏', '孩子们'],
    tokens: [t('公园','gōngyuán'),t('里','lǐ'),t('孩子们','háizimen'),t('做','zuò'),t('什么','shénme'),t('？')],
    suggestions: [
      [t('他们','tāmen'),t('在','zài'),t('草地','cǎodì'),t('上','shàng'),t('玩','wán'),t('游戏','yóuxì'),t('。')],
    ],
  },
  {
    key: ['习惯'],
    tokens: [t('你','nǐ'),t('觉得','juéde'),t('去','qù'),t('公园','gōngyuán'),t('是','shì'),t('一个','yī gè'),t('好','hǎo'),t('习惯','xíguàn'),t('吗','ma'),t('？')],
    suggestions: [],
  },
];

// ─── HSK 3 — 学中文 ──────────────────────────────────────────────────────────
export const HSK3_CONVO: ConvoTurn[] = [
  {
    key: ['开始', '学习', '中文'],
    tokens: [t('你','nǐ'),t('从','cóng'),t('什么','shénme'),t('时候','shíhou'),t('开始','kāishǐ'),t('学习','xuéxí'),t('中文','zhōngwén'),t('的','de'),t('？')],
    suggestions: [
      [t('我','wǒ'),t('从','cóng'),t('去年','qùnián'),t('开始','kāishǐ'),t('学习','xuéxí'),t('中文','zhōngwén'),t('。')],
      [t('我','wǒ'),t('很','hěn'),t('小','xiǎo'),t('的','de'),t('时候','shíhou'),t('就','jiù'),t('开始','kāishǐ'),t('了','le'),t('。')],
    ],
  },
  {
    key: ['汉字', '听力'],
    tokens: [t('你','nǐ'),t('觉得','juéde'),t('学','xué'),t('中文','zhōngwén'),t('最','zuì'),t('难','nán'),t('的','de'),t('是','shì'),t('什么','shénme'),t('？')],
    suggestions: [
      [t('汉字','hànzì'),t('很','hěn'),t('多','duō'),t('，'),t('比较','bǐjiào'),t('难','nán'),t('记','jì'),t('。')],
      [t('听力','tīnglì'),t('对','duì'),t('我','wǒ'),t('来说','lái shuō'),t('比较','bǐjiào'),t('难','nán'),t('。')],
    ],
  },
  {
    key: ['练习', '坚持'],
    tokens: [t('你','nǐ'),t('怎么','zěnme'),t('练习','liànxí'),t('中文','zhōngwén'),t('？')],
    suggestions: [
      [t('我','wǒ'),t('每天','měitiān'),t('坚持','jiānchí'),t('练习','liànxí'),t('写','xiě'),t('汉字','hànzì'),t('。')],
      [t('我','wǒ'),t('看','kàn'),t('中文','zhōngwén'),t('视频','shìpín'),t('来','lái'),t('练习','liànxí'),t('听力','tīnglì'),t('。')],
    ],
  },
  {
    key: ['流利', '希望'],
    tokens: [t('你','nǐ'),t('希望','xīwàng'),t('自己','zìjǐ'),t('的','de'),t('中文','zhōngwén'),t('达到','dádào'),t('什么','shénme'),t('水平','shuǐpíng'),t('？')],
    suggestions: [
      [t('我','wǒ'),t('希望','xīwàng'),t('能','néng'),t('说','shuō'),t('一口','yīkǒu'),t('流利','liúlì'),t('的','de'),t('中文','zhōngwén'),t('。')],
    ],
  },
  {
    key: ['坚持'],
    tokens: [t('继续','jìxù'),t('加油','jiāyóu'),t('！'),t('坚持','jiānchí'),t('就','jiù'),t('是','shì'),t('成功','chénggōng'),t('。')],
    suggestions: [],
  },
];

// ─── HSK 4 — 城市里的环境 ────────────────────────────────────────────────────
export const HSK4_CONVO: ConvoTurn[] = [
  {
    key: ['城市', '住'],
    tokens: [t('你好','nǐ hǎo'),t('！'),t('我们','wǒmen'),t('来','lái'),t('聊聊','liáoliao'),t('环境','huánjìng'),t('吧','ba'),t('。'),t('你','nǐ'),t('住','zhù'),t('在','zài'),t('城市','chéngshì'),t('吗','ma'),t('？')],
    suggestions: [
      [t('对','duì'),t('，'),t('我','wǒ'),t('住','zhù'),t('在','zài'),t('大','dà'),t('城市','chéngshì'),t('。')],
      [t('不','bù'),t('，'),t('我','wǒ'),t('住','zhù'),t('在','zài'),t('乡下','xiāngxia'),t('。')],
    ],
  },
  {
    key: ['分类', '垃圾', '习惯'],
    tokens: [t('你','nǐ'),t('会','huì'),t('把','bǎ'),t('垃圾','lājī'),t('分类','fēnlèi'),t('吗','ma'),t('？')],
    suggestions: [
      [t('会','huì'),t('，'),t('这','zhè'),t('是','shì'),t('我','wǒ'),t('的','de'),t('习惯','xíguàn'),t('。')],
      [t('不会','bú huì'),t('，'),t('我','wǒ'),t('常常','chángcháng'),t('忘记','wàngjì'),t('。')],
    ],
  },
  {
    key: ['保护', '环境', '回收', '减少'],
    tokens: [t('如果','rúguǒ'),t('我们','wǒmen'),t('减少','jiǎnshǎo'),t('浪费','làngfèi'),t('，'),t('多','duō'),t('回收','huíshōu'),t('，'),t('就','jiù'),t('能','néng'),t('保护','bǎohù'),t('环境','huánjìng'),t('。')],
    suggestions: [
      [t('我','wǒ'),t('同意','tóngyì'),t('！'),t('保护','bǎohù'),t('环境','huánjìng'),t('很','hěn'),t('重要','zhòngyào'),t('。')],
    ],
  },
  {
    key: ['养成', '习惯', '干净'],
    tokens: [t('你','nǐ'),t('认为','rènwéi'),t('城市','chéngshì'),t('怎么','zěnme'),t('才','cái'),t('能','néng'),t('越来越','yuèláiyuè'),t('干净','gānjìng'),t('？')],
    suggestions: [
      [t('每个','měi gè'),t('人','rén'),t('都','dōu'),t('要','yào'),t('养成','yǎngchéng'),t('好','hǎo'),t('习惯','xíguàn'),t('。')],
      [t('减少','jiǎnshǎo'),t('浪费','làngfèi'),t('，'),t('多','duō'),t('回收','huíshōu'),t('。')],
    ],
  },
  {
    key: ['环境', '保护'],
    tokens: [t('说','shuō'),t('得','de'),t('很','hěn'),t('好','hǎo'),t('！'),t('保护','bǎohù'),t('环境','huánjìng'),t('从','cóng'),t('我','wǒ'),t('做起','zuòqǐ'),t('。')],
    suggestions: [],
  },
];

// ─── HSK 5 — 网络与生活 ──────────────────────────────────────────────────────
export const HSK5_CONVO: ConvoTurn[] = [
  {
    key: ['网络', '生活', '互联网'],
    tokens: [t('互联网','hùliánwǎng'),t('的','de'),t('发展','fāzhǎn'),t('改变','gǎibiàn'),t('了','le'),t('我们','wǒmen'),t('的','de'),t('生活','shēnghuó'),t('，'),t('你','nǐ'),t('有','yǒu'),t('什么','shénme'),t('感受','gǎnshòu'),t('？')],
    suggestions: [
      [t('我','wǒ'),t('觉得','juéde'),t('网络','wǎngluò'),t('让','ràng'),t('生活','shēnghuó'),t('更','gèng'),t('方便','fāngbiàn'),t('了','le'),t('。')],
      [t('有','yǒu'),t('好处','hǎochu'),t('，'),t('也','yě'),t('有','yǒu'),t('问题','wèntí'),t('。')],
    ],
  },
  {
    key: ['手机', '过度', '健康'],
    tokens: [t('你','nǐ'),t('觉得','juéde'),t('过度','guòdù'),t('使用','shǐyòng'),t('手机','shǒujī'),t('有','yǒu'),t('什么','shénme'),t('影响','yǐngxiǎng'),t('？')],
    suggestions: [
      [t('会','huì'),t('影响','yǐngxiǎng'),t('睡眠','shuìmián'),t('和','hé'),t('健康','jiànkāng'),t('。')],
      [t('长时间','cháng shíjiān'),t('盯着','dīngzhe'),t('屏幕','píngmù'),t('对','duì'),t('眼睛','yǎnjing'),t('不','bù'),t('好','hǎo'),t('。')],
    ],
  },
  {
    key: ['信息', '辨别', '真实'],
    tokens: [t('网络','wǎngluò'),t('上','shàng'),t('的','de'),t('信息','xìnxī'),t('并非','bìngfēi'),t('都','dōu'),t('真实','zhēnshí'),t('，'),t('你','nǐ'),t('怎么','zěnme'),t('辨别','biànbié'),t('？')],
    suggestions: [
      [t('我','wǒ'),t('会','huì'),t('查','chá'),t('多','duō'),t('个','gè'),t('来源','láiyuán'),t('，'),t('再','zài'),t('判断','pànduàn'),t('。')],
      [t('要','yào'),t('培养','péiyǎng'),t('辨别','biànbié'),t('信息','xìnxī'),t('真伪','zhēnwěi'),t('的','de'),t('能力','nénglì'),t('。')],
    ],
  },
  {
    key: ['合理', '技术', '便利'],
    tokens: [t('如何','rúhé'),t('合理','hélǐ'),t('使用','shǐyòng'),t('网络','wǎngluò'),t('，'),t('享受','xiǎngshòu'),t('技术','jìshù'),t('的','de'),t('便利','biànlì'),t('？')],
    suggestions: [
      [t('要','yào'),t('控制','kòngzhì'),t('使用','shǐyòng'),t('时间','shíjiān'),t('，'),t('不','bù'),t('过度','guòdù'),t('依赖','yīlài'),t('。')],
    ],
  },
  {
    key: ['发展'],
    tokens: [t('说','shuō'),t('得','de'),t('很','hěn'),t('好','hǎo'),t('！'),t('希望','xīwàng'),t('大家','dàjiā'),t('都','dōu'),t('能','néng'),t('合理','hélǐ'),t('使用','shǐyòng'),t('网络','wǎngluò'),t('。')],
    suggestions: [],
  },
];

// ─── HSK 6 — 传统文化的传承 ──────────────────────────────────────────────────
export const HSK6_CONVO: ConvoTurn[] = [
  {
    key: ['传统', '文化', '全球化'],
    tokens: [t('在','zài'),t('全球化','quánqiúhuà'),t('背景','bèijǐng'),t('下','xià'),t('，'),t('你','nǐ'),t('认为','rènwéi'),t('传统','chuántǒng'),t('文化','wénhuà'),t('面临','miànlín'),t('什么','shénme'),t('挑战','tiǎozhàn'),t('？')],
    suggestions: [
      [t('很多','hěn duō'),t('传统','chuántǒng'),t('文化','wénhuà'),t('正在','zhèngzài'),t('慢慢','mànmàn'),t('消失','xiāoshī'),t('。')],
      [t('如何','rúhé'),t('保护','bǎohù'),t('和','hé'),t('传承','chuánchéng'),t('本','běn'),t('民族','mínzú'),t('文化','wénhuà'),t('是','shì'),t('重要','zhòngyào'),t('问题','wèntí'),t('。')],
    ],
  },
  {
    key: ['传承', '民间', '艺术', '失传'],
    tokens: [t('许多','xǔduō'),t('传统','chuántǒng'),t('技艺','jìyì'),t('面临','miànlín'),t('失传','shīchuán'),t('的','de'),t('危机','wēijī'),t('，'),t('你','nǐ'),t('觉得','juéde'),t('怎么','zěnme'),t('办','bàn'),t('？')],
    suggestions: [
      [t('应该','yīnggāi'),t('支持','zhīchí'),t('民间','mínjiān'),t('艺术','yìshù'),t('家','jiā'),t('，'),t('让','ràng'),t('他们','tāmen'),t('传授','chuánshòu'),t('技艺','jìyì'),t('。')],
      [t('政府','zhèngfǔ'),t('和','hé'),t('社会','shèhuì'),t('都','dōu'),t('应该','yīnggāi'),t('重视','zhòngshì'),t('传承','chuánchéng'),t('问题','wèntí'),t('。')],
    ],
  },
  {
    key: ['创新', '精神', '活力'],
    tokens: [t('传统','chuántǒng'),t('文化','wénhuà'),t('如何','rúhé'),t('与','yǔ'),t('创新','chuàngxīn'),t('精神','jīngshén'),t('结合','jiéhé'),t('，'),t('焕发','huànfā'),t('新','xīn'),t('活力','huólì'),t('？')],
    suggestions: [
      [t('可以','kěyǐ'),t('将','jiāng'),t('传统','chuántǒng'),t('元素','yuánsù'),t('融入','róngrù'),t('现代','xiàndài'),t('设计','shèjì'),t('中','zhōng'),t('。')],
      [t('用','yòng'),t('现代','xiàndài'),t('方式','fāngshì'),t('呈现','chénxiàn'),t('传统','chuántǒng'),t('艺术','yìshù'),t('，'),t('吸引','xīyǐn'),t('年轻人','niánqīng rén'),t('。')],
    ],
  },
  {
    key: ['可持续', '发展'],
    tokens: [t('怎样','zěnyàng'),t('才能','cái néng'),t('实现','shíxiàn'),t('文化','wénhuà'),t('的','de'),t('可持续','kě chíxù'),t('发展','fāzhǎn'),t('？')],
    suggestions: [
      [t('让','ràng'),t('传统','chuántǒng'),t('文化','wénhuà'),t('在','zài'),t('现代','xiàndài'),t('生活','shēnghuó'),t('中','zhōng'),t('找到','zhǎodào'),t('自己','zìjǐ'),t('的','de'),t('位置','wèizhi'),t('。')],
    ],
  },
  {
    key: ['智慧', '创造力'],
    tokens: [t('传统','chuántǒng'),t('文化','wénhuà'),t('蕴含','yùnhán'),t('着','zhe'),t('民族','mínzú'),t('的','de'),t('智慧','zhìhuì'),t('与','yǔ'),t('创造力','chuàngzàolì'),t('，'),t('值得','zhídé'),t('我们','wǒmen'),t('珍惜','zhēnxī'),t('。')],
    suggestions: [],
  },
];

export const STATIC_CONVOS: Record<number, ConvoTurn[]> = {
  1: HSK1_CONVO,
  2: HSK2_CONVO,
  3: HSK3_CONVO,
  4: HSK4_CONVO,
  5: HSK5_CONVO,
  6: HSK6_CONVO,
};
