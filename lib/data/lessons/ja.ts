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
  {
    id: 'ja-word-order',
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
      { text: '私は本を読みます。', gloss: 'I read a book.',
        tiles: ['私', 'は', '本', 'を', '読みます。'] },
      { text: '本を読みます。', gloss: 'I read a book — the subject is dropped, and this is normal.',
        tiles: ['本', 'を', '読みます。'] },
      { text: '私は毎日日本語を勉強します。', gloss: 'I study Japanese every day.',
        tiles: ['私', 'は', '毎日', '日本語', 'を', '勉強', 'します。'] },
    ],
  },
  {
    id: 'ja-wa-ga',
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
      { text: '私は学生です。', gloss: 'I am a student — は sets the topic.',
        tiles: ['私', 'は', '学生', 'です。'] },
      { text: '誰が来ますか。', gloss: 'Who is coming? — a question word takes が, never は.',
        tiles: ['誰', 'が', '来ます', 'か。'] },
      { text: '猫が好きです。', gloss: 'I like cats — the thing liked takes が.',
        tiles: ['猫', 'が', '好き', 'です。'] },
    ],
  },
  {
    id: 'ja-particles',
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
      { text: '本を読みます。', gloss: 'I read a book — を marks the object.',
        tiles: ['本', 'を', '読みます。'] },
      { text: '学校に行きます。', gloss: 'I go to school — に marks the destination.',
        tiles: ['学校', 'に', '行きます。'] },
      { text: '家で食べます。', gloss: 'I eat at home — で marks where the action happens.',
        tiles: ['家', 'で', '食べます。'] },
      { text: '七時に起きます。', gloss: 'I get up at seven — に also marks a point in time.',
        tiles: ['七', '時', 'に', '起きます。'] },
    ],
  },
  {
    id: 'ja-desu',
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
      { text: '私は学生です。', gloss: 'I am a student — polite.',
        tiles: ['私', 'は', '学生', 'です。'] },
      { text: '本を読みます。', gloss: 'I read a book — the polite -ます ending.',
        tiles: ['本', 'を', '読みます。'] },
      { text: '猫ではありません。', gloss: 'It is not a cat.',
        tiles: ['猫', 'で', 'は', 'ありません。'] },
    ],
  },
  {
    id: 'ja-adjectives',
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
      { text: 'この本は高いです。', gloss: 'This book is expensive — an い-adjective.',
        tiles: ['この', '本', 'は', '高いです。'] },
      { text: '静かな部屋です。', gloss: 'It is a quiet room — a な-adjective before a noun.',
        tiles: ['静か', 'な', '部屋', 'です。'] },
      { text: '新しい車を買いました。', gloss: 'I bought a new car.',
        tiles: ['新しい', '車', 'を', '買いました。'] },
    ],
  },
  {
    id: 'ja-verbs',
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
      { text: '本を読みます。', gloss: 'I read a book, or I will read a book.',
        tiles: ['本', 'を', '読みます。'] },
      { text: '本を読みました。', gloss: 'I read a book — past.',
        tiles: ['本', 'を', '読みました。'] },
      { text: '肉を食べません。', gloss: 'I do not eat meat.',
        tiles: ['肉', 'を', '食べません。'] },
      { text: '昨日、映画を見ました。', gloss: 'Yesterday I watched a film.',
        tiles: ['昨日、', '映画', 'を', '見ました。'] },
    ],
  },
  {
    id: 'ja-te-form',
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
      { text: '今、食べています。', gloss: 'I am eating now.',
        tiles: ['今、', '食べています。'] },
      { text: '東京に住んでいます。', gloss: 'I live in Tokyo — an ongoing state.',
        tiles: ['東京', 'に', '住んでいます。'] },
      { text: '待ってください。', gloss: 'Please wait.',
        tiles: ['待ってください。'] },
    ],
  },
  {
    id: 'ja-aru-iru',
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
      { text: '猫がいます。', gloss: 'There is a cat — animate, so いる.',
        tiles: ['猫', 'が', 'います。'] },
      { text: '本があります。', gloss: 'There is a book — inanimate, so ある.',
        tiles: ['本', 'が', 'あります。'] },
      { text: '部屋に猫がいます。', gloss: 'There is a cat in the room — place, then thing.',
        tiles: ['部屋', 'に', '猫', 'が', 'います。'] },
      { text: 'お金がありません。', gloss: 'I have no money.',
        tiles: ['お金', 'が', 'ありません。'] },
    ],
  },
  {
    id: 'ja-plain-form',
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
      { text: '本を読んだ。', gloss: 'I read a book — plain past, what a novel would use.',
        tiles: ['本', 'を', '読んだ。'] },
      { text: '肉を食べない。', gloss: 'I do not eat meat — plain negative.',
        tiles: ['肉', 'を', '食べない。'] },
      { text: '時間がなかった。', gloss: 'There was no time — plain past negative.',
        tiles: ['時間', 'が', 'なかった。'] },
    ],
  },
  {
    id: 'ja-tai',
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
      { text: '水が飲みたいです。', gloss: 'I want to drink water — note が, not を.',
        tiles: ['水', 'が', '飲みたいです。'] },
      { text: '一緒に行きましょう。', gloss: "Let's go together.",
        tiles: ['一緒', 'に', '行きましょう。'] },
      { text: '映画を見ませんか。', gloss: 'Would you like to see a film?',
        tiles: ['映画', 'を', '見ません', 'か。'] },
    ],
  },
  {
    id: 'ja-questions',
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
      { text: 'あなたは学生ですか。', gloss: 'Are you a student?',
        tiles: ['あなた', 'は', '学生', 'です', 'か。'] },
      { text: '何を食べますか。', gloss: 'What will you eat? — the question word stays in place.',
        tiles: ['何', 'を', '食べます', 'か。'] },
      { text: 'どこに行きますか。', gloss: 'Where are you going?',
        tiles: ['どこ', 'に', '行きます', 'か。'] },
    ],
  },
  {
    id: 'ja-counters',
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
      { text: '本を三冊買いました。', gloss: 'I bought three books.',
        tiles: ['本', 'を', '三', '冊', '買いました。'] },
      { text: '猫が二匹います。', gloss: 'There are two cats.',
        tiles: ['猫', 'が', '二', '匹', 'います。'] },
      { text: '水を一杯ください。', gloss: 'One glass of water, please.',
        tiles: ['水', 'を', '一杯', 'ください。'] },
    ],
  },
  {
    id: 'ja-potential',
    kind: 'grammar',
    title: 'Saying you can do something',
    summary: 'The potential form, and the particle that changes with it',
    explanation: `The potential form says you are able to do something. る-verbs swap る for
られる; う-verbs shift the final sound to the -e row and add る: 読む becomes 読める, 話す becomes
話せる.

する and 来る are irregular and become できる and 来られる.

The part that catches people is not the ending but the PARTICLE. What you can do stops being a
direct object, so を usually becomes が: 日本語を話します, but 日本語が話せます.

Once formed, the potential behaves as an ordinary る-verb: 読めます, 読めない, 読めました.

This overlaps with ことができる, which is longer and slightly more formal but means the same
thing.`,
    examples: [
      { text: '日本語が話せます。', gloss: 'I can speak Japanese — が, not を.',
        tiles: ['日本語', 'が', '話せます。'] },
      { text: '漢字が読めません。', gloss: 'I cannot read kanji.',
        tiles: ['漢字', 'が', '読めません。'] },
      { text: '明日来られますか。', gloss: 'Can you come tomorrow?',
        tiles: ['明日', '来られます', 'か。'] },
    ],
  },
  {
    id: 'ja-conditionals',
    kind: 'grammar',
    title: 'Four ways to say "if"',
    summary: 'と, ば, たら, なら — and what separates them',
    explanation: `Japanese has four conditionals and they are not interchangeable, which is why
"if" is one of the last things to settle.

と is for something that ALWAYS follows: press this and it opens. No wishes, no requests — a
natural consequence.

ば is a general hypothetical, and leans toward the condition being the important part.

たら is the everyday one and the safest default. It also covers "when": 家に帰ったら電話します —
when I get home, I will call.

なら picks up something the other person just said: "if that is the case…". It is the only one
that comfortably follows a noun on its own.

If you learn one first, learn たら — it fits the most situations and is rarely wrong.`,
    examples: [
      { text: '春になると、暖かくなります。', gloss: 'When spring comes, it gets warm — an automatic result.',
        tiles: ['春', 'に', 'なる', 'と、', '暖かく', 'なります。'] },
      { text: '時間があったら、行きます。', gloss: 'If I have time, I will go.',
        tiles: ['時間', 'が', 'あったら、', '行きます。'] },
      { text: '家に帰ったら電話します。', gloss: 'When I get home, I will call.',
        tiles: ['家', 'に', '帰ったら', '電話', 'します。'] },
    ],
  },
  {
    id: 'ja-giving-receiving',
    kind: 'grammar',
    title: 'Giving and receiving',
    summary: 'あげる, くれる, もらう — the direction matters',
    explanation: `Japanese has two verbs for "give", and which one you use depends on who
benefits.

あげる is giving AWAY from you — you to someone else, or one third party to another.
くれる is giving TOWARD you — someone gives to you, or to someone in your circle.
もらう is receiving, told from the receiver's side.

友達に本をあげました — I gave my friend a book.
友達が本をくれました — my friend gave me a book.
友達に本をもらいました — I received a book from my friend.

The middle one has no English equivalent and is the one to spend time on: English uses "give"
for both directions, so くれる has to become a habit rather than a translation.

Attached to a て-form, these say who a favour was done for: 手伝ってくれました — they helped me.`,
    examples: [
      { text: '友達に本をあげました。', gloss: 'I gave my friend a book.',
        tiles: ['友達', 'に', '本', 'を', 'あげました。'] },
      { text: '友達が本をくれました。', gloss: 'My friend gave me a book — toward me, so くれる.',
        tiles: ['友達', 'が', '本', 'を', 'くれました。'] },
      { text: '友達に本をもらいました。', gloss: 'I received a book from my friend.',
        tiles: ['友達', 'に', '本', 'を', 'もらいました。'] },
    ],
  },
  {
    id: 'ja-transitive-pairs',
    kind: 'grammar',
    title: 'Verb pairs: doing it, and it happening',
    summary: '開ける and 開く are different verbs, not one verb changed',
    explanation: `Japanese has pairs of verbs where English reuses one word. One says somebody
DOES it; the other says it HAPPENS.

開ける is to open something; 開く is for something opening. 閉める and 閉まる, 始める and 始まる,
出す and 出る work the same way.

The transitive one takes を; the intransitive one takes が. That is the reliable signal while
reading: ドアを開けました is "I opened the door", ドアが開きました is "the door opened".

Japanese reaches for the intransitive far more readily than English does, which is part of why
translated Japanese can sound oddly passive. Often nothing is being hidden — the language simply
prefers to say that something happened.

There is no rule that predicts which ending is which, so they are learned in pairs.`,
    examples: [
      { text: 'ドアを開けました。', gloss: 'I opened the door — transitive, so を.',
        tiles: ['ドア', 'を', '開けました。'] },
      { text: 'ドアが開きました。', gloss: 'The door opened — intransitive, so が.',
        tiles: ['ドア', 'が', '開きました。'] },
      { text: '授業が始まります。', gloss: 'The class begins.',
        tiles: ['授業', 'が', '始まります。'] },
    ],
  },
  {
    id: 'ja-relative-clauses',
    kind: 'grammar',
    title: 'Describing a noun with a whole sentence',
    summary: 'The description comes FIRST, with no joining word',
    explanation: `English hangs a description behind the noun with "who" or "that": the book that
I bought. Japanese puts the whole thing in FRONT, and uses no joining word at all.

私が買った本 — literally "I bought book", meaning the book I bought.

Two things follow, and both matter for reading. The verb inside goes in PLAIN form whatever the
politeness of the sentence, and が often replaces は inside the clause.

This is the single biggest reading skill in Japanese, because a long description can run for a
whole line before the noun it belongs to finally arrives. Meeting a verb in plain form partway
through a sentence is usually the signal that this is happening.

Practise by reading to the end of the run first, finding the noun, then going back.`,
    examples: [
      { text: '私が買った本です。', gloss: 'It is the book I bought — the description comes first.',
        tiles: ['私', 'が', '買った', '本', 'です。'] },
      { text: '母が作った料理を食べました。', gloss: 'I ate the food my mother made.',
        tiles: ['母', 'が', '作った', '料理', 'を', '食べました。'] },
      { text: '昨日読んだ本は面白かったです。', gloss: 'The book I read yesterday was interesting.',
        tiles: ['昨日', '読んだ', '本', 'は', '面白かったです。'] },
    ],
  },
  {
    id: 'ja-kara-node',
    kind: 'grammar',
    title: 'Saying why',
    summary: 'から and ので, and why one is softer',
    explanation: `Both mean "because", and the reason comes FIRST — the opposite of English word
order, which puts it after.

寒いから、家にいます — because it is cold, I am staying home.

から is direct and states your reason plainly. ので is softer and more explanatory, and is what
you use when the reason is an excuse or when you are being polite. In a request or an apology,
ので is much the safer choice.

The grammar differs slightly: ので attaches to the plain form, and a な-adjective or noun needs
な before it — 静かなので, 学生なので.

Because the reason comes first, a long Japanese sentence often makes no sense until you reach
から or ので and realise everything before it was the explanation. Watching for those two words
is a real reading technique.`,
    examples: [
      { text: '寒いから、家にいます。', gloss: 'Because it is cold, I am staying home.',
        tiles: ['寒い', 'から、', '家', 'に', 'います。'] },
      { text: '忙しいので、行けません。', gloss: 'Because I am busy, I cannot go — ので is softer.',
        tiles: ['忙しい', 'ので、', '行けません。'] },
      { text: '時間がないから、急ぎます。', gloss: 'Because there is no time, I will hurry.',
        tiles: ['時間', 'が', 'ない', 'から、', '急ぎます。'] },
    ],
  },
  {
    id: 'ja-comparatives',
    kind: 'grammar',
    title: 'Comparing things',
    summary: 'より and the most, with no change to the adjective',
    explanation: `Japanese adjectives do not change to compare. Nothing becomes "bigger"; instead
the sentence names what is being compared against.

AはBより + adjective. 猫は犬より小さいです — a cat is smaller than a dog.

Note the order: the thing you are talking about first, then the thing it beats, then より.

For "the most", use 一番: 一番大きい — the biggest. It goes straight before the adjective and
nothing else changes.

To ask which of two, Japanese uses a fixed frame: AとBとどちらが — "between A and B, which?" The
answer takes のほうが: 猫のほうが小さいです.

Because the adjective never changes, comparison in Japanese is entirely about word order and
particles — which makes it easier to produce than in French or Spanish.`,
    examples: [
      { text: '猫は犬より小さいです。', gloss: 'A cat is smaller than a dog.',
        tiles: ['猫', 'は', '犬', 'より', '小さいです。'] },
      { text: 'これが一番大きいです。', gloss: 'This one is the biggest.',
        tiles: ['これ', 'が', '一番', '大きいです。'] },
      { text: '日本語は英語より難しいです。', gloss: 'Japanese is harder than English.',
        tiles: ['日本語', 'は', '英語', 'より', '難しいです。'] },
    ],
  },
  {
    id: 'ja-nakereba',
    kind: 'grammar',
    title: 'Must, and must not',
    summary: 'Long forms built from a double negative',
    explanation: `Japanese has no single word for "must". It says something closer to "if you do
not do it, it will not do", and the length is why these are learned as fixed shapes.

〜なければなりません — must do. 行かなければなりません.
〜なくてもいいです — do not have to. 行かなくてもいいです.
〜てはいけません — must not. 行ってはいけません.

The first two are built on the negative stem, the third on the て-form.

In speech the first is usually shortened to 〜なきゃ or 〜ないと, which is what you will actually
hear: 行かなきゃ.

Permission uses the same て-form as the prohibition: 〜てもいいです is "may I", so 行ってもいい
ですか is "may I go?" — one form asks, its negative forbids.`,
    examples: [
      { text: '行かなければなりません。', gloss: 'I have to go.',
        tiles: ['行かなけれ', 'ば', 'なり', 'ません。'] },
      { text: '行かなくてもいいです。', gloss: 'You do not have to go.',
        tiles: ['行かなくて', 'も', 'いい', 'です。'] },
      { text: '食べてもいいですか。', gloss: 'May I eat?',
        tiles: ['食べて', 'も', 'いい', 'です', 'か。'] },
    ],
  },
  {
    id: 'ja-counters-time',
    kind: 'grammar',
    title: 'Telling the time and the date',
    summary: 'Largest unit first, and the readings are irregular',
    explanation: `Like Chinese, Japanese runs from the biggest unit down: year, month, day, then
the hour.

The units are 年, 月, 日 and, for clock time, 時 for the hour and 分 for the minute.

What makes this harder than Chinese is that the readings are irregular in exactly the places you
need most. 四時 is よじ, not よんじ. 七時 is しちじ. 九時 is くじ. The days of the month from the
1st to the 10th have their own readings entirely — ついたち, ふつか, みっか — and are learned as
vocabulary rather than derived.

Months, at least, are regular and numbered: 一月 through 十二月.

The practical approach is to learn the awkward ones as words and let the rest follow the
pattern.`,
    examples: [
      { text: '今、四時です。', gloss: 'It is four o\'clock now.',
        tiles: ['今、', '四', '時', 'です。'] },
      { text: '毎日七時に起きます。', gloss: 'I get up at seven every day.',
        tiles: ['毎日', '七', '時', 'に', '起きます。'] },
      { text: '八月に日本へ行きます。', gloss: 'I am going to Japan in August.',
        tiles: ['八月', 'に', '日本', 'へ', '行きます。'] },
    ],
  },
  {
    id: 'ja-keigo',
    kind: 'grammar',
    title: 'A first look at keigo',
    summary: 'Politeness above ます — recognise it before you use it',
    explanation: `Beyond the ます form there is a whole further system for speaking about people
you defer to. You do not need to produce it early, but you will meet it constantly in shops, on
trains and in any formal writing, so it is worth recognising.

Two directions. HONORIFIC raises the other person: いらっしゃる replaces いる, 行く and 来る;
なさる replaces する; おっしゃる replaces 言う.

HUMBLE lowers yourself: いたす for する, 申す for 言う, 参る for 行く and 来る.

So 何をなさいますか is "what will you do?" spoken UP, and 私が申します is "I will say" spoken
DOWN — and both are polite, from opposite ends.

The single most useful thing early is to recognise いらっしゃいませ as "welcome", because you
will hear it every time you enter a shop.`,
    examples: [
      { text: '先生がいらっしゃいます。', gloss: 'The teacher is here — honorific.',
        tiles: ['先生', 'が', 'いらっしゃいます。'] },
      { text: '私が申します。', gloss: 'I will say it — humble.',
        tiles: ['私', 'が', '申します。'] },
      { text: '何をなさいますか。', gloss: 'What will you do?',
        tiles: ['何', 'を', 'なさいます', 'か。'] },
    ],
  },
  {
    id: 'ja-noun-modifiers',
    kind: 'grammar',
    title: 'の between two nouns',
    summary: 'Not only possession — and the order is the reverse of English',
    explanation: `の joins two nouns, and the OWNER or category comes first: 私の本 — my book.

That is only its most obvious job. の also links any two nouns where English would use "of", a
compound, or nothing at all: 日本語の本 — a Japanese book. 大学の先生 — a university teacher.

The order is consistently the reverse of English possession: where English says "the teacher of
the university", Japanese puts the university first.

They also chain, and a chain reads right-to-left into English: 私の友達の本 — my friend's book.

Reading a long noun chain means finding the LAST noun first and working backwards, which is the
same habit Chinese 的 demands.`,
    examples: [
      { text: '私の本です。', gloss: 'It is my book.',
        tiles: ['私', 'の', '本', 'です。'] },
      { text: '日本語の先生です。', gloss: 'She is a Japanese teacher.',
        tiles: ['日本語', 'の', '先生', 'です。'] },
      { text: '友達の名前を知りません。', gloss: "I do not know my friend's name.",
        tiles: ['友達', 'の', '名前', 'を', '知りません。'] },
    ],
  },
  { id: 'ja-v-numbers', kind: 'vocab', theme: 'numbers',
    title: 'Numbers', summary: 'Counting, prices, times, ages' },
  { id: 'ja-v-basics',  kind: 'vocab', theme: 'basics',
    title: 'Everyday words', summary: 'The small words that hold sentences together' },
  { id: 'ja-v-family', kind: 'vocab', theme: 'family',
    title: 'Family', summary: 'The people you describe first' },
  { id: 'ja-v-adjectives', kind: 'vocab', theme: 'adjectives',
    title: 'Describing words', summary: 'Big, small, new, old, fast, slow' },
  { id: 'ja-v-colours', kind: 'vocab', theme: 'colours',
    title: 'Colours', summary: 'Some are adjectives, some are nouns' },
  { id: 'ja-v-routine', kind: 'vocab', theme: 'routine',
    title: 'Daily routine', summary: 'The verbs of an ordinary day' },
  { id: 'ja-v-verbs',   kind: 'vocab', theme: 'verbs',
    title: 'Common verbs', summary: 'The ones that turn up in every other sentence' },
  { id: 'ja-v-food',    kind: 'vocab', theme: 'food',
    title: 'Food and drink', summary: 'Enough to order, shop and cook' },
  { id: 'ja-v-places',    kind: 'vocab', theme: 'places',
    title: 'Places in town', summary: 'Where you are going and how to ask for it' },
  { id: 'ja-v-transport', kind: 'vocab', theme: 'transport',
    title: 'Getting around', summary: 'On foot, by bus, by train' },
  { id: 'ja-v-weekdays',  kind: 'vocab', theme: 'weekdays',
    title: 'Days of the week', summary: 'Named after the elements' },
  { id: 'ja-v-body',    kind: 'vocab', theme: 'body',
    title: 'The body', summary: 'For the doctor, and for everything that hurts' },
  { id: 'ja-v-house',   kind: 'vocab', theme: 'house',
    title: 'The house', summary: 'Rooms, furniture, the things in them' },
  { id: 'ja-v-clothing', kind: 'vocab', theme: 'clothing',
    title: 'Clothes', summary: 'What you are wearing and what you are buying' },
  { id: 'ja-v-weather', kind: 'vocab', theme: 'weather',
    title: 'Weather', summary: 'The most reliable small talk there is' },
  { id: 'ja-v-animals', kind: 'vocab', theme: 'animals',
    title: 'Animals', summary: 'And the counters they take' },
  { id: 'ja-v-school',  kind: 'vocab', theme: 'school',
    title: 'School', summary: 'Classroom words, and the things on a desk' },
  { id: 'ja-v-everyday', kind: 'vocab', theme: 'everyday',
    title: 'Everyday life', summary: 'Birthdays, names, friends, time and money' },
  { id: 'ja-v-tableware', kind: 'vocab', theme: 'tableware',
    title: 'At the table', summary: 'Plates, bowls, chopsticks and spoons' },
  { id: 'ja-v-months',    kind: 'vocab', theme: 'months',
    title: 'Months', summary: 'Numbered, which makes them easy' },
  { id: 'ja-v-seasons',   kind: 'vocab', theme: 'seasons',
    title: 'Seasons', summary: 'Four words that turn up constantly' },
];
