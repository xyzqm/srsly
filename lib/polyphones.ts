/**
 * Common polyphones (多音字) — characters with multiple readings.
 * Each entry lists readings in order of frequency / HSK relevance.
 * `m` uses semicolons as separators, matching the dictionary convention,
 * so AddWordForm's split(';') logic handles them uniformly.
 *
 * `compounds` lists common multi-character words that carry THAT reading. A
 * reading that rarely stands alone (e.g. 行 háng — almost always inside 银行,
 * 行业) provides compounds so generated passages can surface it naturally.
 */
export interface Reading { p: string; m: string; compounds?: string[] }

export const POLYPHONES: Record<string, Reading[]> = {
  '行': [
    { p: 'xíng', m: 'OK; to do; capable; to walk; to travel', compounds: ['行走', '旅行', '进行'] },
    { p: 'háng', m: 'row; line; profession; trade; industry', compounds: ['银行', '行业', '同行'] },
  ],
  '好': [
    { p: 'hǎo', m: 'good; well; fine; friendly', compounds: ['好处', '友好'] },
    { p: 'hào', m: 'to like; to be fond of; to have a tendency to', compounds: ['爱好', '好奇'] },
  ],
  '还': [
    { p: 'hái', m: 'still; also; yet; even more' },
    { p: 'huán', m: 'to return; to give back', compounds: ['还书', '归还', '还钱'] },
  ],
  '长': [
    { p: 'cháng', m: 'long; length; forte; strong point', compounds: ['长度', '长短'] },
    { p: 'zhǎng', m: 'to grow; to increase; elder; chief; head', compounds: ['长大', '成长', '校长'] },
  ],
  '重': [
    { p: 'zhòng', m: 'heavy; important; serious; to attach importance to', compounds: ['重要', '重量'] },
    { p: 'chóng', m: 'again; once more; repeat; layer', compounds: ['重新', '重复'] },
  ],
  '中': [
    { p: 'zhōng', m: 'middle; center; China; in the process of', compounds: ['中间', '中心'] },
    { p: 'zhòng', m: 'to hit; to be hit by; to fit exactly', compounds: ['中奖', '打中'] },
  ],
  '乐': [
    { p: 'lè', m: 'happy; joyful; to enjoy; to find pleasure in', compounds: ['快乐', '欢乐'] },
    { p: 'yuè', m: 'music', compounds: ['音乐', '乐器'] },
  ],
  '着': [
    { p: 'zhe', m: 'aspect particle (ongoing action or state)' },
    { p: 'zháo', m: 'to touch; to be affected by; to burn; to fall asleep' },
    { p: 'zhuó', m: 'to wear (clothes); to touch; to land' },
    { p: 'zhāo', m: 'move (in chess or checkers); trick; device' },
  ],
  '得': [
    { p: 'de', m: 'structural particle (result or degree complement)' },
    { p: 'dé', m: 'to get; to obtain; to gain; satisfactory' },
    { p: 'děi', m: 'must; to need; to have to' },
  ],
  '了': [
    { p: 'le', m: 'modal particle (completed action or new situation)' },
    { p: 'liǎo', m: 'to finish; to end; to understand; (after verb) able to' },
  ],
  '数': [
    { p: 'shù', m: 'number; figure; several; to count', compounds: ['数字', '数量'] },
    { p: 'shǔ', m: 'to count; to be reckoned as outstanding', compounds: ['数数', '数一数'] },
  ],
  '觉': [
    { p: 'jué', m: 'to feel; to perceive; to be aware of; sense', compounds: ['觉得', '感觉'] },
    { p: 'jiào', m: 'sleep; nap', compounds: ['睡觉', '午觉'] },
  ],
  '看': [
    { p: 'kàn', m: 'to look; to watch; to read; to consider; to visit' },
    { p: 'kān', m: 'to watch over; to guard; to take care of' },
  ],
  '分': [
    { p: 'fēn', m: 'to divide; to separate; minute; fraction; score' },
    { p: 'fèn', m: 'portion; share; duty; part; copy (of document)' },
  ],
  '给': [
    { p: 'gěi', m: 'to give; to allow; for; by' },
    { p: 'jǐ', m: 'to supply; to provide (formal/written)' },
  ],
  '为': [
    { p: 'wéi', m: 'to be; to act as; to serve as; to become' },
    { p: 'wèi', m: 'for; because of; for the sake of; on behalf of' },
  ],
  '难': [
    { p: 'nán', m: 'difficult; hard; problem; hardship' },
    { p: 'nàn', m: 'disaster; calamity; difficulty; to blame' },
  ],
  '假': [
    { p: 'jiǎ', m: 'fake; false; artificial; to borrow; if' },
    { p: 'jià', m: 'vacation; holiday; leave of absence' },
  ],
  '空': [
    { p: 'kōng', m: 'empty; void; sky; air; for nothing' },
    { p: 'kòng', m: 'free time; leisure; spare time; unoccupied' },
  ],
  '种': [
    { p: 'zhǒng', m: 'type; kind; sort; seed; species' },
    { p: 'zhòng', m: 'to plant; to grow; to cultivate' },
  ],
  '发': [
    { p: 'fā', m: 'to send; to emit; to issue; to distribute; to happen', compounds: ['发现', '发展'] },
    { p: 'fà', m: 'hair (on the head)', compounds: ['头发', '理发'] },
  ],
  '教': [
    { p: 'jiāo', m: 'to teach; to instruct', compounds: ['教书', '教课'] },
    { p: 'jiào', m: 'teaching; education; religion; (religious) doctrine', compounds: ['教育', '老师教'] },
  ],
  '调': [
    { p: 'diào', m: 'tune; melody; tone; to transfer; to dispatch' },
    { p: 'tiáo', m: 'to adjust; to regulate; to mediate; to mix' },
  ],
  '当': [
    { p: 'dāng', m: 'to serve as; to be; suitable; just at (time/place)' },
    { p: 'dàng', m: 'proper; timely; to treat as; to regard as; to pawn' },
  ],
  '更': [
    { p: 'gèng', m: 'even more; still more; further; to a greater extent' },
    { p: 'gēng', m: 'to change; to replace; one of five two-hour night watches' },
  ],
  '少': [
    { p: 'shǎo', m: 'few; little; lack; to be missing' },
    { p: 'shào', m: 'young; junior; teenager' },
  ],
  '应': [
    { p: 'yīng', m: 'should; ought to; to agree; to respond' },
    { p: 'yìng', m: 'to answer; to respond; to comply with; to suit' },
  ],
  '差': [
    { p: 'chā', m: 'difference; to differ; discrepancy; error' },
    { p: 'chà', m: 'bad; poor; inferior; to fall short of' },
    { p: 'chāi', m: 'to send on an errand; errand; job; official post' },
  ],
  '朝': [
    { p: 'cháo', m: 'towards; facing; dynasty; imperial court' },
    { p: 'zhāo', m: 'morning; early; day' },
  ],
  '处': [
    { p: 'chǔ', m: 'to deal with; to handle; to get along with; to be in' },
    { p: 'chù', m: 'place; location; department; office' },
  ],
  '便': [
    { p: 'biàn', m: 'convenient; then; informal; bodily waste' },
    { p: 'pián', m: 'cheap; inexpensive' },
  ],
  '模': [
    { p: 'mó', m: 'pattern; standard; model; to imitate' },
    { p: 'mú', m: 'mold; die; matrix' },
  ],
  '间': [
    { p: 'jiān', m: 'between; among; within; room; space' },
    { p: 'jiàn', m: 'gap; interval; to separate; to sow discord' },
  ],
  '传': [
    { p: 'chuán', m: 'to pass on; to spread; to transmit; to conduct' },
    { p: 'zhuàn', m: 'biography; autobiography; chronicle' },
  ],
  '省': [
    { p: 'shěng', m: 'province; to save; to economize; frugal' },
    { p: 'xǐng', m: 'to become aware; to inspect; to visit (elders)' },
  ],
  '背': [
    { p: 'bèi', m: 'back (of body); back side; to memorize; to recite' },
    { p: 'bēi', m: 'to carry on the back; to bear (responsibility)' },
  ],
  '大': [
    { p: 'dà', m: 'big; large; great; major; much' },
    { p: 'dài', m: 'doctor (archaic, in 大夫 dàifu); adult; greatly (archaic)' },
  ],
  '和': [
    { p: 'hé', m: 'and; with; together; harmonious; peace' },
    { p: 'hè', m: 'to respond in singing; to compose a poem in reply' },
    { p: 'huó', m: 'to mix (dough, mortar); to knead' },
    { p: 'huò', m: 'to mix together; to blend' },
  ],
};
