import type { LanguageCode } from '@/lib/types';

/**
 * Something to read on the very first visit.
 *
 * The empty Read tab used to offer a learner three things they did not have yet — text to
 * paste, a book to upload, audio to sync — and one they could not use without an API key.
 * A first session that cannot start is the whole funnel. These are the fourth option: open
 * one, tap a word, watch it enter the deck. That loop is the entire argument for the app,
 * and it should take under a minute to meet.
 *
 * ## Why these are written rather than sourced
 *
 * Same reason `scripts/data/proverbs-seed.json` and the `beginner` sets in
 * `core-overrides.json` are written: the good graded readers are unlicensed or commercially
 * copyrighted, and genuine public-domain literature is almost never beginner-level — Aesop
 * and Gutenberg openings carry wide, archaic vocabulary, which is exactly the wall that makes
 * a beginner quit. Authored text can be held to the one bar that matters here: **every word
 * must resolve in our own dictionary**, so tapping anything gives a real definition.
 *
 * `tests/starterTexts.test.ts` enforces that against the REAL dictionaries, through the same
 * segmenters the app runs at request time. A starter text with an unlookupable word is worse
 * than no starter text — it teaches, in the first thirty seconds, that tapping words does not
 * reliably work.
 *
 * Kept deliberately short. This is a demonstration, not a course; the reward for finishing is
 * that you now know what the app does and can point it at something you actually care about.
 */

export interface StarterText {
  id: string;
  title: string;
  /** Plain prose. Segmented at read time exactly as pasted text is — no pre-tokenisation. */
  text: string;
  /** One line on what it is, for the chooser. */
  blurb: string;
}

export const STARTER_TEXTS: Record<LanguageCode, StarterText[]> = {
  es: [
    {
      id: 'es-mercado',
      title: 'El mercado',
      blurb: 'A Saturday morning at the market',
      text: `Hoy voy al mercado con mi madre. Compramos pan, fruta y un poco de queso.
La fruta es muy fresca porque llega de una granja pequeña.
Mi madre habla con el hombre que vende las naranjas.
Después tomamos un café juntos en la plaza.
Me gusta mucho ir al mercado los sábados.`,
    },
    {
      id: 'es-casa',
      title: 'Mi casa',
      blurb: 'A short tour of home',
      text: `Vivo en una casa pequeña cerca del río. Tiene dos dormitorios y una cocina grande.
Mi habitación tiene una ventana que mira al jardín.
Por la mañana entra mucha luz y puedo leer en la cama.
En el jardín hay flores rojas y un árbol viejo.
Mi gato duerme debajo de ese árbol todos los días.`,
    },
    {
      id: 'es-perro',
      title: 'El perro de mi amigo',
      blurb: 'A friend, a dog, and the park',
      text: `Mi amigo Pablo tiene un perro negro que se llama Luna.
Luna es muy grande, pero también es muy tranquila.
Los domingos vamos al parque con ella y corremos juntos.
A Luna le gusta el agua, así que siempre entra en el lago.
Después vuelve a casa sucia y feliz.
Pablo dice que Luna es su mejor amiga.`,
    },
  ],

  fr: [
    {
      id: 'fr-dejeuner',
      title: 'Le petit déjeuner',
      blurb: 'The first hour of the day',
      text: `Le matin, je me lève à sept heures. Je prends mon petit déjeuner dans la cuisine.
Nous mangeons du pain avec du beurre et de la confiture.
Ma sœur boit du thé, mais moi je préfère le café.
Nous parlons un peu de notre journée.
Après, je pars au travail à vélo.`,
    },
    {
      id: 'fr-ville',
      title: 'Ma ville',
      blurb: 'A small town, described simply',
      text: `J'habite dans une petite ville près de la mer. Il y a une école, une église et un marché.
Le samedi, les gens viennent des villages pour acheter des légumes.
Ma rue est calme et il y a beaucoup d'arbres.
En été, nous mangeons dehors avec nos voisins.
J'aime bien vivre ici parce que tout le monde se connaît.`,
    },
    {
      id: 'fr-chat',
      title: 'Le chat noir',
      blurb: 'A cat who does as he pleases',
      text: `Il y a un chat noir qui dort devant ma porte tous les jours.
Je ne sais pas où il habite. Peut-être qu'il n'a pas de maison.
Le soir, je lui donne un peu de lait et il reste une heure.
Quand j'ouvre la porte, il entre et regarde la cuisine.
Puis il part sans rien dire, comme un roi.`,
    },
  ],

  zh: [
    {
      id: 'zh-jia',
      title: '我的家',
      blurb: 'Introducing your family',
      text: `我家有四个人：爸爸、妈妈、姐姐和我。
爸爸是老师，妈妈是医生。
姐姐今年二十岁，她在大学学习中文。
我们家还有一只小猫，它很可爱。
每天晚上我们一起吃饭，一起说话。
我很爱我的家。`,
    },
    {
      id: 'zh-tianqi',
      title: '今天的天气',
      blurb: 'Weather, and what to do about it',
      text: `今天天气很好，不冷也不热。
早上我和朋友去公园散步。
公园里有很多人，有的在跑步，有的在喝茶。
中午的时候太阳很大，我们坐在树下休息。
下午下了一点雨，我们就回家了。
我喜欢这样的天气。`,
    },
    {
      id: 'zh-chi',
      title: '我喜欢吃的东西',
      blurb: 'Food, simply put',
      text: `我最喜欢吃面条。
妈妈做的面条很好吃，里面有鸡蛋和青菜。
我也喜欢米饭，可是我不喜欢吃肉。
朋友说我应该多吃一点，因为我太瘦了。
每个星期六，我们去饭馆吃饭。
那家饭馆的菜很便宜，也很好吃。`,
    },
  ],

  ja: [
    {
      id: 'ja-ichinichi',
      title: 'わたしの一日',
      blurb: 'A day from morning to night',
      text: `毎朝六時に起きます。
朝ご飯を食べてから、学校へ行きます。
午前中は日本語を勉強します。
昼ご飯は友だちと一緒に食べます。
夕方うちへ帰って、宿題をします。
夜十一時ごろ寝ます。`,
    },
    {
      id: 'ja-tabemono',
      title: '好きな食べ物',
      blurb: 'What you like to eat',
      text: `わたしはすしが好きです。
でも、毎日は食べません。高いですから。
うちでよく作るのはカレーです。
母のカレーはとてもおいしいです。
弟は肉が好きですが、わたしは野菜のほうが好きです。
今晩は何を食べましょうか。`,
    },
    {
      id: 'ja-machi',
      title: 'わたしの町',
      blurb: 'The place you live',
      text: `わたしの町は大きくありません。でも、とても静かです。
駅の前に小さい店がたくさんあります。
土曜日には、その店で買い物をします。
町の近くに川があって、春は桜がきれいです。
夏になると、子どもたちが川で遊びます。
わたしはこの町が好きです。`,
    },
  ],
};

export function starterTexts(language: LanguageCode): StarterText[] {
  return STARTER_TEXTS[language] ?? [];
}
