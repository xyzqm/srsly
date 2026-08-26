import type { Lesson } from '@/lib/lessons';

/**
 * The Spanish lesson tree — WRITTEN, not sourced.
 *
 * Same constraint and same reasoning as lib/data/lessons/fr.ts: good grammar courses are
 * copyrighted and paraphrasing one is not a loophole, while the SYLLABUS — gender, agreement,
 * ser versus estar, the two past tenses — is universal structure the language simply has.
 *
 * It follows the French tree's shape deliberately, so a learner studying both meets the same
 * furniture. What it does NOT do is follow its content: the hard parts of Spanish are not the
 * hard parts of French. `ser`/`estar`, `gustar`'s backwards construction, and `por`/`para` have
 * no French counterpart and get lessons of their own; French elision and the partitive have no
 * Spanish counterpart and are absent.
 *
 * Every example is checked against the REAL dictionary through the REAL segmenter by
 * tests/lessons.test.ts. They are rendered as plain text rather than tappable tokens — an
 * example arrives with its translation — so that check is not about this screen: it is about
 * not teaching a word the app cannot define when the learner meets it in the wild.
 */
export const ES_LESSONS: Lesson[] = [
  // ── Unit 1 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'es-gender',
    unit: 'Nouns and articles',
    kind: 'grammar',
    title: 'Every noun has a gender',
    summary: 'el or la — and the -o/-a rule that mostly works',
    explanation: `Every Spanish noun is masculine or feminine, and the article says which: el
for masculine, la for feminine.

Spanish is kinder about this than most languages, because the ending usually tells you. Nouns
in -o are almost always masculine, nouns in -a almost always feminine. That covers most of what
you will meet.

The exceptions are worth meeting early rather than being surprised by. A few common -a nouns are
masculine — el día, el mapa, el problema — and a few -o nouns are feminine, most famously la
mano. And many nouns end in neither letter, so el and la are simply learned with the word.

You have been seeing this while reading: tap an inflected word and the note under the definition
says things like "feminine plural". That is this, doing visible work.`,
    examples: [
      { text: 'el libro está en la mesa.', gloss: 'The book is on the table.' },
      { text: 'la casa es grande.', gloss: 'The house is big.' },
      { text: 'el día es largo.', gloss: 'The day is long — día ends in -a but is masculine.' },
      { text: 'la mano es pequeña.', gloss: 'The hand is small — mano ends in -o but is feminine.' },
    ],
  },
  {
    id: 'es-plural',
    unit: 'Nouns and articles',
    kind: 'grammar',
    title: 'Making things plural',
    summary: 'Add -s, or -es after a consonant',
    explanation: `A noun ending in a vowel adds -s. A noun ending in a consonant adds -es. The
article becomes los or las, keeping the gender.

Unlike French, the plural is fully pronounced, so you hear it as well as read it.

Two spelling adjustments follow from how Spanish is written rather than from grammar: a final -z
becomes -c before the ending (lápiz becomes lápices), and a written accent on the last syllable
usually disappears in the plural, because the stress no longer needs marking.`,
    examples: [
      { text: 'los libros están en la mesa.', gloss: 'The books are on the table.' },
      { text: 'las casas son grandes.', gloss: 'The houses are big.' },
      { text: 'los papeles están aquí.', gloss: 'The papers are here — consonant, so -es.' },
    ],
  },
  {
    id: 'es-articles',
    unit: 'Nouns and articles',
    kind: 'grammar',
    title: 'un and una, el and la',
    summary: 'A thing versus the thing — and why Spanish says "the" more',
    explanation: `un and una are "a": one of something, not yet identified. el and la are "the":
something already known, or a whole category.

The part that surprises English speakers is the second half. Spanish uses the definite article
for things in general, where English uses no article at all. "me gusta el café" is "I like
coffee" — not "the coffee". It is also used with days and with most titles.

Two contractions are obligatory and worth learning as single words: a + el becomes al, and
de + el becomes del. Nobody writes "a el" or "de el".`,
    examples: [
      { text: 'veo un perro en la calle.', gloss: 'I see a dog in the street.' },
      { text: 'voy al mercado.', gloss: 'I am going to the market — a + el becomes al.' },
      { text: 'la puerta del coche está abierta.', gloss: 'The car door is open — de + el becomes del.' },
    ],
  },
  { id: 'es-v-basics',  unit: 'Nouns and articles', kind: 'vocab', theme: 'basics',
    title: 'Everyday words', summary: 'The small words that hold sentences together' },
  { id: 'es-v-numbers', unit: 'Nouns and articles', kind: 'vocab', theme: 'numbers',
    title: 'Numbers', summary: 'Counting, prices, times, ages' },
  { id: 'es-v-colours', unit: 'Nouns and articles', kind: 'vocab', theme: 'colours',
    title: 'Colours', summary: 'And a first look at adjectives agreeing' },

  // ── Unit 2 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'es-ser-estar',
    unit: 'Being and having',
    kind: 'grammar',
    title: 'ser and estar — two verbs for "to be"',
    summary: 'The single biggest thing that makes Spanish feel foreign',
    explanation: `Spanish splits "to be" in two, and choosing between them is the first real
decision a learner has to make in every sentence.

ser: soy · eres · es · somos · sois · son
estar: estoy · estás · está · estamos · estáis · están

ser is for what something IS — identity, origin, what it is made of, what it is for, and
qualities you think of as belonging to the thing. estar is for where something is and what state
it is in right now.

"soy alegre" says I am a cheerful person. "estoy alegre" says I am happy at the moment. Neither
is wrong; they say different things, and that pair is the clearest way to feel the difference.

Location is always estar, even for something that has not moved in eight hundred years: "la
catedral está en la plaza".`,
    examples: [
      { text: 'soy profesor.', gloss: 'I am a teacher — an identity, so ser.' },
      { text: 'estoy cansado.', gloss: 'I am tired — a state right now, so estar.' },
      { text: 'la casa es blanca.', gloss: 'The house is white — a lasting quality.' },
      { text: 'la casa está lejos.', gloss: 'The house is far away — location, always estar.' },
    ],
  },
  {
    id: 'es-tener',
    unit: 'Being and having',
    kind: 'grammar',
    title: 'tener — to have, and to be',
    summary: 'tengo veinte años, not «soy veinte»',
    explanation: `tener is "to have":

tengo · tienes · tiene · tenemos · tenéis · tienen

Like French, Spanish uses "have" for several states where English uses "be": age, hunger,
thirst, cold, fear. "tengo hambre" is "I am hungry", literally "I have hunger". Saying "soy
hambre" stops a sentence dead, so these are worth learning as fixed phrases.

tener que plus an infinitive is how you say you have to do something: "tengo que trabajar".`,
    examples: [
      { text: 'tengo un hermano y una hermana.', gloss: 'I have a brother and a sister.' },
      { text: 'tengo hambre.', gloss: 'I am hungry — literally, I have hunger.' },
      { text: 'tenemos que salir ahora.', gloss: 'We have to leave now.' },
    ],
  },
  { id: 'es-v-family', unit: 'Being and having', kind: 'vocab', theme: 'family',
    title: 'Family', summary: 'The people you describe first' },
  { id: 'es-v-body',   unit: 'Being and having', kind: 'vocab', theme: 'body',
    title: 'The body', summary: 'For the doctor, and for everything that hurts' },

  // ── Unit 3 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'es-present',
    unit: 'Doing things',
    kind: 'grammar',
    title: 'The present tense',
    summary: 'Three endings sets: -ar, -er, -ir',
    explanation: `Spanish verbs come in three families, named for how the infinitive ends. Drop
the ending and add:

-ar: -o, -as, -a, -amos, -áis, -an
-er: -o, -es, -e, -emos, -éis, -en
-ir: -o, -es, -e, -imos, -ís, -en

The -er and -ir sets differ only in the "we" and "you all" forms, so in practice there are two
patterns and a small adjustment.

Because each ending is distinct and fully pronounced, Spanish does not need the subject pronoun
the way English does. "hablo" already means "I speak", and adding "yo" is for emphasis or
contrast. Leaving it out is normal, not casual.`,
    examples: [
      { text: 'hablo español con mi madre.', gloss: 'I speak Spanish with my mother.' },
      { text: 'comemos juntos por la noche.', gloss: 'We eat together in the evening.' },
      { text: 'viven en una ciudad pequeña.', gloss: 'They live in a small city.' },
      { text: 'trabajas mucho.', gloss: 'You work a lot.' },
    ],
  },
  {
    id: 'es-negation',
    unit: 'Doing things',
    kind: 'grammar',
    title: 'Saying no',
    summary: 'One word, and it goes in front',
    explanation: `Negation in Spanish is simple: put no before the verb. That is the whole rule.

What surprises English speakers is the double negative, which is not only allowed but required.
"no veo nada" is "I do not see anything" — literally "I do not see nothing". If a negative word
like nada, nadie or nunca comes after the verb, the no stays.

Move the negative word in front of the verb and the no disappears: "nunca voy" and "no voy
nunca" both mean "I never go".`,
    examples: [
      { text: 'no entiendo.', gloss: 'I do not understand.' },
      { text: 'no hay nadie en casa.', gloss: 'There is nobody at home.' },
      { text: 'nunca comemos carne.', gloss: 'We never eat meat.' },
    ],
  },
  {
    id: 'es-gustar',
    unit: 'Doing things',
    kind: 'grammar',
    title: 'gustar works backwards',
    summary: 'The thing does the liking, not you',
    explanation: `"me gusta el café" does not mean "I like the coffee" in its own grammar. It
means something closer to "coffee pleases me". The thing liked is the SUBJECT, and you are the
one it happens to.

That has one consequence you cannot avoid: the verb agrees with the thing, not with you. One
thing takes gusta; several things take gustan.

me gusta el libro · me gustan los libros

The person changes with the little word in front: me, te, le, nos, os, les. So "te gusta" is
"you like it" and "les gustan" is "they like them".

A handful of very common verbs work the same way — encantar, interesar, doler. Once the pattern
clicks for gustar it comes free for all of them.`,
    examples: [
      { text: 'me gusta el café.', gloss: 'I like coffee — literally, coffee pleases me.' },
      { text: 'me gustan los libros.', gloss: 'I like books — plural thing, so gustan.' },
      { text: 'no le gusta el frío.', gloss: 'He does not like the cold.' },
      { text: 'me duele la cabeza.', gloss: 'My head hurts — the same backwards pattern.' },
    ],
  },
  { id: 'es-v-routine', unit: 'Doing things', kind: 'vocab', theme: 'routine',
    title: 'Daily routine', summary: 'The verbs of an ordinary day' },
  { id: 'es-v-food',    unit: 'Doing things', kind: 'vocab', theme: 'food',
    title: 'Food and drink', summary: 'Enough to order, shop and cook' },
  { id: 'es-v-verbs',   unit: 'Doing things', kind: 'vocab', theme: 'verbs',
    title: 'Common verbs', summary: 'The ones that turn up in every other sentence' },

  // ── Unit 4 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'es-adjectives',
    unit: 'Describing',
    kind: 'grammar',
    title: 'Adjectives agree with their noun',
    summary: 'In gender and in number, both audible',
    explanation: `A Spanish adjective changes to match its noun in gender and number.

Adjectives ending in -o have four forms: rojo, roja, rojos, rojas. Adjectives ending in -e or a
consonant have only two — one for singular and one for plural — because they do not mark
gender: grande and grandes, azul and azules.

Unlike French, every one of these endings is pronounced, so agreement is something you hear
constantly and cannot treat as a spelling detail.`,
    examples: [
      { text: 'un perro pequeño.', gloss: 'A small dog.' },
      { text: 'una casa pequeña.', gloss: 'A small house.' },
      { text: 'los coches rojos.', gloss: 'The red cars.' },
      { text: 'las flores son grandes.', gloss: 'The flowers are big — grande has no gender form.' },
    ],
  },
  {
    id: 'es-adj-position',
    unit: 'Describing',
    kind: 'grammar',
    title: 'Where the adjective goes',
    summary: 'After the noun — and what moving it does',
    explanation: `The default is the opposite of English: the adjective FOLLOWS the noun. "un
coche rojo", never "un rojo coche".

Numbers and quantity words go before, as in English: "dos libros", "muchas casas".

Moving a descriptive adjective in front is not a mistake — it changes the flavour. After the
noun it distinguishes ("la casa blanca" is the white one, not the blue one). Before it, the
quality is presented as simply belonging to the thing, which is why it is common in writing.

A few adjectives change meaning outright with position. "un hombre grande" is a big man; "un
gran hombre" is a great one. Note that grande shortens to gran directly before any singular
noun.`,
    examples: [
      { text: 'un coche rojo.', gloss: 'A red car — the normal order.' },
      { text: 'tengo dos hermanos.', gloss: 'I have two brothers — numbers go before.' },
      { text: 'un hombre grande.', gloss: 'A big man.' },
      { text: 'un gran hombre.', gloss: 'A great man — same word, moved.' },
    ],
  },
  { id: 'es-v-adjectives', unit: 'Describing', kind: 'vocab', theme: 'adjectives',
    title: 'Describing words', summary: 'Big, small, new, old, easy, difficult' },
  { id: 'es-v-house',     unit: 'Describing', kind: 'vocab', theme: 'house',
    title: 'The house', summary: 'Rooms, furniture, the things in them' },
  { id: 'es-v-clothing',  unit: 'Describing', kind: 'vocab', theme: 'clothing',
    title: 'Clothes', summary: 'What you are wearing and what you are buying' },
  { id: 'es-v-weather',   unit: 'Describing', kind: 'vocab', theme: 'weather',
    title: 'Weather', summary: 'The most reliable small talk there is' },

  // ── Unit 5 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'es-questions',
    unit: 'Asking',
    kind: 'grammar',
    title: 'Asking a question',
    summary: 'Mostly just your voice — plus the upside-down mark',
    explanation: `A statement becomes a question by intonation alone. "hablas español" and
"¿hablas español?" are the same words; only the voice changes. You may also put the subject
after the verb, but you do not have to.

In writing, a question opens with an upside-down question mark as well as closing with a normal
one: ¿...? Exclamations do the same with ¡...! This is genuinely useful rather than decorative —
it tells a reader that a long sentence is a question before they reach the end.

The question words carry a written accent: qué, quién, dónde, cuándo, cómo, por qué, cuánto.
The accent is what distinguishes the question word from the ordinary one, which is why "porque"
(because) and "por qué" (why) are not the same thing.`,
    examples: [
      { text: '¿hablas español?', gloss: 'Do you speak Spanish?' },
      { text: '¿dónde está la estación?', gloss: 'Where is the station?' },
      { text: '¿cuánto cuesta este libro?', gloss: 'How much is this book?' },
      { text: 'no voy porque estoy cansado.', gloss: 'I am not going because I am tired.' },
    ],
  },
  {
    id: 'es-por-para',
    unit: 'Asking',
    kind: 'grammar',
    title: 'por and para',
    summary: 'Both are "for", and they are not interchangeable',
    explanation: `English uses "for" where Spanish makes a distinction it takes a while to feel.

para points FORWARD — a destination, a purpose, a deadline, a recipient. "salgo para Madrid",
"un regalo para ti", "es para mañana".

por points BACKWARD or THROUGH — a cause, a reason, an exchange, a period of time, movement
through a place. "gracias por el regalo", "lo compré por diez euros", "caminamos por el parque".

A pair worth holding on to: "lo hago por ti" means I do it because of you, on your behalf; "lo
hago para ti" means I am making it to give to you.`,
    examples: [
      { text: 'este regalo es para mi madre.', gloss: 'This present is for my mother — recipient.' },
      { text: 'gracias por todo.', gloss: 'Thanks for everything — cause.' },
      { text: 'caminamos por el parque.', gloss: 'We walk through the park — movement through.' },
      { text: 'salgo para el trabajo.', gloss: 'I am leaving for work — destination.' },
    ],
  },
  { id: 'es-v-places',    unit: 'Asking', kind: 'vocab', theme: 'places',
    title: 'Places in town', summary: 'Where you are going and how to ask for it' },
  { id: 'es-v-transport', unit: 'Asking', kind: 'vocab', theme: 'transport',
    title: 'Getting around', summary: 'On foot, by bus, by train' },

  // ── Unit 6 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'es-futuro-proximo',
    unit: 'Past and future',
    kind: 'grammar',
    title: 'What is about to happen',
    summary: 'ir a plus an infinitive',
    explanation: `To say something is going to happen, use ir a followed by an infinitive — the
same shape as English "going to".

voy · vas · va · vamos · vais · van

The a is not optional: "voy a comer", never "voy comer".

This is how most future time gets expressed in speech. There is a separate future tense with its
own endings, and it is used, but it leans formal — and it is often used for something else
entirely: guessing. "¿dónde está Juan? — estará en casa" means "he is probably at home", not a
statement about the future.`,
    examples: [
      { text: 'voy a comer.', gloss: 'I am going to eat.' },
      { text: 'vamos a salir pronto.', gloss: 'We are going to leave soon.' },
      { text: 'va a llover.', gloss: 'It is going to rain.' },
    ],
  },
  {
    id: 'es-preterito',
    unit: 'Past and future',
    kind: 'grammar',
    title: 'The preterite',
    summary: 'What happened, finished and done',
    explanation: `The preterite is the tense for a completed event — something that happened,
started and ended.

-ar: -é, -aste, -ó, -amos, -asteis, -aron
-er and -ir: -í, -iste, -ió, -imos, -isteis, -ieron

The accents on the first and third person singular are doing real work: hablo is "I speak" and
habló is "he spoke". Losing the accent changes the tense and the person at once.

A handful of very common verbs are irregular here and simply have to be learned: ser and ir
share the same preterite (fui, fuiste, fue), which sounds like a problem and never is, because
context settles it instantly.`,
    examples: [
      { text: 'comí una manzana.', gloss: 'I ate an apple.' },
      { text: 'habló con su madre.', gloss: 'He spoke with his mother.' },
      { text: 'terminamos el trabajo ayer.', gloss: 'We finished the work yesterday.' },
      { text: 'fui al mercado.', gloss: 'I went to the market — fui is both ser and ir.' },
    ],
  },
  {
    id: 'es-imperfecto',
    unit: 'Past and future',
    kind: 'grammar',
    title: 'The imperfect, and choosing between the two pasts',
    summary: 'How things used to be, versus what happened once',
    explanation: `The imperfect describes a past with no edges: what things were like, what you
used to do, what was going on when something else happened.

-ar: -aba, -abas, -aba, -ábamos, -abais, -aban
-er and -ir: -ía, -ías, -ía, -íamos, -íais, -ían

Only three verbs are irregular in the entire tense — ser, ir and ver — which makes it the most
predictable tense in the language.

The real skill is choosing between this and the preterite, and it is not about how long ago
something was. The preterite is a finished event; the imperfect is a background, a habit or a
state. One sentence often needs both: "comía cuando llegó" — I was eating (background) when he
arrived (event).`,
    examples: [
      { text: 'cuando era pequeño, jugaba en el parque.', gloss: 'When I was small, I used to play in the park.' },
      { text: 'hacía frío.', gloss: 'It was cold.' },
      { text: 'vivíamos cerca del mar.', gloss: 'We lived near the sea.' },
    ],
  },
  {
    id: 'es-reflexive',
    unit: 'Past and future',
    kind: 'grammar',
    title: 'Reflexive verbs',
    summary: 'levantarse, lavarse — doing something to yourself',
    explanation: `A reflexive verb carries a pronoun pointing back at the subject: the person
doing the action is also receiving it. The infinitive is written with -se on the end.

me levanto · te levantas · se levanta · nos levantamos · os levantáis · se levantan

Many ordinary daily-routine verbs are reflexive in Spanish where the English is not, which is
why they are among the first verbs worth having.

The pronoun normally goes before the verb, but it attaches to the END of an infinitive or a
command: "voy a levantarme", "levántate".

Some verbs change meaning with the pronoun: ir is "to go", irse is "to leave"; dormir is "to
sleep", dormirse is "to fall asleep".`,
    examples: [
      { text: 'me levanto a las siete.', gloss: 'I get up at seven.' },
      { text: 'se lava las manos.', gloss: 'She washes her hands.' },
      { text: 'nos levantamos temprano.', gloss: 'We get up early.' },
    ],
  },
  { id: 'es-v-weekdays', unit: 'Past and future', kind: 'vocab', theme: 'weekdays',
    title: 'Days of the week', summary: 'lunes through domingo' },
  { id: 'es-v-months',   unit: 'Past and future', kind: 'vocab', theme: 'months',
    title: 'Months', summary: 'Dates, birthdays, seasons of the year' },
  { id: 'es-v-seasons',  unit: 'Past and future', kind: 'vocab', theme: 'seasons',
    title: 'Seasons', summary: 'Four words that turn up constantly' },

  // ── Unit 7 ─────────────────────────────────────────────────────────────────────────────
  {
    id: 'es-object-pronouns',
    unit: 'Beyond the basics',
    kind: 'grammar',
    title: 'Object pronouns go before the verb',
    summary: 'lo, la, le — and where they attach instead',
    explanation: `Spanish puts the object pronoun in front of the conjugated verb, where English
puts it after: "lo veo" is "I see him".

Direct objects are me, te, lo, la, nos, os, los, las. Indirect objects are me, te, le, nos, os,
les — and the pair worth separating is lo/la against le. "lo veo" is I see him; "le hablo" is I
speak TO him.

When both appear, the indirect comes first: "me lo da" — he gives it to me. And when both are
third person, le turns into se, which is the one rule that looks arbitrary and simply has to be
learned: "se lo doy", never "le lo doy".

With an infinitive or a command the pronoun attaches to the END instead: "voy a verlo",
"dímelo".`,
    examples: [
      { text: 'lo veo todos los días.', gloss: 'I see him every day.' },
      { text: 'le hablo por teléfono.', gloss: 'I speak to him on the phone.' },
      { text: 'me lo da.', gloss: 'He gives it to me — indirect first.' },
      { text: 'voy a verlo mañana.', gloss: 'I am going to see him tomorrow — attached to the infinitive.' },
    ],
  },
  {
    id: 'es-saber-conocer',
    unit: 'Beyond the basics',
    kind: 'grammar',
    title: 'saber and conocer',
    summary: 'Two verbs for "to know", split by what you know',
    explanation: `Spanish splits "to know" the way it splits "to be", and the line is clean.

saber is knowing a FACT, or knowing HOW to do something. sé, sabes, sabe, sabemos, sabéis, saben.

conocer is being ACQUAINTED with a person, a place, or a work. conozco, conoces, conoce,
conocemos, conocéis, conocen.

"sé la respuesta" — I know the answer. "conozco a María" — I know María. You cannot swap them:
saying "sé a María" is not a shade of meaning, it is simply wrong.

saber plus an infinitive is "know how to": "sé nadar" is "I can swim" in the sense of having
learned, which is different from poder.

Note the a before a person — Spanish marks a personal object that way, and it is easy to drop.`,
    examples: [
      { text: 'sé la respuesta.', gloss: 'I know the answer — a fact.' },
      { text: 'conozco a María.', gloss: 'I know María — acquaintance, and note the personal a.' },
      { text: 'sé nadar.', gloss: 'I know how to swim.' },
    ],
  },
  {
    id: 'es-perfecto',
    unit: 'Beyond the basics',
    kind: 'grammar',
    title: 'The present perfect',
    summary: 'he hablado — and how it differs from the preterite',
    explanation: `haber in the present plus a past participle: he, has, ha, hemos, habéis, han,
followed by -ado for -ar verbs and -ido for -er and -ir.

he hablado · has comido · ha vivido

It describes something finished but still connected to now — today, this week, ever in your
life. The preterite is for something closed off: yesterday, last year, and done.

"hoy he comido bien" against "ayer comí bien". The dividing line is roughly whether the time
period is still going on.

Worth knowing as a reader: much of Latin America prefers the preterite where Spain uses this
tense, so the same sentence can be said either way depending on where the writer is from.

The participle never changes here, whatever the subject — that only happens when it is used as
an adjective.`,
    examples: [
      { text: 'hoy he comido bien.', gloss: 'I have eaten well today — today is still going.' },
      { text: 'ayer comí bien.', gloss: 'I ate well yesterday — closed off, so the preterite.' },
      { text: 'nunca he visto el mar.', gloss: 'I have never seen the sea.' },
    ],
  },
  {
    id: 'es-comparatives',
    unit: 'Beyond the basics',
    kind: 'grammar',
    title: 'Comparing things',
    summary: 'más, menos, tan — and four irregulars',
    explanation: `más … que for more, menos … que for less, tan … como for as … as.

es más alto que yo — he is taller than me.
no es tan caro como pensaba — it is not as expensive as I thought.

The superlative just adds the article: el más alto, la más grande.

Four comparatives are irregular and are the ones you meet constantly: bueno → mejor, malo →
peor, grande → mayor, pequeño → menor. You do not say "más bueno" for quality.

There is also a separate superlative ending, -ísimo, which is not a comparison at all but an
intensifier: "buenísimo" is "really good", not "the best".`,
    examples: [
      { text: 'es más alto que yo.', gloss: 'He is taller than me.' },
      { text: 'este libro es mejor.', gloss: 'This book is better — not «más bueno».' },
      { text: 'no es tan caro como pensaba.', gloss: 'It is not as expensive as I thought.' },
    ],
  },
  {
    id: 'es-imperative',
    unit: 'Beyond the basics',
    kind: 'grammar',
    title: 'Telling someone to do something',
    summary: 'And the negative that changes the ending',
    explanation: `For an informal tú command, use the third-person present: habla, come, vive.
That is the same form as "he speaks", and context separates them.

Eight very common verbs are irregular here and simply have to be known: di, haz, ve, pon, sal,
sé, ten, ven.

The negative is NOT that form. It switches to the subjunctive endings, which flips the vowel:
no hables, no comas, no vivas. So "habla" and "no hables" use different stems, which is the
single most surprising thing about Spanish commands.

Pronouns attach to the end of a positive command and go in front of a negative one: "dímelo",
but "no me lo digas".`,
    examples: [
      { text: 'habla más despacio.', gloss: 'Speak more slowly.' },
      { text: 'no hables tan rápido.', gloss: 'Do not speak so fast — the negative changes the ending.' },
      { text: 'ven aquí.', gloss: 'Come here — an irregular command.' },
    ],
  },
  { id: 'es-v-tableware', unit: 'Beyond the basics', kind: 'vocab', theme: 'tableware',
    title: 'At the table', summary: 'Plates, glasses, knives and forks' },
  { id: 'es-v-school',    unit: 'Beyond the basics', kind: 'vocab', theme: 'school',
    title: 'School', summary: 'Classroom words, and the things on a desk' },
  { id: 'es-v-animals',   unit: 'Beyond the basics', kind: 'vocab', theme: 'animals',
    title: 'Animals', summary: 'Pets, farm animals, and the words for them' },
  { id: 'es-v-everyday',  unit: 'Beyond the basics', kind: 'vocab', theme: 'everyday',
    title: 'Everyday life', summary: 'Birthdays, hunger, parties and the sky' },
];
