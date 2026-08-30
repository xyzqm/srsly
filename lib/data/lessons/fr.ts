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
  {
    id: 'fr-gender',
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
    pitfall: "Gender belongs to the WORD, not to the thing, so there is nothing about the object to work out. And l' hides it exactly when you would most like to see it.",
    examples: [
      { text: 'le livre est sur la table.', gloss: 'The book is on the table.',
        tiles: ['le', 'livre', 'est', 'sur', 'la', 'table.'] },
      { text: 'la maison est grande.', gloss: 'The house is big.',
        tiles: ['la', 'maison', 'est', 'grande.'] },
      { text: "l'eau est froide.", gloss: 'The water is cold. (feminine, but hidden)',
        tiles: ["l'eau", 'est', 'froide.'] },
      { text: 'le chat dort dans le jardin.', gloss: 'The cat is sleeping in the garden.',
        tiles: ['le', 'chat', 'dort', 'dans', 'le', 'jardin.'] },
    ],
  },
  {
    id: 'fr-plural',
    kind: 'grammar',
    title: 'Making things plural',
    summary: 'The -s you write but do not say',
    explanation: `Most nouns add -s in the plural, and both le and la become les.

The catch is that the -s is silent. "le chat" and "les chats" differ in speech ONLY in the
article — so in French the article carries the information that the ending carries in English.
This is why a French speaker listening for a plural is listening to the front of the phrase,
not the back.

Nouns already ending in -s, -x or -z do not change at all.`,
    pitfall: 'The -s is silent, so the article does all the audible work. Drop les and a listener has no way whatever of hearing that you meant more than one.',
    examples: [
      { text: 'les chats dorment.', gloss: 'The cats are sleeping.',
        tiles: ['les', 'chats', 'dorment.'] },
      { text: 'les maisons sont grandes.', gloss: 'The houses are big.',
        tiles: ['les', 'maisons', 'sont', 'grandes.'] },
      { text: 'le fils et les fils.', gloss: 'The son and the sons — no change to the noun.',
        tiles: ['le', 'fils', 'et', 'les', 'fils.'] },
    ],
  },
  {
    id: 'fr-articles',
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
    pitfall: "French uses the definite article for general statements where English uses nothing: j'aime le café, not «j'aime café».",
    examples: [
      { text: 'je vois un chien dans la rue.', gloss: 'I see a dog in the street.',
        tiles: ['je', 'vois', 'un', 'chien', 'dans', 'la', 'rue.'] },
      { text: "j'aime le café.", gloss: 'I like coffee — coffee in general.',
        tiles: ["j'aime", 'le', 'café.'] },
      { text: 'des enfants jouent devant la maison.', gloss: 'Children are playing in front of the house.',
        tiles: ['des', 'enfants', 'jouent', 'devant', 'la', 'maison.'] },
    ],
  },
  {
    id: 'fr-etre',
    kind: 'grammar',
    title: 'être — the verb you will use most',
    summary: 'je suis, tu es, il est…',
    explanation: `être is "to be", and it is irregular in a way worth simply memorising:

je suis · tu es · il/elle est · nous sommes · vous êtes · ils/elles sont

vous is doing two jobs. It is the plural "you", and it is also the polite singular "you" —
what you use with someone you have just met, or anyone you would not use a first name with.
tu is for friends, family, children and animals. Choosing wrongly is the most socially visible
mistake in the language, so when in doubt, use vous.`,
    pitfall: 'être is irregular from the very first form and there is no pattern to lean on. It also builds the passé composé of a small group of verbs, so learning it early pays twice.',
    table: {
      caption: 'être in the present',
      columns: ['Form', 'Means', 'Example'],
      rows: [
        ['je suis', 'I am', 'je suis fatigué'],
        ['tu es', 'you are', 'tu es en retard'],
        ['il est', 'he is', 'il est médecin'],
        ['nous sommes', 'we are', 'nous sommes contents'],
        ['vous êtes', 'you are — plural or polite', 'vous êtes très gentil'],
        ['ils sont', 'they are', 'ils sont à la maison'],
      ],
    },
    examples: [
      { text: 'je suis fatigué.', gloss: 'I am tired.',
        tiles: ['je', 'suis', 'fatigué.'] },
      { text: 'nous sommes en retard.', gloss: 'We are late.',
        tiles: ['nous', 'sommes', 'en', 'retard.'] },
      { text: 'vous êtes très gentil.', gloss: 'You are very kind. (polite, to one person)',
        tiles: ['vous', 'êtes', 'très', 'gentil.'] },
      { text: 'elles sont à la maison.', gloss: 'They are at home.',
        tiles: ['elles', 'sont', 'à', 'la', 'maison.'] },
    ],
  },
  {
    id: 'fr-avoir',
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
    pitfall: "Age, hunger, cold and fear are things you HAVE. «je suis vingt ans» is the word-for-word English and it is wrong: j'ai vingt ans.",
    table: {
      caption: 'avoir in the present',
      columns: ['Form', 'Means', 'Example'],
      rows: [
        ["j'ai", 'I have', "j'ai froid"],
        ['tu as', 'you have', 'tu as raison'],
        ['il a', 'he has', 'il a faim'],
        ['nous avons', 'we have', 'nous avons le temps'],
        ['vous avez', 'you have — plural or polite', 'vous avez le temps'],
        ['ils ont', 'they have', 'ils ont deux enfants'],
      ],
    },
    examples: [
      { text: "j'ai un frère et une sœur.", gloss: 'I have a brother and a sister.',
        tiles: ["j'ai", 'un', 'frère', 'et', 'une', 'sœur.'] },
      { text: 'elle a faim.', gloss: 'She is hungry — literally, she has hunger.',
        tiles: ['elle', 'a', 'faim.'] },
      { text: 'nous avons le temps.', gloss: 'We have time.',
        tiles: ['nous', 'avons', 'le', 'temps.'] },
      { text: 'ils ont une grande maison.', gloss: 'They have a big house.',
        tiles: ['ils', 'ont', 'une', 'grande', 'maison.'] },
    ],
  },
  {
    id: 'fr-er-verbs',
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
    pitfall: 'Four of the six endings sound identical — parle, parles and parlent are one word aloud. The spelling still has to be right, and the pronoun is what a listener actually hears.',
    table: {
      caption: 'The -er endings, on parler',
      columns: ['Form', 'Means', 'Sounds like'],
      rows: [
        ['je parle', 'I speak', 'parl'],
        ['tu parles', 'you speak', 'parl'],
        ['il parle', 'he speaks', 'parl'],
        ['nous parlons', 'we speak', 'parlon'],
        ['vous parlez', 'you speak', 'parlay'],
        ['ils parlent', 'they speak', 'parl'],
      ],
    },
    examples: [
      { text: 'je parle français avec ma mère.', gloss: 'I speak French with my mother.',
        tiles: ['je', 'parle', 'français', 'avec', 'ma', 'mère.'] },
      { text: 'nous mangeons ensemble le soir.', gloss: 'We eat together in the evening.',
        tiles: ['nous', 'mangeons', 'ensemble', 'le', 'soir.'] },
      { text: 'ils travaillent beaucoup.', gloss: 'They work a lot.',
        tiles: ['ils', 'travaillent', 'beaucoup.'] },
      { text: 'vous chantez bien.', gloss: 'You sing well.',
        tiles: ['vous', 'chantez', 'bien.'] },
    ],
  },
  {
    id: 'fr-negation',
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
    pitfall: 'Negation is two pieces wrapping the verb. Dropping ne is normal in speech and never in writing; dropping pas is not an option in either.',
    examples: [
      { text: 'je ne comprends pas.', gloss: 'I do not understand.',
        tiles: ['je', 'ne', 'comprends', 'pas.'] },
      { text: "elle n'est pas là.", gloss: 'She is not there.',
        tiles: ['elle', "n'est", 'pas', 'là.'] },
      { text: 'nous ne mangeons pas de viande.', gloss: 'We do not eat meat — du becomes de.',
        tiles: ['nous', 'ne', 'mangeons', 'pas', 'de', 'viande.'] },
    ],
  },
  {
    id: 'fr-partitif',
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
    pitfall: 'After a negative, du, de la and des all collapse to plain de. «je ne mange pas du pain» is wrong — it is je ne mange pas de pain.',
    examples: [
      { text: "je bois de l'eau.", gloss: 'I drink water.',
        tiles: ['je', 'bois', 'de', "l'eau."] },
      { text: 'elle mange du pain avec du beurre.', gloss: 'She eats bread with butter.',
        tiles: ['elle', 'mange', 'du', 'pain', 'avec', 'du', 'beurre.'] },
      { text: "il n'y a pas de lait.", gloss: 'There is no milk.',
        tiles: ['il', "n'y", 'a', 'pas', 'de', 'lait.'] },
    ],
  },
  {
    id: 'fr-adjectives',
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
    pitfall: 'The feminine -e is often audible even though the plural -s never is: petit and petite are two different words to the ear. Agreement is not only a spelling rule.',
    examples: [
      { text: 'un petit chien.', gloss: 'A small dog.',
        tiles: ['un', 'petit', 'chien.'] },
      { text: 'une petite maison.', gloss: 'A small house.',
        tiles: ['une', 'petite', 'maison.'] },
      { text: 'les petits enfants.', gloss: 'The small children.',
        tiles: ['les', 'petits', 'enfants.'] },
      { text: 'des fleurs blanches.', gloss: 'White flowers.',
        tiles: ['des', 'fleurs', 'blanches.'] },
    ],
  },
  {
    id: 'fr-adj-position',
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
    pitfall: 'Most adjectives follow the noun and the short common ones precede it. A few change meaning by moving: un homme grand is a tall man, un grand homme a great one.',
    examples: [
      { text: 'une voiture rouge.', gloss: 'A red car — the normal order.',
        tiles: ['une', 'voiture', 'rouge.'] },
      { text: 'un bon livre.', gloss: 'A good book — bon goes before.',
        tiles: ['un', 'bon', 'livre.'] },
      { text: 'une vieille ville.', gloss: 'An old town.',
        tiles: ['une', 'vieille', 'ville.'] },
      { text: 'un homme grand.', gloss: 'A tall man — but «un grand homme» is a great man.',
        tiles: ['un', 'homme', 'grand.'] },
    ],
  },
  {
    id: 'fr-questions',
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
    pitfall: 'All three forms are correct, and est-ce que is the one that always works. Inversion is the formal one, and it takes a hyphen — which is why est-ce is written as one word.',
    table: {
      caption: 'The question words',
      columns: ['Word', 'Asks', 'Example'],
      rows: [
        ['qui', 'who', 'qui est là ?'],
        ['que', 'what', 'que fais-tu ?'],
        ['où', 'where', 'où est la gare ?'],
        ['quand', 'when', 'quand pars-tu ?'],
        ['comment', 'how', 'comment ça va ?'],
        ['combien', 'how much, how many', 'combien coûte ce livre ?'],
        ['pourquoi', 'why', 'pourquoi tu ne viens pas ?'],
      ],
    },
    examples: [
      { text: 'tu viens avec nous ?', gloss: 'Are you coming with us? (intonation only)',
        tiles: ['tu', 'viens', 'avec', 'nous?'] },
      { text: 'est-ce que tu parles français ?', gloss: 'Do you speak French?',
        tiles: ['est-ce', 'que', 'tu', 'parles', 'français?'] },
      { text: 'où est la gare ?', gloss: 'Where is the station?',
        tiles: ['où', 'est', 'la', 'gare?'] },
      { text: 'combien coûte ce livre ?', gloss: 'How much is this book?',
        tiles: ['combien', 'coûte', 'ce', 'livre?'] },
    ],
  },
  {
    id: 'fr-futur-proche',
    kind: 'grammar',
    title: 'What is about to happen',
    summary: 'aller + an infinitive, exactly like "going to"',
    explanation: `To say something is about to happen, use aller followed by an infinitive —
the same construction as English "I am going to eat".

je vais · tu vas · il/elle va · nous allons · vous allez · ils/elles vont

This is how French speakers talk about the future most of the time. There is a separate future
tense with its own endings, and it exists and is used, but it is more formal and more distant.
For anything happening today, this is the one.`,
    pitfall: 'The second verb stays in the infinitive and agrees with nothing. «je vais mange» is wrong — it is je vais manger.',
    examples: [
      { text: 'je vais manger.', gloss: 'I am going to eat.',
        tiles: ['je', 'vais', 'manger.'] },
      { text: 'nous allons partir bientôt.', gloss: 'We are going to leave soon.',
        tiles: ['nous', 'allons', 'partir', 'bientôt.'] },
      { text: 'il va pleuvoir.', gloss: 'It is going to rain.',
        tiles: ['il', 'va', 'pleuvoir.'] },
    ],
  },
  {
    id: 'fr-passe-compose',
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
    pitfall: "It is two words, and the auxiliary is the half that conjugates. j'ai mangé, never «je mangé» — a participle on its own is not a tense.",
    examples: [
      { text: "j'ai mangé une pomme.", gloss: 'I ate an apple.',
        tiles: ["j'ai", 'mangé', 'une', 'pomme.'] },
      { text: 'elle a parlé avec sa mère.', gloss: 'She spoke with her mother.',
        tiles: ['elle', 'a', 'parlé', 'avec', 'sa', 'mère.'] },
      { text: 'nous avons fini le travail.', gloss: 'We finished the work.',
        tiles: ['nous', 'avons', 'fini', 'le', 'travail.'] },
      { text: 'ils ont vu le film.', gloss: 'They saw the film.',
        tiles: ['ils', 'ont', 'vu', 'le', 'film.'] },
    ],
  },
  {
    id: 'fr-passe-etre',
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
    pitfall: 'A small group of verbs takes être, and then the participle agrees like an adjective. elle est allée, with the -e; «elle a allé» is wrong twice over.',
    examples: [
      { text: 'il est allé au marché.', gloss: 'He went to the market.',
        tiles: ['il', 'est', 'allé', 'au', 'marché.'] },
      { text: 'elle est allée au marché.', gloss: 'She went to the market — note the extra -e.',
        tiles: ['elle', 'est', 'allée', 'au', 'marché.'] },
      { text: 'nous sommes arrivés hier.', gloss: 'We arrived yesterday.',
        tiles: ['nous', 'sommes', 'arrivés', 'hier.'] },
    ],
  },
  {
    id: 'fr-imparfait',
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
    pitfall: 'The imperfect is about how you frame it, not how long it went on. Something that happened once takes the passé composé even if it took ten years.',
    examples: [
      { text: "quand j'étais petit, je jouais dans le jardin.", gloss: 'When I was small, I used to play in the garden.',
        tiles: ['quand', "j'étais", 'petit,', 'je', 'jouais', 'dans', 'le', 'jardin.'] },
      { text: 'il faisait froid.', gloss: 'It was cold.',
        tiles: ['il', 'faisait', 'froid.'] },
      { text: 'nous habitions près de la mer.', gloss: 'We lived near the sea.',
        tiles: ['nous', 'habitions', 'près', 'de', 'la', 'mer.'] },
    ],
  },
  {
    id: 'fr-reflexive',
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
    pitfall: 'The pronoun changes with the person: je me lave, tu te laves, il se lave. se is only the dictionary form, and leaving it there is the giveaway.',
    examples: [
      { text: 'je me lève à sept heures.', gloss: 'I get up at seven.',
        tiles: ['je', 'me', 'lève', 'à', 'sept', 'heures.'] },
      { text: 'elle se lave les mains.', gloss: 'She washes her hands.',
        tiles: ['elle', 'se', 'lave', 'les', 'mains.'] },
      { text: 'nous nous levons tôt.', gloss: 'We get up early.',
        tiles: ['nous', 'nous', 'levons', 'tôt.'] },
    ],
  },
  {
    id: 'fr-object-pronouns',
    kind: 'grammar',
    title: 'Object pronouns go BEFORE the verb',
    summary: 'le, la, les, lui, leur — and the order they queue in',
    explanation: `English puts the object after the verb: "I see him". French puts the pronoun
in front of it: "je le vois".

Direct objects — the thing acted on — are me, te, le, la, nous, vous, les.
Indirect objects — the person it is done TO — are me, te, lui, nous, vous, leur.

The pair worth separating is le/la versus lui. "je le vois" is I see him; "je lui parle" is I
speak TO him. Which one you need depends on the verb, and the reliable test is whether French
uses à: parler à quelqu'un takes lui.

In a negative, the pronoun stays glued to the verb and ne goes outside the whole group: "je ne
le vois pas".`,
    pitfall: 'They go BEFORE the verb, which is the opposite of English. «je vois le» becomes je le vois, and in the negative the pronoun stays glued to the verb: je ne le vois pas.',
    table: {
      caption: 'The object pronouns, in the order they queue',
      columns: ['Pronoun', 'Stands for', 'Example'],
      rows: [
        ['me', 'me', 'il me voit'],
        ['te', 'you', 'il te voit'],
        ['le', 'him, or it — masculine', 'je le vois'],
        ['la', 'her, or it — feminine', 'je la connais'],
        ['lui', 'to him, to her', 'je lui parle'],
        ['nous', 'us', 'elle nous attend'],
        ['leur', 'to them', 'il leur parle souvent'],
      ],
    },
    examples: [
      { text: 'je le vois.', gloss: 'I see him — the pronoun comes before the verb.',
        tiles: ['je', 'le', 'vois.'] },
      { text: 'je lui parle.', gloss: 'I speak to him — parler à takes the indirect pronoun.',
        tiles: ['je', 'lui', 'parle.'] },
      { text: 'elle nous attend.', gloss: 'She is waiting for us.',
        tiles: ['elle', 'nous', 'attend.'] },
      { text: 'je ne le vois pas.', gloss: 'I do not see him — ne … pas wraps the whole group.',
        tiles: ['je', 'ne', 'le', 'vois', 'pas.'] },
    ],
  },
  {
    id: 'fr-y-en',
    kind: 'grammar',
    title: 'y and en',
    summary: 'Two tiny words that replace a whole phrase',
    explanation: `y replaces a place, or a phrase beginning with à. "je vais à Paris" becomes
"j'y vais".

en replaces a phrase beginning with de, and anything counted or measured. "je viens de Paris"
becomes "j'en viens"; "j'ai trois livres" becomes "j'en ai trois".

Both sit in front of the verb like the other pronouns, and both are easy to skim past while
reading because they are so short — which is exactly why they are worth learning to notice.

en is obligatory with a quantity even when English drops it entirely: "combien en veux-tu ?"
is "how many do you want?", and the en cannot be left out.`,
    pitfall: 'y replaces a place or à + a thing; en replaces de + a thing, or a quantity. Both sit where an object pronoun sits, and neither is optional — the phrase cannot simply be dropped.',
    examples: [
      { text: "j'y vais demain.", gloss: 'I am going there tomorrow.',
        tiles: ["j'y", 'vais', 'demain.'] },
      { text: "j'en ai trois.", gloss: 'I have three of them — en is required.',
        tiles: ["j'en", 'ai', 'trois.'] },
      { text: 'elle en parle souvent.', gloss: 'She talks about it often.',
        tiles: ['elle', 'en', 'parle', 'souvent.'] },
    ],
  },
  {
    id: 'fr-comparatives',
    kind: 'grammar',
    title: 'Comparing things',
    summary: 'plus, moins, aussi — and the one irregular that matters',
    explanation: `Comparison is built with three words in front of the adjective, and que for
"than": plus … que (more), moins … que (less), aussi … que (as).

il est plus grand que moi — he is taller than me.

For the superlative, add the article: le plus grand, la plus belle. Where the adjective normally
follows the noun, the superlative follows too and the article is repeated: "la ville la plus
belle".

The irregular worth memorising is bon, which becomes meilleur rather than "plus bon" — the same
shape as good and better. Its adverb bien becomes mieux, and the two are frequently confused
even by people who have been speaking a while.`,
    pitfall: 'bon has an irregular comparative: meilleur, never «plus bon». The adverb bien does the same and becomes mieux — two words, for two different jobs.',
    table: {
      caption: 'Comparing, and the two irregulars',
      columns: ['Word', 'Means', 'Example'],
      rows: [
        ['plus', 'more … than', 'il est plus grand que moi'],
        ['moins', 'less … than', 'ce livre est moins cher'],
        ['aussi', 'as … as', 'il court aussi vite que toi'],
        ['meilleur', 'better — the irregular of bon', 'ce café est meilleur'],
        ['mieux', 'better — the irregular of bien', 'elle chante mieux'],
      ],
    },
    examples: [
      { text: 'il est plus grand que moi.', gloss: 'He is taller than me.',
        tiles: ['il', 'est', 'plus', 'grand', 'que', 'moi.'] },
      { text: 'ce livre est moins cher.', gloss: 'This book is cheaper.',
        tiles: ['ce', 'livre', 'est', 'moins', 'cher.'] },
      { text: "c'est le meilleur restaurant.", gloss: 'It is the best restaurant — not «le plus bon».',
        tiles: ["c'est", 'le', 'meilleur', 'restaurant.'] },
    ],
  },
  {
    id: 'fr-futur-simple',
    kind: 'grammar',
    title: 'The future tense',
    summary: 'Built on the infinitive, with avoir endings',
    explanation: `Beyond aller + infinitive there is a real future tense, and it is unusually
easy to build: take the infinitive and add -ai, -as, -a, -ons, -ez, -ont. Those endings are the
present tense of avoir, which is not a coincidence.

parler → je parlerai · finir → je finirai · vendre → je vendrai (the final -e drops)

The stem is irregular for a handful of very common verbs, and those are the ones you meet:
être → ser-, avoir → aur-, aller → ir-, faire → fer-, pouvoir → pourr-, vouloir → voudr-.

It leans more formal and more distant than aller + infinitive, and it is what writing uses. It
is also required after quand and dès que where English uses a present: "quand il arrivera".`,
    pitfall: 'The endings go on the whole infinitive, so the -r is always audible: je parlerai. For -re verbs the final e drops first — prendre gives je prendrai.',
    examples: [
      { text: 'je parlerai avec lui demain.', gloss: 'I will speak with him tomorrow.',
        tiles: ['je', 'parlerai', 'avec', 'lui', 'demain.'] },
      { text: 'nous serons là.', gloss: 'We will be there — être has an irregular stem.',
        tiles: ['nous', 'serons', 'là.'] },
      { text: 'elle aura le temps.', gloss: 'She will have time.',
        tiles: ['elle', 'aura', 'le', 'temps.'] },
    ],
  },
  {
    id: 'fr-relative',
    kind: 'grammar',
    title: 'qui and que',
    summary: 'Which one you need depends on what follows, not on what it means',
    explanation: `Both join a description to a noun, and both can translate as "who", "which" or
"that". The choice has nothing to do with people versus things.

qui is the SUBJECT of the clause that follows — something comes after it doing the verb:
"l'homme qui parle" — the man who is speaking.

que is the OBJECT — a new subject follows it: "le livre que je lis" — the book that I am reading.

So the test is mechanical: look at what comes next. A verb means qui; a subject means que.

que elides to qu' before a vowel; qui never does, which is a useful extra signal while reading.`,
    pitfall: 'Choose by what FOLLOWS, not by what it means. qui is followed by a verb and que by a subject; neither one is «who» or «which» as such.',
    examples: [
      { text: "l'homme qui parle est mon père.", gloss: 'The man who is speaking is my father.',
        tiles: ["l'homme", 'qui', 'parle', 'est', 'mon', 'père.'] },
      { text: 'le livre que je lis est bon.', gloss: 'The book that I am reading is good.',
        tiles: ['le', 'livre', 'que', 'je', 'lis', 'est', 'bon.'] },
      { text: "c'est la ville où j'habite.", gloss: 'This is the town where I live — où for places.',
        tiles: ["c'est", 'la', 'ville', 'où', "j'habite."] },
    ],
  },
  {
    id: 'fr-imperative',
    kind: 'grammar',
    title: 'Telling someone to do something',
    summary: 'Drop the pronoun — and one -s with it',
    explanation: `A command is the present tense with the pronoun removed. "tu parles" becomes
"parle", "nous allons" becomes "allons", "vous venez" becomes "venez".

The one irregularity is worth knowing because it is invisible when spoken: -er verbs lose their
final -s in the tu form. "tu parles" gives "parle", not "parles". The two sound identical, so
this is purely a writing rule.

Four verbs are irregular outright: être gives sois, avoir gives aie, savoir gives sache, and
vouloir gives veuille.

With a reflexive verb the pronoun moves to the end and te becomes toi: "lève-toi".`,
    pitfall: 'Drop the pronoun, and for -er verbs drop the -s with it: tu parles becomes parle. In a positive command the pronoun comes back after the verb: donne-moi.',
    examples: [
      { text: 'parle plus lentement.', gloss: 'Speak more slowly — no pronoun, and no final -s.',
        tiles: ['parle', 'plus', 'lentement.'] },
      { text: 'allons au marché.', gloss: "Let's go to the market.",
        tiles: ['allons', 'au', 'marché.'] },
      { text: 'ne parle pas si vite.', gloss: 'Do not speak so fast.',
        tiles: ['ne', 'parle', 'pas', 'si', 'vite.'] },
    ],
  },
  {
    id: 'fr-depuis',
    kind: 'grammar',
    title: 'depuis, pendant, il y a',
    summary: 'Three ways to say how long, and they are not swappable',
    explanation: `English uses "for" and "ago" loosely. French splits the job three ways, and the
tense changes with the word.

depuis is something still going on, and it takes the PRESENT where English uses a perfect.
"j'habite ici depuis trois ans" is "I have lived here for three years" — the living continues,
so French keeps it present.

pendant is a finished stretch of time: "j'ai travaillé pendant deux heures".

il y a is "ago", and always takes a past: "je suis arrivé il y a deux jours".

The first is the one to spend time on, because the tense mismatch with English is what makes it
feel wrong at first.`,
    pitfall: "depuis takes the PRESENT for something still going on: j'habite ici depuis trois ans, not «j'ai habité». The English perfect is exactly what leads people astray here.",
    examples: [
      { text: "j'habite ici depuis trois ans.", gloss: 'I have lived here for three years — still true, so present.',
        tiles: ["j'habite", 'ici', 'depuis', 'trois', 'ans.'] },
      { text: "j'ai travaillé pendant deux heures.", gloss: 'I worked for two hours — finished.',
        tiles: ["j'ai", 'travaillé', 'pendant', 'deux', 'heures.'] },
      { text: 'je suis arrivé il y a deux jours.', gloss: 'I arrived two days ago.',
        tiles: ['je', 'suis', 'arrivé', 'il', 'y', 'a', 'deux', 'jours.'] },
    ],
  },
  {
    id: 'fr-conditionnel',
    kind: 'grammar',
    title: 'The conditional',
    summary: 'Would — and the polite form of asking',
    explanation: `The conditional is built like the future — on the infinitive — but takes the
imperfect endings: -ais, -ais, -ait, -ions, -iez, -aient.

je parlerais · tu parlerais · il parlerait

It has the same irregular stems as the future, so learning one gives you the other: ser-, aur-,
ir-, fer-, pourr-, voudr-.

Two everyday uses. It softens a request, which is the first one you will need: "je voudrais un
café" is what you say in a shop, and "je veux" sounds blunt. And it carries the "would" half of
an if-sentence: "si j'avais le temps, je viendrais".

Note the pattern there: si takes the IMPERFECT and the other half takes the conditional. Putting
the conditional after si is the classic mistake.`,
    pitfall: "The endings are the imperfect's, on the future stem. And si never takes a conditional — si j'avais, je viendrais, with the conditional in the other half.",
    examples: [
      { text: 'je voudrais un café.', gloss: 'I would like a coffee — the polite way to ask.',
        tiles: ['je', 'voudrais', 'un', 'café.'] },
      { text: "si j'avais le temps, je viendrais.", gloss: 'If I had time, I would come.',
        tiles: ['si', "j'avais", 'le', 'temps,', 'je', 'viendrais.'] },
      { text: 'nous pourrions partir demain.', gloss: 'We could leave tomorrow.',
        tiles: ['nous', 'pourrions', 'partir', 'demain.'] },
    ],
  },
  {
    id: 'fr-subjonctif',
    kind: 'grammar',
    title: 'A first look at the subjunctive',
    summary: 'Triggered by the sentence around it, not by doubt',
    explanation: `The subjunctive is not a tense and mostly not a choice. Certain expressions
simply require it in the clause that follows, and the reliable way in is to learn those
expressions rather than to reason about mood.

il faut que · je veux que · je suis content que · bien que · avant que · pour que

The forms come from the ils stem of the present: ils parlent gives que je parle, ils finissent
gives que je finisse. Only a handful are irregular, and they are the usual suspects: être gives
sois, avoir gives aie, aller gives aille, faire gives fasse, pouvoir gives puisse.

Most of what you meet is "il faut que" plus a verb, so that one phrase carries much of the load.

Note that "j'espère que" does NOT take it, which surprises people, since hoping feels uncertain.`,
    pitfall: 'It is triggered by the words in front of it, not by doubt. il faut que and je veux que always take it, however certain the speaker happens to be.',
    examples: [
      { text: 'il faut que je parte.', gloss: 'I have to leave.',
        tiles: ['il', 'faut', 'que', 'je', 'parte.'] },
      { text: 'je veux que tu viennes.', gloss: 'I want you to come.',
        tiles: ['je', 'veux', 'que', 'tu', 'viennes.'] },
      { text: 'bien que ce soit difficile.', gloss: 'Although it is difficult.',
        tiles: ['bien', 'que', 'ce', 'soit', 'difficile.'] },
    ],
  },
  {
    id: 'fr-prepositions-places',
    kind: 'grammar',
    title: 'Going to places',
    summary: 'à, en or au — decided by the gender of the country',
    explanation: `For a town it is always à: "je vais à Paris".

For a country it depends on gender. Feminine countries — which is most of the ones ending in -e
— take en: "en France", "en Espagne". Masculine ones take au: "au Canada", "au Japon". Plurals
take aux: "aux États-Unis".

Coming FROM somewhere follows the same split: de for feminine, du for masculine.

There is one exception worth knowing early because it is a common country: le Mexique is
masculine despite the -e, so it is "au Mexique".

The same à/en/au choice applies to means of transport, but on a different logic: en for things
you get inside, à for things you sit on. "en voiture", but "à vélo".`,
    pitfall: "The preposition is decided by the country's gender, not by anything about the place. en France, au Canada, aux États-Unis — and à is for cities.",
    table: {
      caption: 'Which preposition, and what decides it',
      columns: ['Word', 'Used with', 'Example'],
      rows: [
        ['à', 'a city', 'je vais à Paris'],
        ['en', 'a feminine country, or one starting with a vowel', 'nous allons en France'],
        ['au', 'a masculine country', 'elle va au Canada'],
        ['aux', 'a plural country', 'il va aux États-Unis'],
      ],
    },
    examples: [
      { text: 'je vais à Paris.', gloss: 'I am going to Paris — a town, so à.',
        tiles: ['je', 'vais', 'à', 'Paris.'] },
      { text: 'nous allons en France.', gloss: 'We are going to France — feminine, so en.',
        tiles: ['nous', 'allons', 'en', 'France.'] },
      { text: 'elle va au Canada.', gloss: 'She is going to Canada — masculine, so au.',
        tiles: ['elle', 'va', 'au', 'Canada.'] },
      { text: 'je pars à vélo.', gloss: 'I am leaving by bike.',
        tiles: ['je', 'pars', 'à', 'vélo.'] },
    ],
  },
  {
    id: 'fr-demonstratives',
    kind: 'grammar',
    title: 'ce, cet, cette, ces',
    summary: 'This and that, and the extra form that exists for the ear',
    explanation: `French has one word for "this" and "that" — the distinction English makes is
simply absent, and context carries it.

ce for a masculine noun, cette for a feminine one, ces for any plural.

The fourth form exists purely for pronunciation: cet is used before a masculine noun starting
with a vowel or a silent h, because "ce homme" is awkward to say. "cet homme", "cet arbre".

When you really must separate this from that, -ci and -là attach to the noun: "ce livre-ci"
against "ce livre-là". In speech that is much rarer than English "this/that", so do not reach
for it by default.`,
    pitfall: 'cet exists for the ear, not for meaning — it is simply ce before a vowel. «ce homme» is not wrong in sense, it is merely unsayable.',
    table: {
      caption: 'Four forms, and only three distinctions',
      columns: ['Word', 'Used before', 'Example'],
      rows: [
        ['ce', 'a masculine noun starting with a consonant', 'ce livre est bon'],
        ['cet', 'a masculine noun starting with a vowel', 'cet homme est mon père'],
        ['cette', 'any feminine noun', 'cette maison est grande'],
        ['ces', 'any plural, either gender', 'ces enfants jouent'],
      ],
    },
    examples: [
      { text: 'ce livre est bon.', gloss: 'This book is good.',
        tiles: ['ce', 'livre', 'est', 'bon.'] },
      { text: 'cette maison est grande.', gloss: 'This house is big.',
        tiles: ['cette', 'maison', 'est', 'grande.'] },
      { text: 'cet homme est mon père.', gloss: 'This man is my father — cet before a vowel.',
        tiles: ['cet', 'homme', 'est', 'mon', 'père.'] },
      { text: 'ces enfants jouent.', gloss: 'These children are playing.',
        tiles: ['ces', 'enfants', 'jouent.'] },
    ],
  },
  {
    id: 'fr-possessives',
    kind: 'grammar',
    title: 'Saying whose it is',
    summary: 'The word agrees with the THING, not with the owner',
    explanation: `mon, ma, mes · ton, ta, tes · son, sa, ses · notre, nos · votre, vos · leur, leurs

The trap for English speakers is son and sa. They do NOT mean his against her — they agree with
the noun that follows. "son livre" is his book OR her book; "sa maison" is his house OR her
house. The owner's gender is invisible, and context supplies it.

There is a pronunciation rule like cet: a feminine noun starting with a vowel takes the
masculine form, because "ma amie" is hard to say. "mon amie" is a female friend.

For the plural owners, notre and votre and leur have only one singular form each — no gender —
which makes them the easy half.`,
    pitfall: 'The word agrees with the THING owned, never with the owner. son livre is his book or her book, and son is chosen because livre is masculine.',
    table: {
      caption: 'It agrees with what is owned',
      columns: ['Word', 'Used before', 'Example'],
      rows: [
        ['mon', 'my — a masculine noun', 'mon livre'],
        ['ma', 'my — a feminine noun', 'ma maison'],
        ['mes', 'my — anything plural', 'mes clés'],
        ['son', 'his or her — a masculine noun', 'son livre'],
        ['sa', 'his or her — a feminine noun', 'sa maison'],
        ['ses', 'his or her — anything plural', 'ses amis'],
        ['notre', 'our — a singular noun', 'notre maison'],
        ['nos', 'our — anything plural', 'nos amis'],
      ],
    },
    examples: [
      { text: 'son livre est sur la table.', gloss: 'His or her book is on the table — sonic agrees with livre.',
        tiles: ['son', 'livre', 'est', 'sur', 'la', 'table.'] },
      { text: 'sa maison est grande.', gloss: 'His or her house is big.',
        tiles: ['sa', 'maison', 'est', 'grande.'] },
      { text: "mon amie s'appelle Marie.", gloss: 'My friend is called Marie — mon before a vowel, though amie is feminine.',
        tiles: ['mon', 'amie', "s'appelle", 'Marie.'] },
    ],
  },
  { id: 'fr-v-basics',  kind: 'vocab', theme: 'basics',
    title: 'Everyday words', summary: 'The small words that hold sentences together' },
  { id: 'fr-v-numbers', kind: 'vocab', theme: 'numbers',
    title: 'Numbers', summary: 'Counting, prices, times, ages' },
  { id: 'fr-v-colours', kind: 'vocab', theme: 'colours',
    title: 'Colours', summary: 'And a first look at adjectives agreeing' },
  { id: 'fr-v-family', kind: 'vocab', theme: 'family',
    title: 'Family', summary: 'The people you describe first' },
  { id: 'fr-v-body',   kind: 'vocab', theme: 'body',
    title: 'The body', summary: 'For the doctor, and for everything that hurts' },
  { id: 'fr-v-routine', kind: 'vocab', theme: 'routine',
    title: 'Daily routine', summary: 'The verbs of an ordinary day' },
  { id: 'fr-v-food',    kind: 'vocab', theme: 'food',
    title: 'Food and drink', summary: 'Enough to order, shop and cook' },
  { id: 'fr-v-verbs',   kind: 'vocab', theme: 'verbs',
    title: 'Common verbs', summary: 'The ones that turn up in every other sentence' },
  { id: 'fr-v-adjectives', kind: 'vocab', theme: 'adjectives',
    title: 'Describing words', summary: 'Big, small, new, old, easy, difficult' },
  { id: 'fr-v-house',     kind: 'vocab', theme: 'house',
    title: 'The house', summary: 'Rooms, furniture, the things in them' },
  { id: 'fr-v-clothing',  kind: 'vocab', theme: 'clothing',
    title: 'Clothes', summary: 'What you are wearing and what you are buying' },
  { id: 'fr-v-weather',   kind: 'vocab', theme: 'weather',
    title: 'Weather', summary: 'The most reliable small talk there is' },
  { id: 'fr-v-places',    kind: 'vocab', theme: 'places',
    title: 'Places in town', summary: 'Where you are going and how to ask for it' },
  { id: 'fr-v-transport', kind: 'vocab', theme: 'transport',
    title: 'Getting around', summary: 'On foot, by bus, by train' },
  { id: 'fr-v-weekdays', kind: 'vocab', theme: 'weekdays',
    title: 'Days of the week', summary: 'lundi through dimanche' },
  { id: 'fr-v-months',   kind: 'vocab', theme: 'months',
    title: 'Months', summary: 'Dates, birthdays, seasons of the year' },
  { id: 'fr-v-seasons',  kind: 'vocab', theme: 'seasons',
    title: 'Seasons', summary: 'Four words that turn up constantly' },
  { id: 'fr-v-tableware', kind: 'vocab', theme: 'tableware',
    title: 'At the table', summary: 'Plates, glasses, knives and forks' },
  { id: 'fr-v-school',  kind: 'vocab', theme: 'school',
    title: 'School', summary: 'Classroom words, and the things on a desk' },
  { id: 'fr-v-animals', kind: 'vocab', theme: 'animals',
    title: 'Animals', summary: 'Pets, farm animals, and the words for them' },
  { id: 'fr-v-everyday', kind: 'vocab', theme: 'everyday',
    title: 'Everyday life', summary: 'Birthdays, hunger, parties and open doors' },
];
