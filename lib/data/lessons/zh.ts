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
  // ── Unit 1 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'zh-word-order',
    unit: 'How a sentence is built',
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
      { text: '我吃饭。', gloss: 'I eat.' },
      { text: '他喝茶。', gloss: 'He drinks tea.' },
      { text: '我今天买书。', gloss: 'I am buying a book today — the time word comes before the verb.' },
      { text: '我们明天去学校。', gloss: 'We are going to school tomorrow.' },
    ],
  },
  {
    id: 'zh-measure-words',
    unit: 'How a sentence is built',
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
      { text: '三个人。', gloss: 'Three people — 个 is the general measure word.' },
      { text: '我有两本书。', gloss: 'I have two books — 本 is for books.' },
      { text: '这张纸很大。', gloss: 'This sheet of paper is big — 张 for flat things.' },
      { text: '她要一杯茶。', gloss: 'She wants a cup of tea.' },
    ],
  },
  {
    id: 'zh-de',
    unit: 'How a sentence is built',
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
      { text: '这是我的书。', gloss: 'This is my book.' },
      { text: '他是我朋友。', gloss: 'He is my friend — 的 is dropped with close relationships.' },
      { text: '我昨天买的书很好。', gloss: 'The book I bought yesterday is good.' },
    ],
  },
  { id: 'zh-v-numbers', unit: 'How a sentence is built', kind: 'vocab', theme: 'numbers',
    title: 'Numbers', summary: 'Counting, prices, dates, ages' },
  { id: 'zh-v-basics',  unit: 'How a sentence is built', kind: 'vocab', theme: 'basics',
    title: 'Everyday words', summary: 'The small words that hold sentences together' },

  // ── Unit 2 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'zh-shi-you',
    unit: 'Being and having',
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
      { text: '我是学生。', gloss: 'I am a student — 是 between two nouns.' },
      { text: '我很累。', gloss: 'I am tired — an adjective needs no 是.' },
      { text: '我有两个孩子。', gloss: 'I have two children.' },
      { text: '我没有钱。', gloss: 'I have no money — 有 negates with 没.' },
    ],
  },
  {
    id: 'zh-negation',
    unit: 'Being and having',
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
      { text: '我不喝咖啡。', gloss: 'I do not drink coffee — a habit, so 不.' },
      { text: '我没喝咖啡。', gloss: 'I did not drink the coffee — it did not happen, so 没.' },
      { text: '他不去。', gloss: 'He is not going.' },
      { text: '他没去。', gloss: 'He did not go.' },
    ],
  },
  { id: 'zh-v-family', unit: 'Being and having', kind: 'vocab', theme: 'family',
    title: 'Family', summary: 'The people you describe first' },
  { id: 'zh-v-body',   unit: 'Being and having', kind: 'vocab', theme: 'body',
    title: 'The body', summary: 'For the doctor, and for everything that hurts' },

  // ── Unit 3 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'zh-le',
    unit: 'When things happen',
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
      { text: '我吃了饭。', gloss: 'I have eaten — the action is complete.' },
      { text: '我以前住在北京。', gloss: 'I used to live in Beijing — past, and no 了.' },
      { text: '他高了。', gloss: 'He has got taller — 了 at the end marks a change.' },
      { text: '我买了三本书。', gloss: 'I bought three books.' },
    ],
  },
  {
    id: 'zh-guo',
    unit: 'When things happen',
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
      { text: '我去过中国。', gloss: 'I have been to China.' },
      { text: '你吃过中国菜吗？', gloss: 'Have you ever eaten Chinese food?' },
      { text: '我没去过。', gloss: 'I have never been — 没 keeps the 过.' },
    ],
  },
  {
    id: 'zh-zai',
    unit: 'When things happen',
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
      { text: '我在家。', gloss: 'I am at home — 在 with a place.' },
      { text: '我在吃饭。', gloss: 'I am eating — 在 with a verb, happening now.' },
      { text: '我在家吃饭。', gloss: 'I eat at home — the place goes before the verb.' },
    ],
  },
  { id: 'zh-v-routine', unit: 'When things happen', kind: 'vocab', theme: 'routine',
    title: 'Daily routine', summary: 'The verbs of an ordinary day' },
  { id: 'zh-v-verbs',   unit: 'When things happen', kind: 'vocab', theme: 'verbs',
    title: 'Common verbs', summary: 'The ones that turn up in every other sentence' },
  { id: 'zh-v-weekdays', unit: 'When things happen', kind: 'vocab', theme: 'weekdays',
    title: 'Days of the week', summary: 'Numbered, which makes them easy' },

  // ── Unit 4 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'zh-questions',
    unit: 'Asking',
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
      { text: '你是学生吗？', gloss: 'Are you a student?' },
      { text: '你吃什么？', gloss: 'What are you eating? — the question word stays in place.' },
      { text: '他去哪儿？', gloss: 'Where is he going?' },
      { text: '你有几本书？', gloss: 'How many books do you have? — 几 still takes a measure word.' },
    ],
  },
  { id: 'zh-v-places',    unit: 'Asking', kind: 'vocab', theme: 'places',
    title: 'Places in town', summary: 'Where you are going and how to ask for it' },
  { id: 'zh-v-transport', unit: 'Asking', kind: 'vocab', theme: 'transport',
    title: 'Getting around', summary: 'On foot, by bus, by train' },

  // ── Unit 5 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'zh-adjectives',
    unit: 'Describing',
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
      { text: '这本书很好。', gloss: 'This book is good — no verb needed.' },
      { text: '我比他高。', gloss: 'I am taller than him — 比 compares, and 很 drops out.' },
      { text: '今天比昨天冷。', gloss: 'Today is colder than yesterday.' },
    ],
  },
  { id: 'zh-v-adjectives', unit: 'Describing', kind: 'vocab', theme: 'adjectives',
    title: 'Describing words', summary: 'Big, small, new, old, fast, slow' },
  { id: 'zh-v-colours',    unit: 'Describing', kind: 'vocab', theme: 'colours',
    title: 'Colours', summary: 'And how they attach to nouns' },
  { id: 'zh-v-house',      unit: 'Describing', kind: 'vocab', theme: 'house',
    title: 'The house', summary: 'Rooms, furniture, the things in them' },
  { id: 'zh-v-weather',    unit: 'Describing', kind: 'vocab', theme: 'weather',
    title: 'Weather', summary: 'The most reliable small talk there is' },
  { id: 'zh-v-food',       unit: 'Describing', kind: 'vocab', theme: 'food',
    title: 'Food and drink', summary: 'Enough to order, shop and cook' },

  // ── Unit 6 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'zh-ba',
    unit: 'Doing things to things',
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
      { text: '我把书放在桌子上。', gloss: 'I put the book on the table.' },
      { text: '他把门开了。', gloss: 'He opened the door — 了 completes the verb.' },
      { text: '请把钱给我。', gloss: 'Please give me the money.' },
    ],
  },
  {
    id: 'zh-bei',
    unit: 'Doing things to things',
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
      { text: '书被他拿走了。', gloss: 'The book was taken away by him.' },
      { text: '我的车被人开走了。', gloss: 'My car was driven away by someone.' },
      { text: '门被打开了。', gloss: 'The door was opened — the doer is left out.' },
    ],
  },
  { id: 'zh-v-school', unit: 'Doing things to things', kind: 'vocab', theme: 'school',
    title: 'School', summary: 'Classroom words, and the things on a desk' },
  { id: 'zh-v-clothing', unit: 'Doing things to things', kind: 'vocab', theme: 'clothing',
    title: 'Clothes', summary: 'What you are wearing and what you are buying' },
  { id: 'zh-v-animals',  unit: 'Doing things to things', kind: 'vocab', theme: 'animals',
    title: 'Animals', summary: 'And the measure words they take' },
  { id: 'zh-v-months',   unit: 'Doing things to things', kind: 'vocab', theme: 'months',
    title: 'Months', summary: 'Numbered, like the weekdays' },
  { id: 'zh-v-everyday', unit: 'Doing things to things', kind: 'vocab', theme: 'everyday',
    title: 'Everyday life', summary: 'Birthdays, names, friends, time and money' },

  // ── Unit 7 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'zh-modals',
    unit: 'Beyond the basics',
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
      { text: '我会说中文。', gloss: 'I can speak Chinese — a learned skill.' },
      { text: '我今天不能来。', gloss: 'I cannot come today — circumstance.' },
      { text: '我可以进来吗？', gloss: 'May I come in? — permission.' },
      { text: '明天会下雨。', gloss: 'It will rain tomorrow — 会 for likelihood.' },
    ],
  },
  {
    id: 'zh-resultative',
    unit: 'Beyond the basics',
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
      { text: '我看见他了。', gloss: 'I saw him — 见 says the looking succeeded.' },
      { text: '我听懂了。', gloss: 'I understood — 懂 says the listening landed.' },
      { text: '我看不见。', gloss: 'I cannot see — 不 goes inside.' },
      { text: '我吃完了。', gloss: 'I have finished eating.' },
    ],
  },
  {
    id: 'zh-duration',
    unit: 'Beyond the basics',
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
      { text: '我三点去。', gloss: 'I am going at three — a time point, before the verb.' },
      { text: '我住了三年。', gloss: 'I lived there for three years — duration, after the verb.' },
      { text: '我学了三年中文。', gloss: 'I studied Chinese for three years.' },
    ],
  },
  {
    id: 'zh-jiu-cai',
    unit: 'Beyond the basics',
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
      { text: '他八点就来了。', gloss: 'He came at eight already — sooner than expected.' },
      { text: '他八点才来。', gloss: 'He did not come until eight — later than expected.' },
      { text: '我很快就回来。', gloss: 'I will be back very soon.' },
    ],
  },
  {
    id: 'zh-directional',
    unit: 'Beyond the basics',
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
      { text: '请进来。', gloss: 'Please come in — toward the speaker.' },
      { text: '他进去了。', gloss: 'He went in — away from the speaker.' },
      { text: '我明天回去。', gloss: 'I am going back tomorrow.' },
    ],
  },
  { id: 'zh-v-tableware', unit: 'Beyond the basics', kind: 'vocab', theme: 'tableware',
    title: 'At the table', summary: 'Bowls, cups, chopsticks and spoons' },
  { id: 'zh-v-seasons',   unit: 'Beyond the basics', kind: 'vocab', theme: 'seasons',
    title: 'Seasons', summary: 'Four words that turn up constantly' },
];
