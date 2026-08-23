import type { Lesson } from '@/lib/lessons';

/**
 * The French lesson tree — WRITTEN, not sourced.
 *
 * Same constraint as `lib/data/starterTexts.ts`, the `beginner` sets in `core-overrides.json`
 * and `proverbs-seed.json`, and for the same reason: the good grammar courses are copyrighted,
 * and paraphrasing one is not a loophole. What is free to follow is the SYLLABUS — gender,
 * agreement, negation, the passé composé are universal structure that every French course
 * covers because the language has them. The prose and every example sentence here are ours.
 *
 * The bar the examples are held to is the starter texts' bar: **every word must resolve in our
 * own dictionary**, checked by `tests/lessons.test.ts` through the REAL segmenter. They are
 * rendered as plain text rather than tappable tokens — an example arrives WITH its translation,
 * and the popup exists for text that has none — so the check is not about this screen. It is
 * about not teaching a learner a word the app cannot then define when they meet it in the wild,
 * and about keeping the examples inside the vocabulary the rest of the app actually knows.
 *
 * Written for someone who has already been reading — the explanations point back at things
 * the reader has been seeing, including the grammar line the word popup shows, so the two
 * halves of the feature refer to each other rather than sitting side by side.
 */
export const FR_LESSONS: Lesson[] = [
  // ── Unit 1 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'fr-gender',
    unit: 'Nouns and articles',
    kind: 'grammar',
    title: 'Every noun has a gender',
    summary: 'le or la — and why you learn it with the word',
    explanation: `Every French noun is either masculine or feminine. This is a property of the
WORD, not of the thing it names: there is nothing feminine about a table or masculine about a
book, and no rule you can apply to the object to work it out.

So the article is learned WITH the noun, from the first time you meet it — "la table", not
"table". Getting it later means relearning every noun you already know.

Before a vowel, both le and la shrink to l'. That hides the gender exactly when you would most
like to see it, which is another reason to learn the two together from the start.

You have already been seeing this: when you tap an inflected word while reading, the note under
the definition says things like "feminine plural". That is this, doing visible work.`,
    examples: [
      { text: 'le livre est sur la table.', gloss: 'The book is on the table.' },
      { text: 'la maison est grande.', gloss: 'The house is big.' },
      { text: "l'eau est froide.", gloss: 'The water is cold. (feminine, but hidden)' },
      { text: 'le chat dort dans le jardin.', gloss: 'The cat is sleeping in the garden.' },
    ],
  },
  {
    id: 'fr-plural',
    unit: 'Nouns and articles',
    kind: 'grammar',
    title: 'Making things plural',
    summary: 'The -s you write but do not say',
    explanation: `Most nouns add -s in the plural, and both le and la become les.

The catch is that the -s is silent. "le chat" and "les chats" differ in speech ONLY in the
article — so in French the article carries the information that the ending carries in English.
This is why a French speaker listening for a plural is listening to the front of the phrase,
not the back.

Nouns already ending in -s, -x or -z do not change at all.`,
    examples: [
      { text: 'les chats dorment.', gloss: 'The cats are sleeping.' },
      { text: 'les maisons sont grandes.', gloss: 'The houses are big.' },
      { text: 'le fils et les fils.', gloss: 'The son and the sons — no change to the noun.' },
    ],
  },
  {
    id: 'fr-articles',
    unit: 'Nouns and articles',
    kind: 'grammar',
    title: 'un and une, le and la',
    summary: 'A thing, versus the thing — and why French says "the" more',
    explanation: `un and une are "a": one of something, not yet identified. le and la are "the":
something already known, or a whole category.

The part that surprises English speakers is the second half. French uses the definite article
for things in general, where English uses no article at all. "j'aime le café" is "I like
coffee" — not "the coffee". Leaving it out is one of the most audible beginner mistakes.

The plural of un/une is des, and English usually drops that one too: "des enfants jouent" is
"children are playing".`,
    examples: [
      { text: 'je vois un chien dans la rue.', gloss: 'I see a dog in the street.' },
      { text: "j'aime le café.", gloss: 'I like coffee — coffee in general.' },
      { text: 'des enfants jouent devant la maison.', gloss: 'Children are playing in front of the house.' },
    ],
  },
  { id: 'fr-v-basics',  unit: 'Nouns and articles', kind: 'vocab', theme: 'basics',
    title: 'Everyday words', summary: 'The small words that hold sentences together' },
  { id: 'fr-v-numbers', unit: 'Nouns and articles', kind: 'vocab', theme: 'numbers',
    title: 'Numbers', summary: 'Counting, prices, times, ages' },
  { id: 'fr-v-colours', unit: 'Nouns and articles', kind: 'vocab', theme: 'colours',
    title: 'Colours', summary: 'And a first look at adjectives agreeing' },

  // ── Unit 2 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'fr-etre',
    unit: 'Being and having',
    kind: 'grammar',
    title: 'être — the verb you will use most',
    summary: 'je suis, tu es, il est…',
    explanation: `être is "to be", and it is irregular in a way worth simply memorising:

je suis · tu es · il/elle est · nous sommes · vous êtes · ils/elles sont

vous is doing two jobs. It is the plural "you", and it is also the polite singular "you" —
what you use with someone you have just met, or anyone you would not use a first name with.
tu is for friends, family, children and animals. Choosing wrongly is the most socially visible
mistake in the language, so when in doubt, use vous.`,
    examples: [
      { text: 'je suis fatigué.', gloss: 'I am tired.' },
      { text: 'nous sommes en retard.', gloss: 'We are late.' },
      { text: 'vous êtes très gentil.', gloss: 'You are very kind. (polite, to one person)' },
      { text: 'elles sont à la maison.', gloss: 'They are at home.' },
    ],
  },
  {
    id: 'fr-avoir',
    unit: 'Being and having',
    kind: 'grammar',
    title: 'avoir — to have, and to be',
    summary: "j'ai vingt ans, not «je suis vingt»",
    explanation: `avoir is "to have":

j'ai · tu as · il/elle a · nous avons · vous avez · ils/elles ont

French uses avoir for several states where English uses "to be". Age, hunger, thirst, fear and
cold are all things you HAVE: "j'ai faim" is "I am hungry", literally "I have hunger". Saying
"je suis faim" is the kind of mistake that stops a sentence dead, so these are worth learning
as fixed phrases rather than translating each time.

avoir is also half of the ordinary past tense, which is a later lesson — so this one pays
twice.`,
    examples: [
      { text: "j'ai un frère et une sœur.", gloss: 'I have a brother and a sister.' },
      { text: 'elle a faim.', gloss: 'She is hungry — literally, she has hunger.' },
      { text: 'nous avons le temps.', gloss: 'We have time.' },
      { text: 'ils ont une grande maison.', gloss: 'They have a big house.' },
    ],
  },
  { id: 'fr-v-family', unit: 'Being and having', kind: 'vocab', theme: 'family',
    title: 'Family', summary: 'The people you describe first' },
  { id: 'fr-v-body',   unit: 'Being and having', kind: 'vocab', theme: 'body',
    title: 'The body', summary: 'For the doctor, and for everything that hurts' },

  // ── Unit 3 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'fr-er-verbs',
    unit: 'Doing things',
    kind: 'grammar',
    title: 'Regular -er verbs',
    summary: 'The biggest group, and four endings that sound identical',
    explanation: `Most French verbs end in -er, and they all behave the same way. Drop the -er
and add: -e, -es, -e, -ons, -ez, -ent.

je parle · tu parles · il parle · nous parlons · vous parlez · ils parlent

Here is the part that matters for listening: four of those six — parle, parles, parle, parlent
— are pronounced EXACTLY the same. The endings are visible in writing and silent in speech, so
what tells a listener who is doing the talking is the pronoun, not the verb.

That is also why the note under a tapped word often says just "present" rather than naming a
person: several readings of the form are spelled the same, and the app will not guess between
them.`,
    examples: [
      { text: 'je parle français avec ma mère.', gloss: 'I speak French with my mother.' },
      { text: 'nous mangeons ensemble le soir.', gloss: 'We eat together in the evening.' },
      { text: 'ils travaillent beaucoup.', gloss: 'They work a lot.' },
      { text: 'vous chantez bien.', gloss: 'You sing well.' },
    ],
  },
  {
    id: 'fr-negation',
    unit: 'Doing things',
    kind: 'grammar',
    title: 'Saying no: ne … pas',
    summary: 'Negation comes in two pieces, and wraps the verb',
    explanation: `French negates with a pair. ne goes before the verb, pas after it, and the
verb sits inside them. Before a vowel, ne becomes n'.

je ne comprends pas · elle n'est pas là

Two things that trip people up. First, in ordinary speech the ne is very often dropped
entirely — you will HEAR "je sais pas" constantly — but it is still written, and leaving it out
in writing reads as careless.

Second, after a negative, un, une, du, de la and des all collapse to plain de. "je mange du
pain" becomes "je ne mange pas de pain".`,
    examples: [
      { text: 'je ne comprends pas.', gloss: 'I do not understand.' },
      { text: "elle n'est pas là.", gloss: 'She is not there.' },
      { text: 'nous ne mangeons pas de viande.', gloss: 'We do not eat meat — du becomes de.' },
    ],
  },
  {
    id: 'fr-partitif',
    unit: 'Doing things',
    kind: 'grammar',
    title: 'du, de la — some of something',
    summary: 'French says it where English says nothing',
    explanation: `When you mean an unspecified amount of something you cannot count — water,
bread, patience — French marks it: du for masculine, de la for feminine, de l' before a vowel.

English usually marks this with nothing at all. "I drink water" has no article; "je bois de
l'eau" must have one. Dropping it is one of the most persistent beginner habits, because there
is nothing in the English sentence to remind you.

Compare the three: "je bois de l'eau" (some water), "je bois l'eau" (the specific water),
"j'aime l'eau" (water in general).`,
    examples: [
      { text: "je bois de l'eau.", gloss: 'I drink water.' },
      { text: 'elle mange du pain avec du beurre.', gloss: 'She eats bread with butter.' },
      { text: "il n'y a pas de lait.", gloss: 'There is no milk.' },
    ],
  },
  { id: 'fr-v-routine', unit: 'Doing things', kind: 'vocab', theme: 'routine',
    title: 'Daily routine', summary: 'The verbs of an ordinary day' },
  { id: 'fr-v-food',    unit: 'Doing things', kind: 'vocab', theme: 'food',
    title: 'Food and drink', summary: 'Enough to order, shop and cook' },
  { id: 'fr-v-verbs',   unit: 'Doing things', kind: 'vocab', theme: 'verbs',
    title: 'Common verbs', summary: 'The ones that turn up in every other sentence' },

  // ── Unit 4 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'fr-adjectives',
    unit: 'Describing',
    kind: 'grammar',
    title: 'Adjectives agree with their noun',
    summary: 'Feminine adds -e, plural adds -s',
    explanation: `A French adjective changes to match the noun it describes: -e for feminine,
-s for plural, -es for both.

petit · petite · petits · petites

Sometimes the change is silent — joli and jolie sound the same. Often it is not: the final
consonant of the masculine is silent, and adding -e makes it sound. grand ends in a vowel
sound; grande ends in a clear d. So agreement is frequently something you can HEAR, which
makes it worth getting right out loud and not only on paper.

This is the same agreement the reader reports when you tap a word and the note says "feminine
singular".`,
    examples: [
      { text: 'un petit chien.', gloss: 'A small dog.' },
      { text: 'une petite maison.', gloss: 'A small house.' },
      { text: 'les petits enfants.', gloss: 'The small children.' },
      { text: 'des fleurs blanches.', gloss: 'White flowers.' },
    ],
  },
  {
    id: 'fr-adj-position',
    unit: 'Describing',
    kind: 'grammar',
    title: 'Where the adjective goes',
    summary: 'After the noun — except when it is before it',
    explanation: `The default is the opposite of English: the adjective FOLLOWS the noun. "une
voiture rouge", never "une rouge voiture".

A short list of very common adjectives goes before instead — grand, petit, bon, mauvais, jeune,
vieux, beau, nouveau. These are mostly short, old and frequent words, which is a pattern worth
noticing rather than a rule worth deriving.

A few change MEANING depending on where they sit. "un homme grand" is a tall man; "un grand
homme" is a great one. Same two words, different sentence.`,
    examples: [
      { text: 'une voiture rouge.', gloss: 'A red car — the normal order.' },
      { text: 'un bon livre.', gloss: 'A good book — bon goes before.' },
      { text: 'une vieille ville.', gloss: 'An old town.' },
      { text: 'un homme grand.', gloss: 'A tall man — but «un grand homme» is a great man.' },
    ],
  },
  { id: 'fr-v-adjectives', unit: 'Describing', kind: 'vocab', theme: 'adjectives',
    title: 'Describing words', summary: 'Big, small, new, old, easy, difficult' },
  { id: 'fr-v-house',     unit: 'Describing', kind: 'vocab', theme: 'house',
    title: 'The house', summary: 'Rooms, furniture, the things in them' },
  { id: 'fr-v-clothing',  unit: 'Describing', kind: 'vocab', theme: 'clothing',
    title: 'Clothes', summary: 'What you are wearing and what you are buying' },
  { id: 'fr-v-weather',   unit: 'Describing', kind: 'vocab', theme: 'weather',
    title: 'Weather', summary: 'The most reliable small talk there is' },

  // ── Unit 5 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'fr-questions',
    unit: 'Asking',
    kind: 'grammar',
    title: 'Three ways to ask a question',
    summary: 'Pick one and use it — they all work',
    explanation: `French gives you three, and they differ in register rather than meaning.

Raise your voice at the end and change nothing else: "tu viens ?" This is what people actually
say.

Put est-ce que in front: "est-ce que tu viens ?" Neutral, always safe, and it never requires
you to rearrange anything.

Invert the verb and pronoun: "viens-tu ?" More formal, and much more common in writing than in
speech.

The question words go in front of any of them: qui, que, où, quand, comment, pourquoi,
combien.`,
    examples: [
      { text: 'tu viens avec nous ?', gloss: 'Are you coming with us? (intonation only)' },
      { text: 'est-ce que tu parles français ?', gloss: 'Do you speak French?' },
      { text: 'où est la gare ?', gloss: 'Where is the station?' },
      { text: 'combien coûte ce livre ?', gloss: 'How much is this book?' },
    ],
  },
  { id: 'fr-v-places',    unit: 'Asking', kind: 'vocab', theme: 'places',
    title: 'Places in town', summary: 'Where you are going and how to ask for it' },
  { id: 'fr-v-transport', unit: 'Asking', kind: 'vocab', theme: 'transport',
    title: 'Getting around', summary: 'On foot, by bus, by train' },

  // ── Unit 6 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'fr-futur-proche',
    unit: 'Past and future',
    kind: 'grammar',
    title: 'What is about to happen',
    summary: 'aller + an infinitive, exactly like "going to"',
    explanation: `To say something is about to happen, use aller followed by an infinitive —
the same construction as English "I am going to eat".

je vais · tu vas · il/elle va · nous allons · vous allez · ils/elles vont

This is how French speakers talk about the future most of the time. There is a separate future
tense with its own endings, and it exists and is used, but it is more formal and more distant.
For anything happening today, this is the one.`,
    examples: [
      { text: 'je vais manger.', gloss: 'I am going to eat.' },
      { text: 'nous allons partir bientôt.', gloss: 'We are going to leave soon.' },
      { text: 'il va pleuvoir.', gloss: 'It is going to rain.' },
    ],
  },
  {
    id: 'fr-passe-compose',
    unit: 'Past and future',
    kind: 'grammar',
    title: 'The passé composé',
    summary: 'The everyday past: avoir plus a past participle',
    explanation: `This is how you say what happened. Take avoir in the present, and add the
past participle of the verb.

The participle is formed by the verb's family: -er verbs give -é (parler → parlé), -ir verbs
give -i (finir → fini), -re verbs usually give -u (vendre → vendu).

The irregular ones are frequent enough to be worth knowing outright: avoir → eu, être → été,
faire → fait, prendre → pris, voir → vu, dire → dit.

This is the form the reader labels "past participle" when you tap it.`,
    examples: [
      { text: "j'ai mangé une pomme.", gloss: 'I ate an apple.' },
      { text: 'elle a parlé avec sa mère.', gloss: 'She spoke with her mother.' },
      { text: 'nous avons fini le travail.', gloss: 'We finished the work.' },
      { text: 'ils ont vu le film.', gloss: 'They saw the film.' },
    ],
  },
  {
    id: 'fr-passe-etre',
    unit: 'Past and future',
    kind: 'grammar',
    title: 'The verbs that take être',
    summary: 'And then the participle agrees, like an adjective',
    explanation: `A small group of verbs builds the past with être instead of avoir. They are
mostly verbs of movement and change of state: aller, venir, partir, arriver, entrer, sortir,
monter, descendre, rester, tomber, naître, mourir.

When a verb takes être, its participle agrees with the SUBJECT exactly as an adjective agrees
with its noun:

il est allé · elle est allée · ils sont allés · elles sont allées

All four sound the same. The agreement is visible only in writing — which is precisely why the
reader can tell you about it: tap one and the note says "past participle · feminine singular".

Every reflexive verb takes être too.`,
    examples: [
      { text: 'il est allé au marché.', gloss: 'He went to the market.' },
      { text: 'elle est allée au marché.', gloss: 'She went to the market — note the extra -e.' },
      { text: 'nous sommes arrivés hier.', gloss: 'We arrived yesterday.' },
    ],
  },
  {
    id: 'fr-imparfait',
    unit: 'Past and future',
    kind: 'grammar',
    title: 'The imperfect',
    summary: 'How things used to be, versus what happened once',
    explanation: `The imperfect describes a past that has no edges: what things were like, what
you used to do, what was going on when something else happened.

The endings are the same for every verb: -ais, -ais, -ait, -ions, -iez, -aient.

The real skill is choosing between this and the passé composé, and the distinction is not about
how long ago something was. The passé composé is a single finished event; the imperfect is a
background, a habit or a state. In one sentence you often get both: "je mangeais quand il est
arrivé" — I was eating (background) when he arrived (event).`,
    examples: [
      { text: "quand j'étais petit, je jouais dans le jardin.", gloss: 'When I was small, I used to play in the garden.' },
      { text: 'il faisait froid.', gloss: 'It was cold.' },
      { text: 'nous habitions près de la mer.', gloss: 'We lived near the sea.' },
    ],
  },
  {
    id: 'fr-reflexive',
    unit: 'Past and future',
    kind: 'grammar',
    title: 'Reflexive verbs',
    summary: 'se lever, se laver — doing something to yourself',
    explanation: `A reflexive verb carries a pronoun pointing back at the subject: the person
doing the action is also receiving it.

je me lève · tu te lèves · il se lève · nous nous levons · vous vous levez · ils se lèvent

Many ordinary daily-routine verbs are reflexive in French where the English is not. You do not
"get up" in French so much as raise yourself, and you do not "wake up" so much as wake
yourself. Because these describe the shape of a normal morning, they are among the first verbs
worth having.

All of them form the past with être.`,
    examples: [
      { text: 'je me lève à sept heures.', gloss: 'I get up at seven.' },
      { text: 'elle se lave les mains.', gloss: 'She washes her hands.' },
      { text: 'nous nous levons tôt.', gloss: 'We get up early.' },
    ],
  },
  { id: 'fr-v-weekdays', unit: 'Past and future', kind: 'vocab', theme: 'weekdays',
    title: 'Days of the week', summary: 'lundi through dimanche' },
  { id: 'fr-v-months',   unit: 'Past and future', kind: 'vocab', theme: 'months',
    title: 'Months', summary: 'Dates, birthdays, seasons of the year' },
  { id: 'fr-v-seasons',  unit: 'Past and future', kind: 'vocab', theme: 'seasons',
    title: 'Seasons', summary: 'Four words that turn up constantly' },
];
