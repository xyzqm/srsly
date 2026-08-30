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
  {
    id: 'es-gender',
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
    pitfall: 'The -o/-a rule is a strong hint, not a law. día, mapa and problema are masculine; mano and foto are feminine. Learn the article together with the noun.',
    examples: [
      { text: 'el libro está en la mesa.', gloss: 'The book is on the table.',
        tiles: ['el', 'libro', 'está', 'en', 'la', 'mesa.'] },
      { text: 'la casa es grande.', gloss: 'The house is big.',
        tiles: ['la', 'casa', 'es', 'grande.'] },
      { text: 'el día es largo.', gloss: 'The day is long — día ends in -a but is masculine.',
        tiles: ['el', 'día', 'es', 'largo.'] },
      { text: 'la mano es pequeña.', gloss: 'The hand is small — mano ends in -o but is feminine.',
        tiles: ['la', 'mano', 'es', 'pequeña.'] },
    ],
  },
  {
    id: 'es-plural',
    kind: 'grammar',
    title: 'Making things plural',
    summary: 'Add -s, or -es after a consonant',
    explanation: `A noun ending in a vowel adds -s. A noun ending in a consonant adds -es. The
article becomes los or las, keeping the gender.

Unlike French, the plural is fully pronounced, so you hear it as well as read it.

Two spelling adjustments follow from how Spanish is written rather than from grammar: a final -z
becomes -c before the ending (lápiz becomes lápices), and a written accent on the last syllable
usually disappears in the plural, because the stress no longer needs marking.`,
    pitfall: 'The article pluralises too, and you can hear it. Writing casas but leaving la is the mistake — it is las casas, marked in both places.',
    examples: [
      { text: 'los libros están en la mesa.', gloss: 'The books are on the table.',
        tiles: ['los', 'libros', 'están', 'en', 'la', 'mesa.'] },
      { text: 'las casas son grandes.', gloss: 'The houses are big.',
        tiles: ['las', 'casas', 'son', 'grandes.'] },
      { text: 'los papeles están aquí.', gloss: 'The papers are here — consonant, so -es.',
        tiles: ['los', 'papeles', 'están', 'aquí.'] },
    ],
  },
  {
    id: 'es-articles',
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
    pitfall: "Spanish uses the definite article where English uses nothing at all: me gusta el café, los lunes. Leaving it out is the commonest tell in a beginner's Spanish.",
    examples: [
      { text: 'veo un perro en la calle.', gloss: 'I see a dog in the street.',
        tiles: ['veo', 'un', 'perro', 'en', 'la', 'calle.'] },
      { text: 'voy al mercado.', gloss: 'I am going to the market — a + el becomes al.',
        tiles: ['voy', 'al', 'mercado.'] },
      { text: 'la puerta del coche está abierta.', gloss: 'The car door is open — de + el becomes del.',
        tiles: ['la', 'puerta', 'del', 'coche', 'está', 'abierta.'] },
    ],
  },
  {
    id: 'es-ser-estar',
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
    pitfall: '«Temporary means estar» is a rough guide, not the rule. Location is always estar even for a mountain, and the time is always ser even though it changes every minute.',
    table: {
      caption: 'The two verbs side by side',
      columns: ['Form', 'Which verb, and what it is doing', 'Example'],
      rows: [
        ['soy', 'ser — who or what you are', 'soy profesor'],
        ['estoy', 'estar — how you are right now', 'estoy cansado'],
        ['es', 'ser — what a thing is, and the time', 'la casa es blanca'],
        ['está', 'estar — where a thing is, and its state', 'la casa está lejos'],
        ['son', 'ser — plural identity', 'son mis hermanos'],
        ['están', 'estar — plural state or place', 'están aquí'],
      ],
    },
    examples: [
      { text: 'soy profesor.', gloss: 'I am a teacher — an identity, so ser.',
        tiles: ['soy', 'profesor.'] },
      { text: 'estoy cansado.', gloss: 'I am tired — a state right now, so estar.',
        tiles: ['estoy', 'cansado.'] },
      { text: 'la casa es blanca.', gloss: 'The house is white — a lasting quality.',
        tiles: ['la', 'casa', 'es', 'blanca.'] },
      { text: 'la casa está lejos.', gloss: 'The house is far away — location, always estar.',
        tiles: ['la', 'casa', 'está', 'lejos.'] },
    ],
  },
  {
    id: 'es-tener',
    kind: 'grammar',
    title: 'tener — to have, and to be',
    summary: 'tengo veinte años, not «soy veinte»',
    explanation: `tener is "to have":

tengo · tienes · tiene · tenemos · tenéis · tienen

Like French, Spanish uses "have" for several states where English uses "be": age, hunger,
thirst, cold, fear. "tengo hambre" is "I am hungry", literally "I have hunger". Saying "soy
hambre" stops a sentence dead, so these are worth learning as fixed phrases.

tener que plus an infinitive is how you say you have to do something: "tengo que trabajar".`,
    pitfall: 'Age, hunger, cold and fear are things you HAVE in Spanish. «soy veinte» and «estoy hambre» are the word-for-word translations, and both are wrong.',
    examples: [
      { text: 'tengo un hermano y una hermana.', gloss: 'I have a brother and a sister.',
        tiles: ['tengo', 'un', 'hermano', 'y', 'una', 'hermana.'] },
      { text: 'tengo hambre.', gloss: 'I am hungry — literally, I have hunger.',
        tiles: ['tengo', 'hambre.'] },
      { text: 'tenemos que salir ahora.', gloss: 'We have to leave now.',
        tiles: ['tenemos', 'que', 'salir', 'ahora.'] },
    ],
  },
  {
    id: 'es-present',
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
    pitfall: 'The ending already carries the person, so the pronoun is normally dropped. Saying yo hablo every time is not an error but sounds insistent, as though contradicting somebody.',
    table: {
      caption: 'The three ending sets',
      columns: ['Verb', 'Endings', 'Example'],
      rows: [
        ['hablar', '-o · -as · -a · -amos · -áis · -an', 'hablo español'],
        ['comer', '-o · -es · -e · -emos · -éis · -en', 'comemos juntos'],
        ['vivir', '-o · -es · -e · -imos · -ís · -en', 'viven aquí'],
      ],
    },
    examples: [
      { text: 'hablo español con mi madre.', gloss: 'I speak Spanish with my mother.',
        tiles: ['hablo', 'español', 'con', 'mi', 'madre.'] },
      { text: 'comemos juntos por la noche.', gloss: 'We eat together in the evening.',
        tiles: ['comemos', 'juntos', 'por', 'la', 'noche.'] },
      { text: 'viven en una ciudad pequeña.', gloss: 'They live in a small city.',
        tiles: ['viven', 'en', 'una', 'ciudad', 'pequeña.'] },
      { text: 'trabajas mucho.', gloss: 'You work a lot.',
        tiles: ['trabajas', 'mucho.'] },
    ],
  },
  {
    id: 'es-negation',
    kind: 'grammar',
    title: 'Saying no',
    summary: 'One word, and it goes in front',
    explanation: `Negation in Spanish is simple: put no before the verb. That is the whole rule.

What surprises English speakers is the double negative, which is not only allowed but required.
"no veo nada" is "I do not see anything" — literally "I do not see nothing". If a negative word
like nada, nadie or nunca comes after the verb, the no stays.

Move the negative word in front of the verb and the no disappears: "nunca voy" and "no voy
nunca" both mean "I never go".`,
    pitfall: 'Spanish stacks negatives deliberately. «no veo nada» is correct and «no veo algo» is not — the double negative is the grammar, not a slip.',
    examples: [
      { text: 'no entiendo.', gloss: 'I do not understand.',
        tiles: ['no', 'entiendo.'] },
      { text: 'no hay nadie en casa.', gloss: 'There is nobody at home.',
        tiles: ['no', 'hay', 'nadie', 'en', 'casa.'] },
      { text: 'nunca comemos carne.', gloss: 'We never eat meat.',
        tiles: ['nunca', 'comemos', 'carne.'] },
    ],
  },
  {
    id: 'es-gustar',
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
    pitfall: 'The thing liked is the SUBJECT, so the verb agrees with it: me gustan los libros, never me gusta los libros. You are the indirect object throughout, never yo.',
    examples: [
      { text: 'me gusta el café.', gloss: 'I like coffee — literally, coffee pleases me.',
        tiles: ['me', 'gusta', 'el', 'café.'] },
      { text: 'me gustan los libros.', gloss: 'I like books — plural thing, so gustan.',
        tiles: ['me', 'gustan', 'los', 'libros.'] },
      { text: 'no le gusta el frío.', gloss: 'He does not like the cold.',
        tiles: ['no', 'le', 'gusta', 'el', 'frío.'] },
      { text: 'me duele la cabeza.', gloss: 'My head hurts — the same backwards pattern.',
        tiles: ['me', 'duele', 'la', 'cabeza.'] },
    ],
  },
  {
    id: 'es-adjectives',
    kind: 'grammar',
    title: 'Adjectives agree with their noun',
    summary: 'In gender and in number, both audible',
    explanation: `A Spanish adjective changes to match its noun in gender and number.

Adjectives ending in -o have four forms: rojo, roja, rojos, rojas. Adjectives ending in -e or a
consonant have only two — one for singular and one for plural — because they do not mark
gender: grande and grandes, azul and azules.

Unlike French, every one of these endings is pronounced, so agreement is something you hear
constantly and cannot treat as a spelling detail.`,
    pitfall: 'The adjective agrees in gender and number, and unlike French you can hear every bit of it. «una casa blanco» is a mistake a listener catches instantly.',
    examples: [
      { text: 'un perro pequeño.', gloss: 'A small dog.',
        tiles: ['un', 'perro', 'pequeño.'] },
      { text: 'una casa pequeña.', gloss: 'A small house.',
        tiles: ['una', 'casa', 'pequeña.'] },
      { text: 'los coches rojos.', gloss: 'The red cars.',
        tiles: ['los', 'coches', 'rojos.'] },
      { text: 'las flores son grandes.', gloss: 'The flowers are big — grande has no gender form.',
        tiles: ['las', 'flores', 'son', 'grandes.'] },
    ],
  },
  {
    id: 'es-adj-position',
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
    pitfall: 'Moving the adjective changes the meaning rather than just the register. un gran hombre is a great man; un hombre grande is a large one.',
    examples: [
      { text: 'un coche rojo.', gloss: 'A red car — the normal order.',
        tiles: ['un', 'coche', 'rojo.'] },
      { text: 'tengo dos hermanos.', gloss: 'I have two brothers — numbers go before.',
        tiles: ['tengo', 'dos', 'hermanos.'] },
      { text: 'un hombre grande.', gloss: 'A big man.',
        tiles: ['un', 'hombre', 'grande.'] },
      { text: 'un gran hombre.', gloss: 'A great man — same word, moved.',
        tiles: ['un', 'gran', 'hombre.'] },
    ],
  },
  {
    id: 'es-questions',
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
    pitfall: 'Both marks are required in writing, and the opening ¿ goes exactly where the question starts — which is not always the start of the sentence.',
    table: {
      caption: 'The question words, all of them accented',
      columns: ['Word', 'Asks', 'Example'],
      rows: [
        ['qué', 'what', '¿qué hora es?'],
        ['quién', 'who', '¿quién es ese hombre?'],
        ['dónde', 'where', '¿dónde está la estación?'],
        ['cuándo', 'when', '¿cuándo vienes?'],
        ['cómo', 'how', '¿cómo se dice esto?'],
        ['cuánto', 'how much', '¿cuánto cuesta?'],
        ['por qué', 'why', '¿por qué no vienes?'],
      ],
    },
    examples: [
      { text: '¿hablas español?', gloss: 'Do you speak Spanish?',
        tiles: ['¿hablas', 'español?'] },
      { text: '¿dónde está la estación?', gloss: 'Where is the station?',
        tiles: ['¿dónde', 'está', 'la', 'estación?'] },
      { text: '¿cuánto cuesta este libro?', gloss: 'How much is this book?',
        tiles: ['¿cuánto', 'cuesta', 'este', 'libro?'] },
      { text: 'no voy porque estoy cansado.', gloss: 'I am not going because I am tired.',
        tiles: ['no', 'voy', 'porque', 'estoy', 'cansado.'] },
    ],
  },
  {
    id: 'es-por-para',
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
    pitfall: 'trabajo para mi padre means he is your employer; trabajo por mi padre means you are standing in for him. One preposition apart, and a very different sentence.',
    table: {
      caption: 'Which way each one points',
      columns: ['Word', 'Points at', 'Example'],
      rows: [
        ['para', 'forwards — a purpose, a destination, a deadline, a recipient', 'estudio para el examen'],
        ['por', 'backwards or through — a cause, a route, an exchange, a duration', 'gracias por la comida'],
      ],
    },
    examples: [
      { text: 'este regalo es para mi madre.', gloss: 'This present is for my mother — recipient.',
        tiles: ['este', 'regalo', 'es', 'para', 'mi', 'madre.'] },
      { text: 'gracias por todo.', gloss: 'Thanks for everything — cause.',
        tiles: ['gracias', 'por', 'todo.'] },
      { text: 'caminamos por el parque.', gloss: 'We walk through the park — movement through.',
        tiles: ['caminamos', 'por', 'el', 'parque.'] },
      { text: 'salgo para el trabajo.', gloss: 'I am leaving for work — destination.',
        tiles: ['salgo', 'para', 'el', 'trabajo.'] },
    ],
  },
  {
    id: 'es-futuro-proximo',
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
    pitfall: 'The a is not optional. «voy comer» is wrong — it is voy a comer, the same a that turns up in voy a Madrid.',
    examples: [
      { text: 'voy a comer.', gloss: 'I am going to eat.',
        tiles: ['voy', 'a', 'comer.'] },
      { text: 'vamos a salir pronto.', gloss: 'We are going to leave soon.',
        tiles: ['vamos', 'a', 'salir', 'pronto.'] },
      { text: 'va a llover.', gloss: 'It is going to rain.',
        tiles: ['va', 'a', 'llover.'] },
    ],
  },
  {
    id: 'es-preterito',
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
    pitfall: 'The accents are not decoration. hablo is «I speak» and habló is «he spoke»; dropping the mark changes the person and the tense at once.',
    examples: [
      { text: 'comí una manzana.', gloss: 'I ate an apple.',
        tiles: ['comí', 'una', 'manzana.'] },
      { text: 'habló con su madre.', gloss: 'He spoke with his mother.',
        tiles: ['habló', 'con', 'su', 'madre.'] },
      { text: 'terminamos el trabajo ayer.', gloss: 'We finished the work yesterday.',
        tiles: ['terminamos', 'el', 'trabajo', 'ayer.'] },
      { text: 'fui al mercado.', gloss: 'I went to the market — fui is both ser and ir.',
        tiles: ['fui', 'al', 'mercado.'] },
    ],
  },
  {
    id: 'es-imperfecto',
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
    pitfall: 'The choice is about how you FRAME it, not how long it lasted. viví allí diez años is perfectly correct — the ten years are being treated as one finished block.',
    examples: [
      { text: 'cuando era pequeño, jugaba en el parque.', gloss: 'When I was small, I used to play in the park.',
        tiles: ['cuando', 'era', 'pequeño,', 'jugaba', 'en', 'el', 'parque.'] },
      { text: 'hacía frío.', gloss: 'It was cold.',
        tiles: ['hacía', 'frío.'] },
      { text: 'vivíamos cerca del mar.', gloss: 'We lived near the sea.',
        tiles: ['vivíamos', 'cerca', 'del', 'mar.'] },
    ],
  },
  {
    id: 'es-reflexive',
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
    pitfall: 'The pronoun changes with the person: me levanto, te levantas, se levanta. Leaving se in place throughout is the giveaway — that is only the dictionary form.',
    examples: [
      { text: 'me levanto a las siete.', gloss: 'I get up at seven.',
        tiles: ['me', 'levanto', 'a', 'las', 'siete.'] },
      { text: 'se lava las manos.', gloss: 'She washes her hands.',
        tiles: ['se', 'lava', 'las', 'manos.'] },
      { text: 'nos levantamos temprano.', gloss: 'We get up early.',
        tiles: ['nos', 'levantamos', 'temprano.'] },
    ],
  },
  {
    id: 'es-object-pronouns',
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
    pitfall: 'Before a conjugated verb, but attached to the end of an infinitive or gerund. Both quiero verlo and lo quiero ver are right; «verlo quiero» is not.',
    table: {
      caption: 'The pronouns, and which slot they fill',
      columns: ['Pronoun', 'Stands for', 'Example'],
      rows: [
        ['me', 'me', 'me ayuda mucho'],
        ['te', 'you', 'te lo digo ahora'],
        ['lo', 'him, or it — masculine', 'lo veo todos los días'],
        ['la', 'her, or it — feminine', 'la veo mañana'],
        ['le', 'to him, to her', 'le hablo por teléfono'],
        ['nos', 'us', 'nos ayuda'],
        ['los', 'them — masculine', 'los veo'],
        ['les', 'to them', 'les hablo'],
      ],
    },
    examples: [
      { text: 'lo veo todos los días.', gloss: 'I see him every day.',
        tiles: ['lo', 'veo', 'todos', 'los', 'días.'] },
      { text: 'le hablo por teléfono.', gloss: 'I speak to him on the phone.',
        tiles: ['le', 'hablo', 'por', 'teléfono.'] },
      { text: 'me lo da.', gloss: 'He gives it to me — indirect first.',
        tiles: ['me', 'lo', 'da.'] },
      { text: 'voy a verlo mañana.', gloss: 'I am going to see him tomorrow — attached to the infinitive.',
        tiles: ['voy', 'a', 'verlo', 'mañana.'] },
    ],
  },
  {
    id: 'es-saber-conocer',
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
    pitfall: 'saber is facts and skills; conocer is being acquainted with a person or place. «sé a María» would mean you have her memorised.',
    examples: [
      { text: 'sé la respuesta.', gloss: 'I know the answer — a fact.',
        tiles: ['sé', 'la', 'respuesta.'] },
      { text: 'conozco a María.', gloss: 'I know María — acquaintance, and note the personal a.',
        tiles: ['conozco', 'a', 'María.'] },
      { text: 'sé nadar.', gloss: 'I know how to swim.',
        tiles: ['sé', 'nadar.'] },
    ],
  },
  {
    id: 'es-perfecto',
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
    pitfall: 'Spain uses the present perfect for today; much of Latin America uses the preterite for both. Neither is a mistake — hoy he comido and hoy comí simply belong to different places.',
    examples: [
      { text: 'hoy he comido bien.', gloss: 'I have eaten well today — today is still going.',
        tiles: ['hoy', 'he', 'comido', 'bien.'] },
      { text: 'ayer comí bien.', gloss: 'I ate well yesterday — closed off, so the preterite.',
        tiles: ['ayer', 'comí', 'bien.'] },
      { text: 'nunca he visto el mar.', gloss: 'I have never seen the sea.',
        tiles: ['nunca', 'he', 'visto', 'el', 'mar.'] },
    ],
  },
  {
    id: 'es-comparatives',
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
    pitfall: 'The four irregulars take no más at all. más bueno and más malo do exist, but they are about character rather than quality.',
    table: {
      caption: 'The four that do not take más',
      columns: ['Word', 'Means', 'Not'],
      rows: [
        ['mejor', 'better — from bueno', 'más bueno'],
        ['peor', 'worse — from malo', 'más malo'],
        ['mayor', 'older, greater — from grande', 'más grande'],
        ['menor', 'younger, lesser — from pequeño', 'más pequeño'],
      ],
    },
    examples: [
      { text: 'es más alto que yo.', gloss: 'He is taller than me.',
        tiles: ['es', 'más', 'alto', 'que', 'yo.'] },
      { text: 'este libro es mejor.', gloss: 'This book is better — not «más bueno».',
        tiles: ['este', 'libro', 'es', 'mejor.'] },
      { text: 'no es tan caro como pensaba.', gloss: 'It is not as expensive as I thought.',
        tiles: ['no', 'es', 'tan', 'caro', 'como', 'pensaba.'] },
    ],
  },
  {
    id: 'es-imperative',
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
    pitfall: 'The negative uses a completely different ending. habla becomes no hables — «no habla» is not a command at all, it is a statement about somebody else.',
    examples: [
      { text: 'habla más despacio.', gloss: 'Speak more slowly.',
        tiles: ['habla', 'más', 'despacio.'] },
      { text: 'no hables tan rápido.', gloss: 'Do not speak so fast — the negative changes the ending.',
        tiles: ['no', 'hables', 'tan', 'rápido.'] },
      { text: 'ven aquí.', gloss: 'Come here — an irregular command.',
        tiles: ['ven', 'aquí.'] },
    ],
  },
  {
    id: 'es-subjunctive',
    kind: 'grammar',
    title: 'A first look at the subjunctive',
    summary: 'Triggered by the sentence around it',
    explanation: `Spanish uses the subjunctive far more than French or English, and the way in is
to learn the triggers rather than to reason about doubt.

The endings swap the vowel: -ar verbs take -e endings, -er and -ir verbs take -a. hablar gives
hable, comer gives coma, vivir gives viva.

The common triggers are worth memorising as phrases: quiero que, espero que, es importante que,
ojalá, antes de que, para que, cuando (about the future).

quiero que vengas — I want you to come. Note that Spanish cannot say "I want you to come" with
an infinitive the way English does; when the two halves have different subjects, que plus the
subjunctive is the only route.

cuando is the one that catches people: "cuando llegue" for something that has not happened yet,
but "cuando llegó" for something that did.`,
    pitfall: 'It is triggered by the structure, not by how doubtful you feel. quiero que vengas takes it because of quiero que, and there is nothing uncertain about wanting something.',
    examples: [
      { text: 'quiero que vengas.', gloss: 'I want you to come.',
        tiles: ['quiero', 'que', 'vengas.'] },
      { text: 'espero que estés bien.', gloss: 'I hope you are well.',
        tiles: ['espero', 'que', 'estés', 'bien.'] },
      { text: 'cuando llegue, te llamo.', gloss: 'When I arrive, I will call you.',
        tiles: ['cuando', 'llegue,', 'te', 'llamo.'] },
    ],
  },
  {
    id: 'es-future-conditional',
    kind: 'grammar',
    title: 'The future and the conditional',
    summary: 'Both built on the whole infinitive',
    explanation: `Unusually, both tenses attach their endings to the FULL infinitive rather than
to a stem.

Future: -é, -ás, -á, -emos, -éis, -án. hablaré, comerás, vivirá.
Conditional: -ía, -ías, -ía, -íamos, -íais, -ían. hablaría, comerías, viviría.

A dozen verbs have an irregular stem, and it is the SAME stem for both: tener gives tendr-,
poder gives podr-, hacer gives har-, decir gives dir-, salir gives saldr-, venir gives vendr-.
Learn it once and you have both tenses.

The conditional is the polite one: "querría un café" or, more commonly, "quisiera".

And both do a second job that has nothing to do with time — guessing. "¿Qué hora será?" is "what
time do you suppose it is?", and "serían las tres" is "it must have been about three".`,
    pitfall: 'The endings go on the WHOLE infinitive, not on a stem. hablaré, never hablé — that second one is the preterite, and one letter apart.',
    examples: [
      { text: 'hablaré con ella mañana.', gloss: 'I will speak with her tomorrow.',
        tiles: ['hablaré', 'con', 'ella', 'mañana.'] },
      { text: 'tendremos tiempo.', gloss: 'We will have time — tener has an irregular stem.',
        tiles: ['tendremos', 'tiempo.'] },
      { text: 'me gustaría ir contigo.', gloss: 'I would like to go with you.',
        tiles: ['me', 'gustaría', 'ir', 'contigo.'] },
    ],
  },
  {
    id: 'es-demonstratives',
    kind: 'grammar',
    title: 'este, ese, aquel',
    summary: 'Three distances, where English has two',
    explanation: `Spanish splits "this and that" three ways, by distance from the speaker.

este is here, next to me. ese is there, near you. aquel is over there, away from both of us.

Each agrees in gender and number: este, esta, estos, estas; ese, esa, esos, esas; aquel,
aquella, aquellos, aquellas.

The middle one is the one English speakers under-use, because "that" covers both ese and aquel.
If the thing is near the person you are talking to, ese is the natural choice.

There are also neuter forms — esto, eso, aquello — for an idea rather than a thing: "eso es
verdad" is "that is true", where "that" is the whole situation and has no gender.`,
    pitfall: 'Three distances, where English has two. ese is near the listener and aquel is far from you both; using ese for everything not in your hand loses the middle one.',
    table: {
      caption: 'Three distances',
      columns: ['Word', 'Distance', 'Example'],
      rows: [
        ['este', 'near me', 'este libro es mío'],
        ['ese', 'near you', 'esa casa es grande'],
        ['aquel', 'far from us both', 'aquella montaña es alta'],
      ],
    },
    examples: [
      { text: 'este libro es mío.', gloss: 'This book is mine — here, next to me.',
        tiles: ['este', 'libro', 'es', 'mío.'] },
      { text: 'esa casa es grande.', gloss: 'That house is big — near you.',
        tiles: ['esa', 'casa', 'es', 'grande.'] },
      { text: 'eso es verdad.', gloss: 'That is true — a whole idea, so the neuter form.',
        tiles: ['eso', 'es', 'verdad.'] },
    ],
  },
  {
    id: 'es-possessives',
    kind: 'grammar',
    title: 'Saying whose it is',
    summary: 'And why su is ambiguous on purpose',
    explanation: `mi, tu, su, nuestro, vuestro, su — placed before the noun, and agreeing with the
THING rather than with the owner.

Only nuestro and vuestro change for gender: nuestra casa, nuestros libros. The rest just add -s
for plural: mis libros, sus casas.

su is the one to watch. It means his, her, its, their AND your (for usted) — five readings in
one word — so Spanish leans on context far more than English does here. When it genuinely is not
clear, speakers say "de él" or "de ella" instead: "el libro de ella".

There is a second set that goes AFTER the noun for emphasis, and stands alone: mío, tuyo, suyo.
"un amigo mío" is "a friend of mine", and "es mío" is "it is mine".`,
    pitfall: 'su means his, her, their and your (formal) all at once. When it genuinely matters, Spanish says de él or de ella rather than leaving you to guess.',
    examples: [
      { text: 'mi casa es pequeña.', gloss: 'My house is small.',
        tiles: ['mi', 'casa', 'es', 'pequeña.'] },
      { text: 'nuestros libros están aquí.', gloss: 'Our books are here — nuestro agrees.',
        tiles: ['nuestros', 'libros', 'están', 'aquí.'] },
      { text: 'un amigo mío.', gloss: 'A friend of mine — the emphatic form, after the noun.',
        tiles: ['un', 'amigo', 'mío.'] },
    ],
  },
  {
    id: 'es-se',
    kind: 'grammar',
    title: 'The many jobs of se',
    summary: 'One tiny word doing four different things',
    explanation: `se turns up constantly and means something different each time. Recognising
which is which is one of the bigger reading skills in Spanish.

REFLEXIVE — the subject acts on itself: "se lava" — he washes himself.

RECIPROCAL — two people act on each other: "se miran" — they look at each other.

IMPERSONAL — no particular subject, like English "one" or a passive: "se habla español aquí" —
Spanish is spoken here. This one is everywhere on signs and in instructions.

AND THE SUBSTITUTE — le becomes se before lo or la, purely to avoid "le lo": "se lo doy".

The impersonal is the one worth spotting first, because it is common in writing and has no
obvious English shape.`,
    pitfall: 'se does four unrelated jobs. Before deciding it is reflexive, check whether the sentence names anybody doing the action — se habla español names nobody, and that is the whole point.',
    examples: [
      { text: 'se habla español aquí.', gloss: 'Spanish is spoken here — impersonal.',
        tiles: ['se', 'habla', 'español', 'aquí.'] },
      { text: 'se lava las manos.', gloss: 'She washes her hands — reflexive.',
        tiles: ['se', 'lava', 'las', 'manos.'] },
      { text: '¿cómo se dice esto?', gloss: 'How do you say this?',
        tiles: ['¿cómo', 'se', 'dice', 'esto?'] },
    ],
  },
  {
    id: 'es-progressive',
    kind: 'grammar',
    title: 'estar plus -ando',
    summary: 'Happening right now — and used far less than English',
    explanation: `estar plus a gerund says something is going on at this moment. The gerund is
-ando for -ar verbs and -iendo for -er and -ir: hablando, comiendo, viviendo.

estoy comiendo — I am eating.

The important half is when NOT to use it. English uses the -ing form for the near future ("I am
going tomorrow") and for ongoing states ("I am living in Madrid"); Spanish uses the plain
present for both. "voy mañana", "vivo en Madrid".

So this form is narrower than it looks: it is for what is happening literally now, as you speak.

A few gerunds are irregular and common: leer gives leyendo, dormir gives durmiendo, decir gives
diciendo.`,
    pitfall: 'Spanish uses it far less than English does. For anything scheduled or generally true the plain present is correct: vivo en Madrid, not estoy viviendo.',
    examples: [
      { text: 'estoy comiendo.', gloss: 'I am eating — right now.',
        tiles: ['estoy', 'comiendo.'] },
      { text: 'vivo en Madrid.', gloss: 'I am living in Madrid — a state, so the plain present.',
        tiles: ['vivo', 'en', 'Madrid.'] },
      { text: 'está leyendo un libro.', gloss: 'He is reading a book.',
        tiles: ['está', 'leyendo', 'un', 'libro.'] },
    ],
  },
  {
    id: 'es-hay',
    kind: 'grammar',
    title: 'hay',
    summary: 'There is, there are — and it never changes',
    explanation: `hay means "there is" and "there are", and unlike English it has ONE form for
both. "hay un libro" and "hay muchos libros" use the same word.

It comes from haber and is used only impersonally, so it never conjugates for a subject. Its
past is había, which likewise covers both "there was" and "there were".

The thing that follows hay is never definite. You can say "hay un problema" but not "hay el
problema" — for something already identified, Spanish uses estar: "el problema está aquí".

That split is the same one behind ser and estar: hay introduces something new, estar locates
something already known.`,
    pitfall: 'hay never changes for number. hay un libro and hay muchos libros both use hay — «han» and «hayn» do not exist in this construction.',
    examples: [
      { text: 'hay un problema.', gloss: 'There is a problem.',
        tiles: ['hay', 'un', 'problema.'] },
      { text: 'hay muchos libros aquí.', gloss: 'There are many books here — hay never changes.',
        tiles: ['hay', 'muchos', 'libros', 'aquí.'] },
      { text: 'el libro está en la mesa.', gloss: 'The book is on the table — already known, so estar.',
        tiles: ['el', 'libro', 'está', 'en', 'la', 'mesa.'] },
    ],
  },
  { id: 'es-v-basics',  kind: 'vocab', theme: 'basics',
    title: 'Everyday words', summary: 'The small words that hold sentences together' },
  { id: 'es-v-numbers', kind: 'vocab', theme: 'numbers',
    title: 'Numbers', summary: 'Counting, prices, times, ages' },
  { id: 'es-v-colours', kind: 'vocab', theme: 'colours',
    title: 'Colours', summary: 'And a first look at adjectives agreeing' },
  { id: 'es-v-family', kind: 'vocab', theme: 'family',
    title: 'Family', summary: 'The people you describe first' },
  { id: 'es-v-body',   kind: 'vocab', theme: 'body',
    title: 'The body', summary: 'For the doctor, and for everything that hurts' },
  { id: 'es-v-routine', kind: 'vocab', theme: 'routine',
    title: 'Daily routine', summary: 'The verbs of an ordinary day' },
  { id: 'es-v-food',    kind: 'vocab', theme: 'food',
    title: 'Food and drink', summary: 'Enough to order, shop and cook' },
  { id: 'es-v-verbs',   kind: 'vocab', theme: 'verbs',
    title: 'Common verbs', summary: 'The ones that turn up in every other sentence' },
  { id: 'es-v-adjectives', kind: 'vocab', theme: 'adjectives',
    title: 'Describing words', summary: 'Big, small, new, old, easy, difficult' },
  { id: 'es-v-house',     kind: 'vocab', theme: 'house',
    title: 'The house', summary: 'Rooms, furniture, the things in them' },
  { id: 'es-v-clothing',  kind: 'vocab', theme: 'clothing',
    title: 'Clothes', summary: 'What you are wearing and what you are buying' },
  { id: 'es-v-weather',   kind: 'vocab', theme: 'weather',
    title: 'Weather', summary: 'The most reliable small talk there is' },
  { id: 'es-v-places',    kind: 'vocab', theme: 'places',
    title: 'Places in town', summary: 'Where you are going and how to ask for it' },
  { id: 'es-v-transport', kind: 'vocab', theme: 'transport',
    title: 'Getting around', summary: 'On foot, by bus, by train' },
  { id: 'es-v-weekdays', kind: 'vocab', theme: 'weekdays',
    title: 'Days of the week', summary: 'lunes through domingo' },
  { id: 'es-v-months',   kind: 'vocab', theme: 'months',
    title: 'Months', summary: 'Dates, birthdays, seasons of the year' },
  { id: 'es-v-seasons',  kind: 'vocab', theme: 'seasons',
    title: 'Seasons', summary: 'Four words that turn up constantly' },
  { id: 'es-v-tableware', kind: 'vocab', theme: 'tableware',
    title: 'At the table', summary: 'Plates, glasses, knives and forks' },
  { id: 'es-v-school',    kind: 'vocab', theme: 'school',
    title: 'School', summary: 'Classroom words, and the things on a desk' },
  { id: 'es-v-animals',   kind: 'vocab', theme: 'animals',
    title: 'Animals', summary: 'Pets, farm animals, and the words for them' },
  { id: 'es-v-everyday',  kind: 'vocab', theme: 'everyday',
    title: 'Everyday life', summary: 'Birthdays, hunger, parties and the sky' },
];
