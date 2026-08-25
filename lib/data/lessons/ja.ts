import type { Lesson } from '@/lib/lessons';

/**
 * The Japanese lesson tree — WRITTEN, not sourced, like the others.
 *
 * ── WHAT MAKES JAPANESE DIFFERENT FROM THE OTHER THREE ──
 * French and Spanish put the grammar INSIDE the word, which is why they get a grammar table and
 * a note under the definition. Chinese puts it in separate words and word order. Japanese does
 * both at once: it glues endings onto verbs and adjectives AND marks every role in the sentence
 * with a particle. So a Japanese lesson tree has to teach two systems, and the particles come
 * first — they are what makes a sentence parseable at all.
 *
 * There is no grammar note in the reader for Japanese yet. kuromoji already resolves a
 * conjugated verb to its dictionary form at segmentation time, so the popup shows 使う when you
 * tap 使っています; what it does not yet say is that you are looking at a polite present
 * progressive. That would be a third design rather than a third table, which is why it is not
 * done here — see components/read/GrammarNote.tsx.
 *
 * Every example is checked against the REAL dictionary through the REAL segmenter (kuromoji) by
 * tests/lessons.test.ts.
 */
export const JA_LESSONS: Lesson[] = [
  // ── Unit 1 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'ja-word-order',
    unit: 'How a sentence is built',
    kind: 'grammar',
    title: 'The verb goes last',
    summary: 'And everything before it can move',
    explanation: `A Japanese sentence ends with its verb. Always. Whatever else happens, the
thing that says what took place is the last word you reach.

That has a consequence worth preparing for: you often cannot tell what a sentence is DOING until
the very end. Whether something happened, did not happen, might happen, or is being asked about
is decided by the final few syllables.

Everything before the verb is comparatively free, because the roles are marked by particles
rather than by position. Move a phrase and the sentence still means the same thing; what changes
is emphasis.

And anything the listener can infer is simply left out. Japanese drops subjects constantly — a
sentence with no "I" in it is normal, not terse.`,
    examples: [
      { text: '私は本を読みます。', gloss: 'I read a book.' },
      { text: '本を読みます。', gloss: 'I read a book — the subject is dropped, and this is normal.' },
      { text: '私は毎日日本語を勉強します。', gloss: 'I study Japanese every day.' },
    ],
  },
  {
    id: 'ja-wa-ga',
    unit: 'How a sentence is built',
    kind: 'grammar',
    title: 'は and が',
    summary: 'The topic and the subject are not the same thing',
    explanation: `は marks the TOPIC: what the sentence is about, often already known. が marks
the SUBJECT: who or what is doing the verb, often new information.

The distinction has no English equivalent, which is why it takes a while.

は sets the stage. 私は学生です is "as for me, student" — it says what we are talking about, and
frequently contrasts with something else.

が points. 誰が来ますか — who is coming? The answer takes が too, because it is the new piece of
information: 田中さんが来ます.

A useful rule of thumb while reading: a question word can never take は. You cannot ask "as for
who". If you see が near a question word, that is why.

は is written with the hiragana for "ha" but pronounced "wa" in this job — a spelling left over
from older Japanese.`,
    examples: [
      { text: '私は学生です。', gloss: 'I am a student — は sets the topic.' },
      { text: '誰が来ますか。', gloss: 'Who is coming? — a question word takes が, never は.' },
      { text: '猫が好きです。', gloss: 'I like cats — the thing liked takes が.' },
    ],
  },
  {
    id: 'ja-particles',
    unit: 'How a sentence is built',
    kind: 'grammar',
    title: 'を, に, で, へ',
    summary: 'The particles that say what each word is doing',
    explanation: `Every noun in a Japanese sentence is followed by a particle saying what role it
plays. Learn these four and most sentences become readable.

を marks the direct object — the thing the verb acts on. 本を読みます.

に marks a destination, a point in time, or an indirect object. 学校に行きます, 七時に起きます.

で marks where an action happens, or what it is done with. 家で食べます, バスで行きます.

へ marks direction, and overlaps heavily with に for movement. に is more common.

The pair worth spending time on is に and で, because both can look like "at". に is where
something ENDS UP or exists; で is where something is DONE. 家にいます is "I am at home"; 家で
食べます is "I eat at home".

を and へ are also spelling survivals: を is pronounced "o", and へ is pronounced "e".`,
    examples: [
      { text: '本を読みます。', gloss: 'I read a book — を marks the object.' },
      { text: '学校に行きます。', gloss: 'I go to school — に marks the destination.' },
      { text: '家で食べます。', gloss: 'I eat at home — で marks where the action happens.' },
      { text: '七時に起きます。', gloss: 'I get up at seven — に also marks a point in time.' },
    ],
  },
  { id: 'ja-v-numbers', unit: 'How a sentence is built', kind: 'vocab', theme: 'numbers',
    title: 'Numbers', summary: 'Counting, prices, times, ages' },
  { id: 'ja-v-basics',  unit: 'How a sentence is built', kind: 'vocab', theme: 'basics',
    title: 'Everyday words', summary: 'The small words that hold sentences together' },

  // ── Unit 2 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'ja-desu',
    unit: 'Being and describing',
    kind: 'grammar',
    title: 'です and the polite form',
    summary: 'Politeness is grammar, not tone',
    explanation: `です is roughly "is", and it also makes a sentence polite. 学生です — I am a
student.

Politeness in Japanese is not something you add with your voice; it is built into the verb
ending, and you choose a level every single time you finish a sentence. The polite form is
です and the -ます ending on verbs, and it is the right default for anyone you have just met.

The plain form — だ instead of です, and the dictionary form of the verb — is for close friends,
family, and almost all writing that is not addressed to someone. That is worth knowing early as
a reader: a novel or an article will be in plain form throughout, and that is not rudeness, it
is simply not speech.

The negative of です is ではありません, and its everyday spoken form is じゃないです.`,
    examples: [
      { text: '私は学生です。', gloss: 'I am a student — polite.' },
      { text: '本を読みます。', gloss: 'I read a book — the polite -ます ending.' },
      { text: '猫ではありません。', gloss: 'It is not a cat.' },
    ],
  },
  {
    id: 'ja-adjectives',
    unit: 'Being and describing',
    kind: 'grammar',
    title: 'Two kinds of adjective',
    summary: 'One conjugates, the other does not',
    explanation: `Japanese has two adjective types and they behave differently, so it is worth
sorting a new adjective into the right box as you learn it.

い-adjectives end in い and conjugate on their own, like verbs: 高い, 高くない, 高かった. They
need no です to be a sentence, though polite speech adds one anyway.

な-adjectives are really nouns. They need な before a noun (静かな部屋) and です to make a
sentence, and their past and negative are formed on the です rather than on the word.

The trap is a handful of な-adjectives that happen to end in い — 有名, きれい, 嫌い. きれい is
the one everyone gets wrong: it looks like an い-adjective and is not, so "not pretty" is
きれいではありません, never きれくない.`,
    examples: [
      { text: 'この本は高いです。', gloss: 'This book is expensive — an い-adjective.' },
      { text: '静かな部屋です。', gloss: 'It is a quiet room — a な-adjective before a noun.' },
      { text: '新しい車を買いました。', gloss: 'I bought a new car.' },
    ],
  },
  { id: 'ja-v-family', unit: 'Being and describing', kind: 'vocab', theme: 'family',
    title: 'Family', summary: 'The people you describe first' },
  { id: 'ja-v-adjectives', unit: 'Being and describing', kind: 'vocab', theme: 'adjectives',
    title: 'Describing words', summary: 'Big, small, new, old, fast, slow' },
  { id: 'ja-v-colours', unit: 'Being and describing', kind: 'vocab', theme: 'colours',
    title: 'Colours', summary: 'Some are adjectives, some are nouns' },

  // ── Unit 3 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'ja-verbs',
    unit: 'Verbs',
    kind: 'grammar',
    title: 'Present and past',
    summary: 'Two tenses, and one of them covers the future',
    explanation: `Japanese marks only two tenses: past and non-past. The non-past covers both the
present and the future, and context decides which.

In the polite form the endings are -ます and -ました, with negatives -ません and -ませんでした.

読みます — I read, or I will read.
読みました — I read (already).
読みません — I do not read.

That gives you four sentence endings that between them cover most of what you need to say, and
they attach the same way to every verb in the polite form. This is why the polite form is
usually taught first: it is far more regular than the plain form.`,
    examples: [
      { text: '本を読みます。', gloss: 'I read a book, or I will read a book.' },
      { text: '本を読みました。', gloss: 'I read a book — past.' },
      { text: '肉を食べません。', gloss: 'I do not eat meat.' },
      { text: '昨日、映画を見ました。', gloss: 'Yesterday I watched a film.' },
    ],
  },
  {
    id: 'ja-te-form',
    unit: 'Verbs',
    kind: 'grammar',
    title: 'The て-form',
    summary: 'The most useful ending in the language',
    explanation: `The て-form does not mean anything by itself. It is a connector, and almost
every useful construction is built on it — which is why it is worth the effort it takes.

Joining actions in sequence: 起きて、食べて、行きます — I get up, eat, and go.

ています for something in progress or an ongoing state: 食べています — I am eating. This one also
covers states English would not call progressive: 知っています is "I know", and 住んでいます is
"I live (somewhere)".

てください to ask for something: 待ってください — please wait.

The form itself is where Japanese verbs are least regular, and it is learned by pattern rather
than by rule: 食べる gives 食べて, 読む gives 読んで, 行く gives 行って.`,
    examples: [
      { text: '今、食べています。', gloss: 'I am eating now.' },
      { text: '東京に住んでいます。', gloss: 'I live in Tokyo — an ongoing state.' },
      { text: '待ってください。', gloss: 'Please wait.' },
    ],
  },
  {
    id: 'ja-aru-iru',
    unit: 'Verbs',
    kind: 'grammar',
    title: 'ある and いる',
    summary: 'Two words for "there is", split by whether it is alive',
    explanation: `Japanese has two verbs for existence and picks between them by whether the
thing is animate.

いる is for people and animals. ある is for objects, plants and abstract things.

猫がいます — there is a cat. 本があります — there is a book.

The thing that exists takes が, and the place takes に. That order — place, thing, verb — is the
usual one: 部屋に猫がいます.

The same pair also does "to have": 車があります is both "there is a car" and "I have a car", and
which one it means is context.

ある is irregular in the negative. It is not あらない but ない, and politely ありません.`,
    examples: [
      { text: '猫がいます。', gloss: 'There is a cat — animate, so いる.' },
      { text: '本があります。', gloss: 'There is a book — inanimate, so ある.' },
      { text: '部屋に猫がいます。', gloss: 'There is a cat in the room — place, then thing.' },
      { text: 'お金がありません。', gloss: 'I have no money.' },
    ],
  },
  {
    id: 'ja-plain-form',
    unit: 'Verbs',
    kind: 'grammar',
    title: 'The plain form, and why reading needs it',
    summary: 'Almost everything you read will be in it',
    explanation: `Courses teach the polite -ます form first, because it is regular and safe to
speak. But almost nothing you READ is in it.

Novels, articles, subtitles and signs use the plain form: the dictionary form itself for
non-past, -た for past, -ない for negative, -なかった for past negative.

読む · 読んだ · 読まない · 読まなかった

That is the same four slots as the polite form, so nothing new is being said — only spelled
differently. Learning to recognise the pair is what turns a textbook reader into someone who can
open a book.

The plain form is also required inside a sentence, whatever the politeness at the end. A clause
before と, から, ので or a noun uses the plain form even in the most formal speech.`,
    examples: [
      { text: '本を読んだ。', gloss: 'I read a book — plain past, what a novel would use.' },
      { text: '肉を食べない。', gloss: 'I do not eat meat — plain negative.' },
      { text: '時間がなかった。', gloss: 'There was no time — plain past negative.' },
    ],
  },
  {
    id: 'ja-tai',
    unit: 'Verbs',
    kind: 'grammar',
    title: 'Wanting and suggesting',
    summary: '〜たい, 〜ましょう, 〜ませんか',
    explanation: `〜たい on a verb stem says you want to do something: 食べたい — I want to eat.

It behaves as an い-adjective, not a verb, so it negates and pastens like one: 食べたくない, 
食べたかった.

There is a social rule attached that has no English equivalent. 〜たい is for your OWN wants.
Saying it flatly about someone else is presumptuous, so you ask instead, or use a form that
reports rather than asserts.

To suggest doing something together, use 〜ましょう: 行きましょう — let's go. To invite more
softly, use the negative question 〜ませんか: 行きませんか — won't you go? That is gentler, and
gentler is usually better.`,
    examples: [
      { text: '水が飲みたいです。', gloss: 'I want to drink water — note が, not を.' },
      { text: '一緒に行きましょう。', gloss: "Let's go together." },
      { text: '映画を見ませんか。', gloss: 'Would you like to see a film?' },
    ],
  },
  { id: 'ja-v-routine', unit: 'Verbs', kind: 'vocab', theme: 'routine',
    title: 'Daily routine', summary: 'The verbs of an ordinary day' },
  { id: 'ja-v-verbs',   unit: 'Verbs', kind: 'vocab', theme: 'verbs',
    title: 'Common verbs', summary: 'The ones that turn up in every other sentence' },
  { id: 'ja-v-food',    unit: 'Verbs', kind: 'vocab', theme: 'food',
    title: 'Food and drink', summary: 'Enough to order, shop and cook' },

  // ── Unit 4 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'ja-questions',
    unit: 'Asking',
    kind: 'grammar',
    title: 'Asking a question',
    summary: 'Add か, change nothing else',
    explanation: `A statement becomes a question by adding か at the end. The word order does not
change and nothing moves.

学生です becomes 学生ですか.

Question words sit where the answer would go, exactly as in Chinese and unlike English: 何,
誰, どこ, いつ, どうして, どう, いくら. 何を食べますか is literally "what will you eat?" with
what in the object slot.

Because か already marks the question, written Japanese often does not use a question mark at
all — a full stop is normal and correct.

In casual speech か is frequently dropped and the voice rises instead.`,
    examples: [
      { text: 'あなたは学生ですか。', gloss: 'Are you a student?' },
      { text: '何を食べますか。', gloss: 'What will you eat? — the question word stays in place.' },
      { text: 'どこに行きますか。', gloss: 'Where are you going?' },
    ],
  },
  { id: 'ja-v-places',    unit: 'Asking', kind: 'vocab', theme: 'places',
    title: 'Places in town', summary: 'Where you are going and how to ask for it' },
  { id: 'ja-v-transport', unit: 'Asking', kind: 'vocab', theme: 'transport',
    title: 'Getting around', summary: 'On foot, by bus, by train' },
  { id: 'ja-v-weekdays',  unit: 'Asking', kind: 'vocab', theme: 'weekdays',
    title: 'Days of the week', summary: 'Named after the elements' },

  // ── Unit 5 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'ja-counters',
    unit: 'Counting and describing',
    kind: 'grammar',
    title: 'Counters',
    summary: 'The number depends on what you are counting',
    explanation: `Like Chinese, Japanese cannot attach a bare number to a noun. A counter goes
with the number, chosen by what kind of thing is being counted.

つ is the general one and works for many objects up to ten. 人 counts people, 本 long thin
things, 枚 flat things, 匹 small animals.

What makes this harder than the Chinese equivalent is that the NUMBER itself often changes shape
in front of the counter, and the changes are not regular. One person is ひとり and two people are
ふたり, neither of which follows the pattern that three people (さんにん) does.

The practical approach is the same one native learners take: memorise the first few of each
common counter as fixed words, and let the rest follow the regular pattern.`,
    examples: [
      { text: '本を三冊買いました。', gloss: 'I bought three books.' },
      { text: '猫が二匹います。', gloss: 'There are two cats.' },
      { text: '水を一杯ください。', gloss: 'One glass of water, please.' },
    ],
  },
  { id: 'ja-v-body',    unit: 'Counting and describing', kind: 'vocab', theme: 'body',
    title: 'The body', summary: 'For the doctor, and for everything that hurts' },
  { id: 'ja-v-house',   unit: 'Counting and describing', kind: 'vocab', theme: 'house',
    title: 'The house', summary: 'Rooms, furniture, the things in them' },
  { id: 'ja-v-clothing', unit: 'Counting and describing', kind: 'vocab', theme: 'clothing',
    title: 'Clothes', summary: 'What you are wearing and what you are buying' },
  { id: 'ja-v-weather', unit: 'Counting and describing', kind: 'vocab', theme: 'weather',
    title: 'Weather', summary: 'The most reliable small talk there is' },
  { id: 'ja-v-animals', unit: 'Counting and describing', kind: 'vocab', theme: 'animals',
    title: 'Animals', summary: 'And the counters they take' },
  { id: 'ja-v-school',  unit: 'Counting and describing', kind: 'vocab', theme: 'school',
    title: 'School', summary: 'Classroom words, and the things on a desk' },
  { id: 'ja-v-everyday', unit: 'Counting and describing', kind: 'vocab', theme: 'everyday',
    title: 'Everyday life', summary: 'Birthdays, names, friends, time and money' },
];
