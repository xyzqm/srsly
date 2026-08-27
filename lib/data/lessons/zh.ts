import type { Lesson } from '@/lib/lessons';

/**
 * The Chinese lesson tree — WRITTEN, not sourced, like the others.
 *
 * ── WHY CHINESE GETS A TREE WITHOUT A GRAMMAR TABLE ──
 * CLAUDE.md says a language gets its grammar table before its lesson tree, because explaining
 * the imperfect beside a reader that cannot point one out is half a feature twice. Chinese is
 * the one language where that rule does not apply, and the reason is the same reason it has no
 * table: **Chinese does not inflect.** There is no slot for a form to fill, so there is nothing
 * a `GrammarNote` could report about a word in isolation.
 *
 * Everything that would BE the grammar note in French — what this word is doing here — is
 * carried in Chinese by separate words: 了 and 过 for aspect, 的 for modification, 把 and 被 for
 * who did what to whom, and a measure word between every number and its noun. Those are words
 * the reader can already tap and look up; what they cannot get from a dictionary is what the
 * word is FOR. That is exactly what prose is good at, and it makes the lesson tree the primary
 * way to teach Chinese grammar rather than a supplement to a table.
 *
 * ── THE ONE THING TO GET RIGHT ──
 * Chinese has no tense. It is genuinely absent, not hidden, and the commonest beginner error is
 * to look for one and decide 了 must be a past tense marker. Several lessons here exist to say
 * plainly what 了 is and is not.
 *
 * Every example runs through the REAL segmenter and is checked against the REAL dictionaries by
 * tests/lessons.test.ts — for Chinese, against cedict and the HSK tables, because `segmentZh`
 * deliberately emits bare tokens for the client to resolve.
 */
export const ZH_LESSONS: Lesson[] = [
  {
    id: 'zh-word-order',
    kind: 'grammar',
    title: 'Subject, verb, object',
    summary: 'The backbone, and it barely moves',
    explanation: `Chinese puts the subject first, the verb second and the object third, the same
as English. That is the good news, and it holds for most simple sentences you will read.

What is different is that nothing agrees with anything. A verb does not change for who is doing
it or when it happened. 吃 is "eat", "eats", "ate" and "eating"; the sentence around it supplies
the rest.

So a Chinese sentence is built by ADDING words rather than by changing them. Where English
alters the verb, Chinese puts a separate word somewhere — and the rest of this unit is mostly
about which word goes where.

Time is the one thing that moves to the front. If a sentence says when something happened, that
comes before the verb, usually right after the subject.`,
    examples: [
      { text: '我吃饭。', gloss: 'I eat.',
        tiles: ['我', '吃饭。'] },
      { text: '他喝茶。', gloss: 'He drinks tea.',
        tiles: ['他', '喝茶。'] },
      { text: '我今天买书。', gloss: 'I am buying a book today — the time word comes before the verb.',
        tiles: ['我', '今天', '买', '书。'] },
      { text: '我们明天去学校。', gloss: 'We are going to school tomorrow.',
        tiles: ['我们', '明天', '去', '学校。'] },
    ],
  },
  {
    id: 'zh-measure-words',
    kind: 'grammar',
    title: 'Measure words',
    summary: 'You cannot say "three book" — something must go between',
    explanation: `A number never attaches straight to a noun. Between them goes a measure word,
which classifies the thing being counted.

English does this for some nouns — two slices of bread, three sheets of paper — and Chinese does
it for all of them. 三本书 is "three [volume] book".

个 is the general one and is used with people and with most things that have no special measure
word. It is the one to fall back on when you cannot remember the right one, and it will be
understood.

Some of the common specific ones are worth learning with the noun, the way an article is learned
with a noun in French: 本 for books, 张 for flat things like paper and tables, 只 for many
animals, 杯 for cups of something.

The same rule applies after 这 and 那: 这本书, not 这书.`,
    examples: [
      { text: '三个人。', gloss: 'Three people — 个 is the general measure word.',
        tiles: ['三', '个人。'] },
      { text: '我有两本书。', gloss: 'I have two books — 本 is for books.',
        tiles: ['我', '有', '两', '本', '书。'] },
      { text: '这张纸很大。', gloss: 'This sheet of paper is big — 张 for flat things.',
        tiles: ['这', '张', '纸', '很', '大。'] },
      { text: '她要一杯茶。', gloss: 'She wants a cup of tea.',
        tiles: ['她', '要', '一', '杯', '茶。'] },
    ],
  },
  {
    id: 'zh-de',
    kind: 'grammar',
    title: '的 — the linking particle',
    summary: 'Whose, which kind, what sort',
    explanation: `的 joins a describer to the thing it describes, and the describer always comes
FIRST. 我的书 is "my book"; 红的车 is "the red car".

That covers what English does with an apostrophe, with "of", and with an adjective — one word
for all three.

It also builds long descriptions that English would put after the noun. 我昨天买的书 is "the
book I bought yesterday", and reading it means holding everything before 的 until the noun
arrives. That is the single biggest reading habit to build in Chinese, and it is worth slowing
down for whenever you meet a long stretch that ends in 的.

的 is dropped in two very common cases: with close family and relationships (我妈妈, not 我的妈妈),
and with a one-syllable adjective directly before a noun.`,
    examples: [
      { text: '这是我的书。', gloss: 'This is my book.',
        tiles: ['这', '是', '我', '的', '书。'] },
      { text: '他是我朋友。', gloss: 'He is my friend — 的 is dropped with close relationships.',
        tiles: ['他', '是', '我', '朋友。'] },
      { text: '我昨天买的书很好。', gloss: 'The book I bought yesterday is good.',
        tiles: ['我', '昨天', '买', '的', '书', '很', '好。'] },
    ],
  },
  {
    id: 'zh-shi-you',
    kind: 'grammar',
    title: '是 and 有',
    summary: 'To be, to have — and the adjective that needs neither',
    explanation: `是 links two nouns: X is Y. 我是学生 — I am a student.

有 is "to have", and also "there is". 我有两个孩子 — I have two children.

Here is the part that catches everyone. 是 is NOT used before an adjective. "I am tired" is not
我是累; it is 我很累. The adjective behaves like a verb on its own, and 很 goes in front of it.

很 nominally means "very", but in this position it usually carries no force at all — it is
simply what fills the gap. If you actually mean "very", you stress it or use a stronger word.

The negative of 有 is irregular and worth memorising on its own: it is 没有, never 不有.`,
    examples: [
      { text: '我是学生。', gloss: 'I am a student — 是 between two nouns.',
        tiles: ['我', '是', '学生。'] },
      { text: '我很累。', gloss: 'I am tired — an adjective needs no 是.',
        tiles: ['我', '很', '累。'] },
      { text: '我有两个孩子。', gloss: 'I have two children.',
        tiles: ['我', '有', '两', '个', '孩子。'] },
      { text: '我没有钱。', gloss: 'I have no money — 有 negates with 没.',
        tiles: ['我', '没有', '钱。'] },
    ],
  },
  {
    id: 'zh-negation',
    kind: 'grammar',
    title: '不 and 没 — two ways to say no',
    summary: 'Which one you use says when it happened',
    explanation: `Chinese has two negatives and they are not interchangeable.

不 negates the present and the future, and everything habitual: what you do not do, will not do,
or do not want to. 我不喝咖啡 — I do not drink coffee.

没 negates the past: something did not happen. 我没喝咖啡 — I did not drink the coffee.

So in a language with no tense, the choice of negative is one of the clearest signals of time
there is. That is worth noticing while reading: 不 and 没 tell you when, and often nothing else
in the sentence does.

有 is the exception that proves it: it always takes 没, whatever the time.`,
    examples: [
      { text: '我不喝咖啡。', gloss: 'I do not drink coffee — a habit, so 不.',
        tiles: ['我', '不', '喝', '咖啡。'] },
      { text: '我没喝咖啡。', gloss: 'I did not drink the coffee — it did not happen, so 没.',
        tiles: ['我', '没', '喝', '咖啡。'] },
      { text: '他不去。', gloss: 'He is not going.',
        tiles: ['他', '不', '去。'] },
      { text: '他没去。', gloss: 'He did not go.',
        tiles: ['他', '没', '去。'] },
    ],
  },
  {
    id: 'zh-le',
    kind: 'grammar',
    title: '了 is not a past tense',
    summary: 'It marks completion, and that is a different thing',
    explanation: `This is the single most important thing to understand about Chinese, and the
easiest to get wrong, because 了 so often turns up where English would use a past tense.

了 after a verb says the action is COMPLETE. That completion is usually in the past, which is why
the two look alike — but not always: 我吃了饭就去 is "I will go once I have eaten", and the
eating has not happened yet.

Equally, plenty of past sentences carry no 了 at all. Describing what things were like, or what
you used to do, needs none: 我以前住在北京 is "I used to live in Beijing", with no 了 anywhere.

A second 了 at the END of a sentence is doing a different job: it marks a change, a new state.
他高了 is "he has got taller".

If you take one thing from this lesson: Chinese has no tense, and looking for one is what makes
了 confusing.`,
    examples: [
      { text: '我吃了饭。', gloss: 'I have eaten — the action is complete.',
        tiles: ['我', '吃', '了', '饭。'] },
      { text: '我以前住在北京。', gloss: 'I used to live in Beijing — past, and no 了.',
        tiles: ['我', '以前', '住', '在', '北京。'] },
      { text: '他高了。', gloss: 'He has got taller — 了 at the end marks a change.',
        tiles: ['他', '高', '了。'] },
      { text: '我买了三本书。', gloss: 'I bought three books.',
        tiles: ['我', '买', '了', '三', '本', '书。'] },
    ],
  },
  {
    id: 'zh-guo',
    kind: 'grammar',
    title: '过 — have you ever',
    summary: 'Experience, not completion',
    explanation: `过 after a verb says you have had the experience of doing something at some
point. It is the "have you ever…?" of Chinese.

我去过中国 — I have been to China. It says nothing about when, and it does not say you are there
now; if anything it implies you are not.

The contrast with 了 is the useful part. 我吃了 says the eating is finished — probably just now.
我吃过 says I have eaten that before, at some unspecified time.

The negative uses 没 and, unusually, keeps 过: 我没去过 — I have never been.`,
    examples: [
      { text: '我去过中国。', gloss: 'I have been to China.',
        tiles: ['我去', '过', '中国。'] },
      { text: '你吃过中国菜吗？', gloss: 'Have you ever eaten Chinese food?',
        tiles: ['你', '吃', '过', '中国菜', '吗？'] },
      { text: '我没去过。', gloss: 'I have never been — 没 keeps the 过.',
        tiles: ['我', '没', '去', '过。'] },
    ],
  },
  {
    id: 'zh-zai',
    kind: 'grammar',
    title: '在 — where, and right now',
    summary: 'One word doing two jobs',
    explanation: `在 before a place means "at" or "in": 我在家 — I am at home.

Before a VERB, the same word means the action is going on right now: 我在吃饭 — I am eating.

Both readings come from the same idea, of being at something, and in practice the position tells
you which one you are looking at: a place after 在 is location, a verb after 在 is in progress.

When a sentence has both a place and an action, the place comes FIRST — before the verb, not
after it. 我在家吃饭 is "I eat at home". Putting the place after the verb, as English does, is
one of the most persistent beginner habits.`,
    examples: [
      { text: '我在家。', gloss: 'I am at home — 在 with a place.',
        tiles: ['我', '在家。'] },
      { text: '我在吃饭。', gloss: 'I am eating — 在 with a verb, happening now.',
        tiles: ['我', '在', '吃饭。'] },
      { text: '我在家吃饭。', gloss: 'I eat at home — the place goes before the verb.',
        tiles: ['我', '在家', '吃饭。'] },
    ],
  },
  {
    id: 'zh-questions',
    kind: 'grammar',
    title: 'Asking a question',
    summary: '吗, or the word order that does not change',
    explanation: `The easiest way to ask a question is to add 吗 to the end of a statement and
change nothing else. 你是学生 becomes 你是学生吗？

The second way is to offer both options: verb, then negative, then verb again. 你是不是学生？
means the same thing and sounds a little more direct.

With a question WORD — 谁, 什么, 哪儿, 什么时候, 为什么, 怎么, 几, 多少 — the word order does
not change at all. The question word simply sits where the answer would go. "You are eating
what?" is exactly how it is built, and there is no fronting to do.

That is worth practising, because English speakers instinctively move the question word to the
front and Chinese never does.

Do not use 吗 with a question word; one signal is enough.`,
    examples: [
      { text: '你是学生吗？', gloss: 'Are you a student?',
        tiles: ['你', '是', '学生', '吗？'] },
      { text: '你吃什么？', gloss: 'What are you eating? — the question word stays in place.',
        tiles: ['你', '吃', '什么？'] },
      { text: '他去哪儿？', gloss: 'Where is he going?',
        tiles: ['他', '去', '哪儿？'] },
      { text: '你有几本书？', gloss: 'How many books do you have? — 几 still takes a measure word.',
        tiles: ['你', '有', '几', '本', '书？'] },
    ],
  },
  {
    id: 'zh-adjectives',
    kind: 'grammar',
    title: 'Adjectives are verbs',
    summary: 'And comparing needs no special ending',
    explanation: `A Chinese adjective does not need a verb in front of it, because it behaves
like one already. 这本书很好 is a complete sentence: "this book is good".

Nothing agrees, so an adjective never changes for number or gender. There is only ever one form.

To compare, use 比 between the two things: A 比 B adjective. 我比他高 — I am taller than him.
There is no ending to add and no "than" to translate separately, and crucially 很 drops out when
you compare, because the comparison is doing that work.

To say two things are the same, use 一样: 这本书和那本书一样。`,
    examples: [
      { text: '这本书很好。', gloss: 'This book is good — no verb needed.',
        tiles: ['这', '本', '书', '很', '好。'] },
      { text: '我比他高。', gloss: 'I am taller than him — 比 compares, and 很 drops out.',
        tiles: ['我', '比', '他', '高。'] },
      { text: '今天比昨天冷。', gloss: 'Today is colder than yesterday.',
        tiles: ['今天', '比', '昨天', '冷。'] },
    ],
  },
  {
    id: 'zh-ba',
    kind: 'grammar',
    title: '把 — moving the object forward',
    summary: 'For when something is done TO something',
    explanation: `Normally the object follows the verb. 把 lets you move it in front instead, and
it is used when the verb does something definite to that object — moves it, changes it, finishes
it.

我把书放在桌子上 — I put the book on the table.

Two conditions have to hold, and they explain most of the times 把 would be wrong. The object
must be specific, something already known rather than any old one; and the verb cannot stand
bare — something must follow it saying what happened, such as a place, a result, or 了.

You will meet 把 constantly in instructions and in anything describing rearranging the world,
which is why it is worth recognising even before you produce it.`,
    examples: [
      { text: '我把书放在桌子上。', gloss: 'I put the book on the table.',
        tiles: ['我', '把', '书', '放', '在', '桌子', '上。'] },
      { text: '他把门开了。', gloss: 'He opened the door — 了 completes the verb.',
        tiles: ['他', '把门', '开', '了。'] },
      { text: '请把钱给我。', gloss: 'Please give me the money.',
        tiles: ['请', '把', '钱', '给', '我。'] },
    ],
  },
  {
    id: 'zh-bei',
    kind: 'grammar',
    title: '被 — the passive',
    summary: 'Used far less than the English passive',
    explanation: `被 marks the passive: the subject is on the receiving end. 书被他拿走了 — the
book was taken away by him.

The doer can be left out entirely if it is unknown or unimportant: 书被拿走了.

The thing to know is that Chinese uses this far less than English does. A plain active sentence
covers most of what English would turn passive, and 被 has traditionally carried a flavour of
something unwelcome happening to you — less strongly now than it once did, but enough that it is
not the neutral construction English speakers reach for.

As with 把, the verb needs something after it rather than standing bare.`,
    examples: [
      { text: '书被他拿走了。', gloss: 'The book was taken away by him.',
        tiles: ['书', '被', '他', '拿走', '了。'] },
      { text: '我的车被人开走了。', gloss: 'My car was driven away by someone.',
        tiles: ['我', '的', '车', '被', '人', '开走', '了。'] },
      { text: '门被打开了。', gloss: 'The door was opened — the doer is left out.',
        tiles: ['门', '被', '打开', '了。'] },
    ],
  },
  {
    id: 'zh-modals',
    kind: 'grammar',
    title: '会, 能 and 可以',
    summary: 'Three words for "can", and they are not interchangeable',
    explanation: `English uses "can" for three different ideas. Chinese separates them, and using
the wrong one is one of the most audible beginner mistakes.

会 is a learned skill — something you know how to do. 我会说中文 — I can speak Chinese.

能 is physical ability or circumstance — whether you are ABLE to right now. 我今天不能来 — I
cannot come today.

可以 is permission — whether you are allowed. 我可以进来吗 — may I come in?

会 also does the future in the sense of "will, is likely to": 明天会下雨 — it will rain tomorrow.
That is the same word doing a second job, and context separates them cleanly.

All three negate with 不, never 没.`,
    examples: [
      { text: '我会说中文。', gloss: 'I can speak Chinese — a learned skill.',
        tiles: ['我', '会', '说', '中文。'] },
      { text: '我今天不能来。', gloss: 'I cannot come today — circumstance.',
        tiles: ['我', '今天', '不能', '来。'] },
      { text: '我可以进来吗？', gloss: 'May I come in? — permission.',
        tiles: ['我', '可以', '进来', '吗？'] },
      { text: '明天会下雨。', gloss: 'It will rain tomorrow — 会 for likelihood.',
        tiles: ['明天', '会', '下雨。'] },
    ],
  },
  {
    id: 'zh-resultative',
    kind: 'grammar',
    title: 'Saying how it turned out',
    summary: 'A second verb glued on says whether it worked',
    explanation: `Chinese verbs often say only that an action was attempted. What happened as a
result is carried by a second syllable stuck straight onto the verb.

看 is to look; 看见 is to look AND see. 听 is to listen; 听懂 is to listen and understand. 找 is
to look for; 找到 is to find.

That distinction has no English equivalent, and it is why 我看了 can be "I looked" while 我看见了
is "I saw". A sentence that feels oddly incomplete in translation is often missing this.

The common results are worth learning as a small set: 见 for perceiving, 到 for reaching, 懂 for
understanding, 完 for finishing, 好 for doing properly.

To say it did NOT work, 不 goes between the two parts: 看不见 — cannot see.`,
    examples: [
      { text: '我看见他了。', gloss: 'I saw him — 见 says the looking succeeded.',
        tiles: ['我', '看见', '他', '了。'] },
      { text: '我听懂了。', gloss: 'I understood — 懂 says the listening landed.',
        tiles: ['我', '听懂', '了。'] },
      { text: '我看不见。', gloss: 'I cannot see — 不 goes inside.',
        tiles: ['我', '看不见。'] },
      { text: '我吃完了。', gloss: 'I have finished eating.',
        tiles: ['我', '吃', '完了。'] },
    ],
  },
  {
    id: 'zh-duration',
    kind: 'grammar',
    title: 'How long, and how often',
    summary: 'Duration goes AFTER the verb, unlike when',
    explanation: `A time POINT — when something happened — goes before the verb: 我三点去.

A DURATION — how long it lasted — goes after it: 我住了三年 — I lived there three years.

That split is the whole rule, and it is the opposite of what English speakers expect, because
English puts both at the end.

When the verb has an object as well, the verb is repeated: 我学中文学了三年 — I studied Chinese
for three years. Alternatively the duration slots between verb and object: 我学了三年中文.

Both are correct and both are common; the second is shorter and easier to say.`,
    examples: [
      { text: '我三点去。', gloss: 'I am going at three — a time point, before the verb.',
        tiles: ['我', '三', '点', '去。'] },
      { text: '我住了三年。', gloss: 'I lived there for three years — duration, after the verb.',
        tiles: ['我', '住', '了', '三', '年。'] },
      { text: '我学了三年中文。', gloss: 'I studied Chinese for three years.',
        tiles: ['我', '学', '了', '三', '年', '中文。'] },
    ],
  },
  {
    id: 'zh-jiu-cai',
    kind: 'grammar',
    title: '就 and 才',
    summary: 'Two tiny words carrying an opinion about timing',
    explanation: `These two look like they mean "then" and "only", and what they actually carry
is the speaker's judgement about whether something was early or late.

就 says it happened sooner, more easily, or more readily than expected. 他八点就来了 — he came
at eight already.

才 says it happened later, or took more than expected. 他八点才来 — he did not come until eight.

Same time, same sentence shape, opposite feeling. That is why a sentence can read as neutral in
translation and carry a clear attitude in Chinese, and it is worth noticing while reading rather
than producing at first.

就 also links a condition to its result: 你来我就走 — if you come, I will go.`,
    examples: [
      { text: '他八点就来了。', gloss: 'He came at eight already — sooner than expected.',
        tiles: ['他', '八', '点', '就', '来', '了。'] },
      { text: '他八点才来。', gloss: 'He did not come until eight — later than expected.',
        tiles: ['他', '八', '点', '才', '来。'] },
      { text: '我很快就回来。', gloss: 'I will be back very soon.',
        tiles: ['我', '很', '快', '就', '回来。'] },
    ],
  },
  {
    id: 'zh-directional',
    kind: 'grammar',
    title: '来 and 去 on the end of a verb',
    summary: 'Which way the action moves, relative to the speaker',
    explanation: `来 and 去 attach to a movement verb to say which way it went relative to whoever
is speaking. 来 is toward the speaker; 去 is away.

进来 — come in (I am inside). 进去 — go in (I am outside). The verb is the same; only the
viewpoint changes.

This pairs with 上, 下, 出, 回, 过 to give the everyday set: 出来, 回去, 上来, 过来.

An object usually sits between the two parts: 拿出来 becomes 拿出书来 when a book is involved,
which is worth recognising because the two halves end up far apart on the page.

It is one of the clearest cases where Chinese encodes something English leaves to context.`,
    examples: [
      { text: '请进来。', gloss: 'Please come in — toward the speaker.',
        tiles: ['请', '进来。'] },
      { text: '他进去了。', gloss: 'He went in — away from the speaker.',
        tiles: ['他', '进去', '了。'] },
      { text: '我明天回去。', gloss: 'I am going back tomorrow.',
        tiles: ['我', '明天', '回去。'] },
    ],
  },
  {
    id: 'zh-zhe',
    kind: 'grammar',
    title: '着 — a state that is holding',
    summary: 'Not the same "-ing" as 在',
    explanation: `着 after a verb says a state is being MAINTAINED, which is close to but not the
same as 在.

在 is an action in progress: 他在开门 — he is opening the door.
着 is the state that action left behind: 门开着 — the door is open, and staying open.

The clearest pairs are verbs of position. 他站着 is he is standing — not standing up, but in a
standing state. 我拿着书 is I am holding a book.

It also links two verbs where one describes how the other is done: 他笑着说 — he said it
smiling.

Because English uses "-ing" for both, this is one of the places where translation hides a
distinction Chinese draws clearly.`,
    examples: [
      { text: '门开着。', gloss: 'The door is open — a state that is holding.',
        tiles: ['门', '开', '着。'] },
      { text: '他站着。', gloss: 'He is standing.',
        tiles: ['他', '站', '着。'] },
      { text: '我拿着书。', gloss: 'I am holding a book.',
        tiles: ['我', '拿', '着', '书。'] },
    ],
  },
  {
    id: 'zh-yao-xiang',
    kind: 'grammar',
    title: '要, 想 and 打算',
    summary: 'Want, would like, and plan to',
    explanation: `Three words that all touch "want", separated by how firm the intention is.

想 is the softest — would like to, feel like. 我想去 — I would like to go.
要 is firmer — want to, going to, and often simply will. 我要去 — I am going.
打算 is a plan you have made. 我打算明年去中国.

要 has a second everyday job as plain "want" with an object: 我要一杯茶 — I want a cup of tea.
In a shop that is normal rather than blunt.

The negative is where it gets interesting: the negative of 要 is usually 不想, not 不要. 不要 is
a command meaning "don't", so 不要走 is "don't go", not "I don't want to go".`,
    examples: [
      { text: '我想去中国。', gloss: 'I would like to go to China.',
        tiles: ['我', '想', '去', '中国。'] },
      { text: '我要一杯茶。', gloss: 'I want a cup of tea.',
        tiles: ['我', '要', '一', '杯', '茶。'] },
      { text: '不要走。', gloss: "Don't go — 不要 is a command, not a refusal.",
        tiles: ['不要', '走。'] },
    ],
  },
  {
    id: 'zh-time-words',
    kind: 'grammar',
    title: 'Telling the time and the date',
    summary: 'Chinese goes from the largest unit to the smallest',
    explanation: `Every Chinese date and time runs biggest first: year, month, day, then part of
day, then hour. English does almost the reverse, which is why dates feel backwards at first.

二零二五年八月十二号 — 2025, August, 12th.

The units are simply the number plus a word: 年 for year, 月 for month, 号 or 日 for day of the
month. Months are numbered, so August is literally "eight month" — no vocabulary to learn.

The same order governs place: 中国北京 puts the country before the city, and an address runs
from province down to house number.

For clock time, 点 is the hour and 分 the minute: 三点十五分. 半 is half past.`,
    examples: [
      { text: '今天八月十二号。', gloss: 'Today is the twelfth of August.',
        tiles: ['今天', '八月', '十', '二号。'] },
      { text: '我三点去。', gloss: 'I am going at three.',
        tiles: ['我', '三', '点', '去。'] },
      { text: '他明天早上来。', gloss: 'He is coming tomorrow morning — the bigger unit first.',
        tiles: ['他', '明天', '早上', '来。'] },
    ],
  },
  {
    id: 'zh-yinwei',
    kind: 'grammar',
    title: 'Joining two ideas',
    summary: 'Chinese uses BOTH halves where English uses one',
    explanation: `English drops half of most linking pairs: we say "because it rained, I stayed
home", never "because… so…". Chinese keeps both.

因为…所以… — because, so.
虽然…但是… — although, but.
如果…就… — if, then.

我因为很忙所以没去 — because I was busy, I did not go. Leaving out 所以 is not wrong, but the
pair is extremely common and sounds complete.

The one that trips English speakers is 虽然…但是…, because "although… but…" feels ungrammatical
in English. In Chinese it is simply how the pair works.

Both halves attach to their own clause, and the second word goes AFTER the subject rather than
at the very front.`,
    examples: [
      { text: '因为下雨，所以我没去。', gloss: 'Because it rained, I did not go.',
        tiles: ['因为', '下雨，', '所以', '我', '没', '去。'] },
      { text: '虽然很累，但是我很高兴。', gloss: 'Although I am tired, I am happy.',
        tiles: ['虽然', '很', '累，', '但是', '我', '很', '高兴。'] },
      { text: '如果你来，我就走。', gloss: 'If you come, I will go.',
        tiles: ['如果', '你', '来，', '我', '就', '走。'] },
    ],
  },
  {
    id: 'zh-ne-ba',
    kind: 'grammar',
    title: '吗, 呢 and 吧',
    summary: 'Three sentence-final particles that change the whole tone',
    explanation: `These sit at the very end and do a job English does with intonation or with a
tag question.

吗 turns a statement into a plain yes-no question. 你是学生吗？

呢 asks the same question back, or asks where something is. 我很好，你呢？ — I am fine, and you?
It also softens a question about an ongoing situation.

吧 is a suggestion or a guess. 我们走吧 — let's go. 你是学生吧？ — you're a student, right?

The difference between 吗 and 吧 is worth feeling: 吗 asks with no assumption, 吧 asks while
already expecting the answer to be yes.

Because they carry tone rather than meaning, they are easy to skim past while reading and are
often the only thing telling you the sentence was a suggestion rather than an order.`,
    examples: [
      { text: '你是学生吗？', gloss: 'Are you a student? — a plain question.',
        tiles: ['你', '是', '学生', '吗？'] },
      { text: '我很好，你呢？', gloss: 'I am fine, and you?',
        tiles: ['我', '很', '好，', '你', '呢？'] },
      { text: '我们走吧。', gloss: "Let's go — a suggestion.",
        tiles: ['我们', '走', '吧。'] },
    ],
  },
  {
    id: 'zh-dou-ye',
    kind: 'grammar',
    title: '都 and 也',
    summary: 'Both go BEFORE the verb, never at the end',
    explanation: `都 means "all" or "both", and 也 means "also". Both are adverbs, so both sit
between the subject and the verb — never at the end of the sentence where English puts them.

我们都去 — we are all going. 我也去 — I am going too.

都 refers BACKWARD, to whatever came before it. That is why 我们都很好 is "we are all fine" but
you cannot use 都 to mean "all" about something that has not been mentioned yet.

With a question word, 都 makes it universal: 什么都 — everything, anything. 谁都 — everyone.
Paired with a negative it becomes the opposite: 我什么都不知道 — I know nothing at all.

Putting either word at the end is one of the most recognisable beginner mistakes, precisely
because English trains the habit.`,
    examples: [
      { text: '我们都去。', gloss: 'We are all going — 都 before the verb.',
        tiles: ['我们', '都', '去。'] },
      { text: '我也去。', gloss: 'I am going too.',
        tiles: ['我', '也', '去。'] },
      { text: '我什么都不知道。', gloss: 'I know nothing at all.',
        tiles: ['我', '什么', '都', '不', '知道。'] },
    ],
  },
  { id: 'zh-v-numbers', kind: 'vocab', theme: 'numbers',
    title: 'Numbers', summary: 'Counting, prices, dates, ages' },
  { id: 'zh-v-basics',  kind: 'vocab', theme: 'basics',
    title: 'Everyday words', summary: 'The small words that hold sentences together' },
  { id: 'zh-v-family', kind: 'vocab', theme: 'family',
    title: 'Family', summary: 'The people you describe first' },
  { id: 'zh-v-body',   kind: 'vocab', theme: 'body',
    title: 'The body', summary: 'For the doctor, and for everything that hurts' },
  { id: 'zh-v-routine', kind: 'vocab', theme: 'routine',
    title: 'Daily routine', summary: 'The verbs of an ordinary day' },
  { id: 'zh-v-verbs',   kind: 'vocab', theme: 'verbs',
    title: 'Common verbs', summary: 'The ones that turn up in every other sentence' },
  { id: 'zh-v-weekdays', kind: 'vocab', theme: 'weekdays',
    title: 'Days of the week', summary: 'Numbered, which makes them easy' },
  { id: 'zh-v-places',    kind: 'vocab', theme: 'places',
    title: 'Places in town', summary: 'Where you are going and how to ask for it' },
  { id: 'zh-v-transport', kind: 'vocab', theme: 'transport',
    title: 'Getting around', summary: 'On foot, by bus, by train' },
  { id: 'zh-v-adjectives', kind: 'vocab', theme: 'adjectives',
    title: 'Describing words', summary: 'Big, small, new, old, fast, slow' },
  { id: 'zh-v-colours',    kind: 'vocab', theme: 'colours',
    title: 'Colours', summary: 'And how they attach to nouns' },
  { id: 'zh-v-house',      kind: 'vocab', theme: 'house',
    title: 'The house', summary: 'Rooms, furniture, the things in them' },
  { id: 'zh-v-weather',    kind: 'vocab', theme: 'weather',
    title: 'Weather', summary: 'The most reliable small talk there is' },
  { id: 'zh-v-food',       kind: 'vocab', theme: 'food',
    title: 'Food and drink', summary: 'Enough to order, shop and cook' },
  { id: 'zh-v-school', kind: 'vocab', theme: 'school',
    title: 'School', summary: 'Classroom words, and the things on a desk' },
  { id: 'zh-v-clothing', kind: 'vocab', theme: 'clothing',
    title: 'Clothes', summary: 'What you are wearing and what you are buying' },
  { id: 'zh-v-animals',  kind: 'vocab', theme: 'animals',
    title: 'Animals', summary: 'And the measure words they take' },
  { id: 'zh-v-months',   kind: 'vocab', theme: 'months',
    title: 'Months', summary: 'Numbered, like the weekdays' },
  { id: 'zh-v-everyday', kind: 'vocab', theme: 'everyday',
    title: 'Everyday life', summary: 'Birthdays, names, friends, time and money' },
  { id: 'zh-v-tableware', kind: 'vocab', theme: 'tableware',
    title: 'At the table', summary: 'Bowls, cups, chopsticks and spoons' },
  { id: 'zh-v-seasons',   kind: 'vocab', theme: 'seasons',
    title: 'Seasons', summary: 'Four words that turn up constantly' },
];
