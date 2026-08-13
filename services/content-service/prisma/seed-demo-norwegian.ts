/**
 * Demo seed — Norwegian B1 course modelled after the «Stein på stein» textbook.
 *
 * Creates a full, frontend-ready COURSE container with three chapters. Each
 * chapter (a ContainerSection) groups:
 *   1. a LESSON          — reading text + explanation (learning material)
 *   2. a VOCABULARY_LIST — themed word list with Russian translations
 *   3. a GRAMMAR_RULE    — grammar explanation for the chapter
 *   4. a TEST            — several EXERCISES of different templates that
 *                          verify the student's knowledge after the lesson
 *
 * Idempotent: every entity id is derived deterministically with uuid v5 from a
 * fixed namespace, and all writes use upsert. Re-running the script updates the
 * existing rows instead of creating duplicates.
 *
 * Run from services/content-service:
 *   npx tsx prisma/seed-demo-norwegian.ts
 *
 * Requires the exercise templates from prisma/seed.ts to be seeded first
 * (the script verifies they exist and aborts with a helpful message otherwise).
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { v5 as uuidv5 } from 'uuid';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: `${process.env.DATABASE_URL}` }),
});

// ─── Deterministic id helpers ─────────────────────────────────────────────────
// A fixed namespace keeps the generated ids stable across runs so the seed is
// idempotent. `id('lesson', 'ch1')` always yields the same UUID.
const NAMESPACE = '6f1b2c3d-4e5a-5b6c-8d7e-9f0a1b2c3d4e';
const id = (kind: string, key: string): string => uuidv5(`${kind}:${key}`, NAMESPACE);

// Real demo actors — the course is owned by this teacher inside this school so
// it can be assigned to a group and its progress can be tracked.
const TEACHER_ID = '0b2f2404-854a-4ea5-9d33-816db353983f';
const SCHOOL_ID = 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8';

const TARGET_LANG = 'nb'; // Norwegian Bokmål
const EXPLANATION_LANG = 'ru'; // explanations / instructions for the learner
const LEVEL = 'B1' as const;

// School-owned content: visible within the school, free for its members.
const VISIBILITY = 'SCHOOL_PRIVATE' as const;
const ACCESS_TIER = 'FREE_WITHIN_SCHOOL' as const;

// ─── Course definition ────────────────────────────────────────────────────────

interface VocabWord {
  word: string;
  pos: string; // PartOfSpeech enum identifier
  translation: string;
  example: string;
  exampleTranslation: string;
}

interface ExerciseDef {
  key: string;
  template: string; // ExerciseTemplate.code
  content: Prisma.InputJsonValue;
  expectedAnswers: Prisma.InputJsonValue;
  instruction: string;
  hint?: string;
}

interface Chapter {
  key: string;
  sectionTitle: string;
  lesson: { title: string; description: string; body: string };
  vocab: { title: string; description: string; words: VocabWord[] };
  grammar: {
    title: string;
    topic: string; // GrammarTopic enum identifier
    subtopic: string;
    summary: string;
    body: string;
  };
  test: ExerciseDef[];
}

const chapters: Chapter[] = [
  // ─────────────────────────────── Kapittel 1 ────────────────────────────────
  {
    key: 'ch1',
    sectionTitle: 'Kapittel 1 — Familie og dagligliv',
    lesson: {
      title: 'Familie og dagligliv',
      description: 'Lesetekst om en norsk familie og deres hverdag. Tema: familie, rutiner, tid.',
      body: `# Familie og dagligliv

## Lesetekst: En vanlig dag hos familien Berg

Familien Berg bor i en leilighet i Bergen. Anna er 38 år og jobber som
sykepleier på sykehuset. Mannen hennes, Per, er lærer på en barneskole.
De har to barn: Sofie på ti år og Markus på sju år.

På hverdager står familien opp klokka halv sju. Anna lager frokost mens
Per vekker barna. De spiser brødskiver med ost og drikker kaffe og melk.
Klokka åtte går barna på skolen, og foreldrene drar på jobb.

Om ettermiddagen henter Per barna i skolefritidsordningen. De gjør lekser
sammen, og etterpå lager familien middag. På kvelden ser de på tv eller
leser bøker. I helgene besøker de ofte besteforeldrene som bor på landet.

## Forstå teksten

- Hvor bor familien Berg?
- Hva jobber Anna og Per med?
- Hva gjør familien om ettermiddagen?

> **Tips:** Legg merke til verbene i presens (*bor, jobber, spiser*). I dette
> kapittelet øver vi på presens og preteritum.`,
    },
    vocab: {
      title: 'Ordforråd — Familie og dagligliv',
      description: 'Sentrale ord fra kapittel 1: familie, hverdag og rutiner.',
      words: [
        { word: 'familie', pos: 'NOUN', translation: 'семья', example: 'Familien min er stor.', exampleTranslation: 'Моя семья большая.' },
        { word: 'hverdag', pos: 'NOUN', translation: 'будний день', example: 'På hverdager jobber jeg.', exampleTranslation: 'По будням я работаю.' },
        { word: 'sykepleier', pos: 'NOUN', translation: 'медсестра/медбрат', example: 'Anna er sykepleier.', exampleTranslation: 'Анна — медсестра.' },
        { word: 'lærer', pos: 'NOUN', translation: 'учитель', example: 'Per er lærer på en skole.', exampleTranslation: 'Пер — учитель в школе.' },
        { word: 'frokost', pos: 'NOUN', translation: 'завтрак', example: 'Vi spiser frokost klokka sju.', exampleTranslation: 'Мы завтракаем в семь часов.' },
        { word: 'å hente', pos: 'VERB', translation: 'забирать', example: 'Jeg henter barna på skolen.', exampleTranslation: 'Я забираю детей из школы.' },
        { word: 'lekser', pos: 'NOUN', translation: 'домашнее задание', example: 'Barna gjør lekser.', exampleTranslation: 'Дети делают домашнее задание.' },
        { word: 'å besøke', pos: 'VERB', translation: 'навещать', example: 'Vi besøker besteforeldrene.', exampleTranslation: 'Мы навещаем бабушку и дедушку.' },
      ],
    },
    grammar: {
      title: 'Presens og preteritum',
      topic: 'TENSES',
      subtopic: 'Presens / preteritum',
      summary: 'Hvordan danne og bruke presens (nåtid) og preteritum (fortid) av norske verb.',
      body: `# Presens og preteritum

## Presens (настоящее время)
Презенс описывает то, что происходит сейчас или регулярно. Большинство
норвежских глаголов в презенсе оканчиваются на **-r**:

| Инфинитив | Презенс | Перевод |
|-----------|---------|---------|
| å jobbe   | jobber  | работать |
| å bo      | bor     | жить |
| å spise   | spiser  | есть |

> *Jeg jobber hver dag.* — Я работаю каждый день.

## Preteritum (прошедшее время)
Претеритум описывает завершённое действие в прошлом. Правильные (слабые)
глаголы образуют претеритум по четырём моделям, чаще всего на **-et** или **-te**:

| Инфинитив | Претеритум | Перевод |
|-----------|------------|---------|
| å jobbe   | jobbet     | работал |
| å spise   | spiste     | ел |
| å bo      | bodde      | жил |

Сильные глаголы меняют корневую гласную: *å være → var*, *å gå → gikk*,
*å drikke → drakk*.

> *I går jobbet jeg hjemme.* — Вчера я работал дома.`,
    },
    test: [
      {
        key: 'ch1-mc',
        template: 'multiple_choice',
        instruction: 'Выберите правильную форму глагола в презенсе.',
        hint: 'Презенс большинства глаголов оканчивается на -r.',
        content: {
          question: 'Anna ___ som sykepleier på sykehuset.',
          options: [
            { id: 'a', text: 'jobb' },
            { id: 'b', text: 'jobber' },
            { id: 'c', text: 'jobbet' },
            { id: 'd', text: 'å jobbe' },
          ],
        },
        expectedAnswers: {
          correct_option_ids: ['b'],
          explanation: 'Презенс глагола «å jobbe» — «jobber».',
        },
      },
      {
        key: 'ch1-fib',
        template: 'fill_in_blank',
        instruction: 'Поставьте глагол в скобках в претеритум.',
        hint: 'å spise → spiste, å bo → bodde.',
        content: {
          text_with_blanks: 'I går ___1___ (å spise) vi middag klokka seks, og så ___2___ (å se) vi på tv.',
          word_bank: ['spiste', 'så', 'spiser', 'ser'],
        },
        expectedAnswers: {
          blanks: [
            { blank_id: 1, accepted_answers: ['spiste'] },
            { blank_id: 2, accepted_answers: ['så'] },
          ],
          explanation: 'Претеритум: å spise → spiste, å se → så.',
        },
      },
      {
        key: 'ch1-tr',
        template: 'translate_to_target',
        instruction: 'Переведите предложение на норвежский.',
        content: {
          dir: 'to_target',
          langs: { explain: 'Russisk', target: 'Norsk' },
          format: 'single',
          note: '',
          items: [
            {
              id: 's1',
              dir: 'to_target',
              source: 'Семья живёт в Бергене.',
              gloss: [{ w: 'семья', t: 'familie (en)' }],
            },
          ],
        },
        expectedAnswers: {
          items: {
            s1: {
              refs: ['Familien bor i Bergen.'],
              require: [],
              forbid: [],
              explanation: 'Презенс глагола «å bo» — «bor».',
            },
          },
        },
      },
      {
        key: 'ch1-match',
        template: 'match_pairs',
        instruction: 'Сопоставьте норвежские слова с переводом.',
        content: {
          left_items: [
            { id: 'l1', text: 'frokost' },
            { id: 'l2', text: 'lekser' },
            { id: 'l3', text: 'å hente' },
            { id: 'l4', text: 'hverdag' },
          ],
          right_items: [
            { id: 'r1', text: 'забирать' },
            { id: 'r2', text: 'завтрак' },
            { id: 'r3', text: 'будний день' },
            { id: 'r4', text: 'домашнее задание' },
          ],
        },
        expectedAnswers: {
          pairs: [
            { left_id: 'l1', right_id: 'r2' },
            { left_id: 'l2', right_id: 'r4' },
            { left_id: 'l3', right_id: 'r1' },
            { left_id: 'l4', right_id: 'r3' },
          ],
        },
      },
    ],
  },

  // ─────────────────────────────── Kapittel 2 ────────────────────────────────
  {
    key: 'ch2',
    sectionTitle: 'Kapittel 2 — Bolig og nærmiljø',
    lesson: {
      title: 'Bolig og nærmiljø',
      description: 'Lesetekst om boliger i Norge, å leie og å kjøpe, og om nabolaget.',
      body: `# Bolig og nærmiljø

## Lesetekst: Å finne et sted å bo

Mange som flytter til en ny by i Norge, må først finne et sted å bo. Noen
leier en leilighet, mens andre kjøper en bolig. Å leie er vanlig blant
studenter og unge mennesker, fordi det er dyrt å kjøpe.

Sara er student og leier et lite rom i et kollektiv sammen med tre andre.
De deler kjøkken og bad. Husleia er ikke så høy, og nabolaget er trygt og
hyggelig. Det er kort vei til både butikken, bussholdeplassen og parken.

Familien Olsen kjøpte nettopp et hus utenfor sentrum. Huset har en stor
hage, fire soverom og en garasje. De trives godt, men de bruker mer tid på
å reise til jobben enn før.

## Forstå teksten

- Hvorfor leier mange unge mennesker bolig?
- Hva deler Sara med de andre i kollektivet?
- Hva slags bolig kjøpte familien Olsen?`,
    },
    vocab: {
      title: 'Ordforråd — Bolig og nærmiljø',
      description: 'Sentrale ord fra kapittel 2: bolig, nabolag og byliv.',
      words: [
        { word: 'bolig', pos: 'NOUN', translation: 'жильё', example: 'De leter etter en bolig.', exampleTranslation: 'Они ищут жильё.' },
        { word: 'leilighet', pos: 'NOUN', translation: 'квартира', example: 'Jeg bor i en liten leilighet.', exampleTranslation: 'Я живу в маленькой квартире.' },
        { word: 'å leie', pos: 'VERB', translation: 'снимать (арендовать)', example: 'Studenter leier ofte rom.', exampleTranslation: 'Студенты часто снимают комнаты.' },
        { word: 'husleie', pos: 'NOUN', translation: 'квартплата', example: 'Husleia er høy i Oslo.', exampleTranslation: 'Квартплата в Осло высокая.' },
        { word: 'nabolag', pos: 'NOUN', translation: 'район/соседство', example: 'Nabolaget er trygt.', exampleTranslation: 'Район безопасный.' },
        { word: 'hage', pos: 'NOUN', translation: 'сад', example: 'Huset har en stor hage.', exampleTranslation: 'У дома большой сад.' },
        { word: 'å trives', pos: 'VERB', translation: 'чувствовать себя хорошо', example: 'Vi trives i den nye byen.', exampleTranslation: 'Нам хорошо в новом городе.' },
        { word: 'soverom', pos: 'NOUN', translation: 'спальня', example: 'Huset har fire soverom.', exampleTranslation: 'В доме четыре спальни.' },
      ],
    },
    grammar: {
      title: 'Substantiv — bestemt og ubestemt form',
      topic: 'NOUNS',
      subtopic: 'Bestemt / ubestemt form',
      summary: 'Genus (en/ei/et) og hvordan danne ubestemt og bestemt form, entall og flertall.',
      body: `# Substantiv — bestemt og ubestemt form

В норвежском у существительных три рода: **hankjønn (en)**, **hunkjønn (ei)**
и **intetkjønn (et)**. Определённость выражается окончанием, а не артиклем
перед словом.

## Entall (единственное число)

| Род | Неопр. форма | Опр. форма |
|-----|--------------|------------|
| en  | en bil       | bilen (машина) |
| ei  | ei jente     | jenta (девочка) |
| et  | et hus       | huset (дом) |

## Flertall (множественное число)

| Неопр. мн. | Опр. мн. |
|------------|----------|
| biler      | bilene |
| jenter     | jentene |
| hus        | husene |

> *Jeg leier en leilighet. Leiligheten er liten.*
> — Я снимаю квартиру. Квартира маленькая.

Существительные среднего рода (et) часто не имеют окончания во
множественном числе: *et hus → flere hus*.`,
    },
    test: [
      {
        key: 'ch2-mc',
        template: 'multiple_choice',
        instruction: 'Выберите правильную определённую форму существительного.',
        hint: 'et hus → huset.',
        content: {
          question: 'Familien Olsen kjøpte et hus. ___ har en stor hage.',
          options: [
            { id: 'a', text: 'Hus' },
            { id: 'b', text: 'En hus' },
            { id: 'c', text: 'Huset' },
            { id: 'd', text: 'Husen' },
          ],
        },
        expectedAnswers: {
          correct_option_ids: ['c'],
          explanation: 'Слово «hus» среднего рода (et), определённая форма — «huset».',
        },
      },
      {
        key: 'ch2-fib',
        template: 'fill_in_blank',
        instruction: 'Вставьте существительные в определённой форме.',
        hint: 'en leilighet → leiligheten, et nabolag → nabolaget.',
        content: {
          text_with_blanks: 'Sara leier en leilighet. ___1___ er liten, men ___2___ (nabolag) er trygt.',
          word_bank: ['leiligheten', 'nabolaget', 'leilighet', 'nabolag'],
        },
        expectedAnswers: {
          blanks: [
            { blank_id: 1, accepted_answers: ['Leiligheten', 'leiligheten'] },
            { blank_id: 2, accepted_answers: ['nabolaget'] },
          ],
          explanation: 'Определённая форма: leiligheten, nabolaget.',
        },
      },
      {
        key: 'ch2-tr',
        template: 'translate_to_target',
        instruction: 'Переведите предложение на норвежский.',
        content: {
          dir: 'to_target',
          langs: { explain: 'Russisk', target: 'Norsk' },
          format: 'single',
          note: '',
          items: [
            {
              id: 's1',
              dir: 'to_target',
              source: 'Квартплата в Осло высокая.',
              gloss: [{ w: 'квартплата', t: 'husleie (ei/en)' }],
            },
          ],
        },
        expectedAnswers: {
          items: {
            s1: {
              // Both genders of «husleie» in one line: the alternation expands
              // to two accepted sentences.
              refs: ['Husle(ia|ien) er høy i Oslo.'],
              require: [],
              forbid: [],
              explanation: '«husleie» женского рода: husleia / husleien.',
            },
          },
        },
      },
      {
        key: 'ch2-match',
        template: 'match_pairs',
        instruction: 'Сопоставьте слова с переводом.',
        content: {
          left_items: [
            { id: 'l1', text: 'bolig' },
            { id: 'l2', text: 'hage' },
            { id: 'l3', text: 'å leie' },
            { id: 'l4', text: 'soverom' },
          ],
          right_items: [
            { id: 'r1', text: 'сад' },
            { id: 'r2', text: 'жильё' },
            { id: 'r3', text: 'спальня' },
            { id: 'r4', text: 'снимать' },
          ],
        },
        expectedAnswers: {
          pairs: [
            { left_id: 'l1', right_id: 'r2' },
            { left_id: 'l2', right_id: 'r1' },
            { left_id: 'l3', right_id: 'r4' },
            { left_id: 'l4', right_id: 'r3' },
          ],
        },
      },
    ],
  },

  // ─────────────────────────────── Kapittel 3 ────────────────────────────────
  {
    key: 'ch3',
    sectionTitle: 'Kapittel 3 — Jobb og arbeidsliv',
    lesson: {
      title: 'Jobb og arbeidsliv',
      description: 'Lesetekst om arbeidsliv i Norge: å søke jobb, arbeidsdag og rettigheter.',
      body: `# Jobb og arbeidsliv

## Lesetekst: Et nytt arbeid

Karim kom til Norge for tre år siden. Først gikk han på norskkurs, og nå
snakker han godt norsk. Han ville gjerne jobbe som elektriker, slik han
gjorde i hjemlandet, og derfor søkte han på flere stillinger.

For en måned siden fikk han endelig en jobb i et lite firma. Han må stå
opp tidlig, fordi arbeidsdagen begynner klokka sju. Kollegene er
hyggelige, og sjefen er fornøyd med arbeidet hans.

I Norge har arbeidstakere mange rettigheter. De har rett til ferie, og hvis
de blir syke, får de sykepenger. Karim trives på jobben, men han vil gjerne
ta mer utdanning for å få en bedre stilling i framtiden.

## Forstå teksten

- Hva gjorde Karim før han fikk jobb?
- Når begynner arbeidsdagen hans?
- Hvilke rettigheter har arbeidstakere i Norge?`,
    },
    vocab: {
      title: 'Ordforråd — Jobb og arbeidsliv',
      description: 'Sentrale ord fra kapittel 3: arbeid, stillinger og rettigheter.',
      words: [
        { word: 'arbeid', pos: 'NOUN', translation: 'работа', example: 'Han er fornøyd med arbeidet.', exampleTranslation: 'Он доволен работой.' },
        { word: 'stilling', pos: 'NOUN', translation: 'должность/вакансия', example: 'Hun søkte på en ny stilling.', exampleTranslation: 'Она подала заявку на новую должность.' },
        { word: 'å søke', pos: 'VERB', translation: 'подавать заявку/искать', example: 'Jeg søker jobb.', exampleTranslation: 'Я ищу работу.' },
        { word: 'kollega', pos: 'NOUN', translation: 'коллега', example: 'Kollegene mine er hyggelige.', exampleTranslation: 'Мои коллеги приятные.' },
        { word: 'sjef', pos: 'NOUN', translation: 'начальник', example: 'Sjefen er fornøyd.', exampleTranslation: 'Начальник доволен.' },
        { word: 'ferie', pos: 'NOUN', translation: 'отпуск', example: 'Vi har fem uker ferie.', exampleTranslation: 'У нас пять недель отпуска.' },
        { word: 'rettighet', pos: 'NOUN', translation: 'право', example: 'Arbeidstakere har mange rettigheter.', exampleTranslation: 'У работников много прав.' },
        { word: 'å trives', pos: 'VERB', translation: 'чувствовать себя хорошо', example: 'Karim trives på jobben.', exampleTranslation: 'Кариму нравится на работе.' },
      ],
    },
    grammar: {
      title: 'Modale verb',
      topic: 'VERBS',
      subtopic: 'Modalverb (kan, må, vil, skal, bør)',
      summary: 'Bruk av modalverbene kan, må, vil, skal og bør sammen med infinitiv uten «å».',
      body: `# Modale verb

Модальные глаголы выражают возможность, необходимость, желание или
намерение. После модального глагола ставится инфинитив **без «å»**.

| Модальный | Презенс | Претеритум | Значение |
|-----------|---------|------------|----------|
| å kunne   | kan     | kunne      | мочь, уметь |
| å måtte   | må      | måtte      | быть должным |
| å ville   | vil     | ville      | хотеть |
| å skulle  | skal    | skulle     | собираться, долженствовать |
| å burde   | bør     | burde      | следует |

## Порядок слов
Модальный глагол стоит на втором месте, смысловой глагол — в конце:

> *Han **må** stå opp tidlig.* — Он должен рано вставать.
> *Jeg **vil** lære norsk.* — Я хочу учить норвежский.
> *Du **bør** søke på stillingen.* — Тебе следует подать на эту должность.

> ⚠️ Обратите внимание: после модального глагола нельзя ставить «å»:
> *Jeg kan ~~å~~ snakke norsk* → **Jeg kan snakke norsk.**`,
    },
    test: [
      {
        key: 'ch3-mc',
        template: 'multiple_choice',
        instruction: 'Выберите правильный вариант с модальным глаголом.',
        hint: 'После модального глагола инфинитив идёт без «å».',
        content: {
          question: 'Karim ___ stå opp tidlig fordi arbeidsdagen begynner klokka sju.',
          options: [
            { id: 'a', text: 'må å' },
            { id: 'b', text: 'må' },
            { id: 'c', text: 'måtte å' },
            { id: 'd', text: 'å må' },
          ],
        },
        expectedAnswers: {
          correct_option_ids: ['b'],
          explanation: 'Модальный глагол «må» + инфинитив без «å»: «må stå opp».',
        },
      },
      {
        key: 'ch3-fib',
        template: 'fill_in_blank',
        instruction: 'Вставьте подходящий модальный глагол в презенсе.',
        hint: 'хотеть = vil, мочь/уметь = kan.',
        content: {
          text_with_blanks: 'Karim ___1___ (хотеть) ta mer utdanning, og nå ___2___ (мочь) han snakke godt norsk.',
          word_bank: ['vil', 'kan', 'må', 'skal'],
        },
        expectedAnswers: {
          blanks: [
            { blank_id: 1, accepted_answers: ['vil'] },
            { blank_id: 2, accepted_answers: ['kan'] },
          ],
          explanation: 'vil = хочет, kan = может/умеет.',
        },
      },
      {
        key: 'ch3-tr',
        template: 'translate_to_target',
        instruction: 'Переведите предложение на норвежский.',
        content: {
          dir: 'to_target',
          langs: { explain: 'Russisk', target: 'Norsk' },
          format: 'single',
          note: '',
          items: [
            {
              id: 's1',
              dir: 'to_target',
              source: 'Я хочу учить норвежский.',
              gloss: [],
            },
          ],
        },
        expectedAnswers: {
          items: {
            s1: {
              refs: ['Jeg vil lære norsk.'],
              require: [
                {
                  text: 'vil lære',
                  note: 'После модального глагола инфинитив идёт без «å»: «vil lære», не «vil å lære».',
                },
              ],
              forbid: [
                {
                  text: 'vil å',
                  note: '«å» после модального глагола не ставится.',
                },
              ],
              explanation: '«vil» + инфинитив без «å»: «vil lære».',
            },
          },
        },
      },
      {
        key: 'ch3-match',
        template: 'match_pairs',
        instruction: 'Сопоставьте слова с переводом.',
        content: {
          left_items: [
            { id: 'l1', text: 'stilling' },
            { id: 'l2', text: 'sjef' },
            { id: 'l3', text: 'ferie' },
            { id: 'l4', text: 'rettighet' },
          ],
          right_items: [
            { id: 'r1', text: 'начальник' },
            { id: 'r2', text: 'должность' },
            { id: 'r3', text: 'право' },
            { id: 'r4', text: 'отпуск' },
          ],
        },
        expectedAnswers: {
          pairs: [
            { left_id: 'l1', right_id: 'r2' },
            { left_id: 'l2', right_id: 'r1' },
            { left_id: 'l3', right_id: 'r4' },
            { left_id: 'l4', right_id: 'r3' },
          ],
        },
      },
    ],
  },
];

// ─── Seeding logic ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Seeding demo Norwegian B1 course («Stein på stein»)...');

  // 0. Verify exercise templates exist (created by prisma/seed.ts).
  const templateCodes = ['multiple_choice', 'fill_in_blank', 'translate_to_target', 'match_pairs'];
  const templates = await prisma.exerciseTemplate.findMany({
    where: { code: { in: templateCodes } },
  });
  const templateByCode = new Map(templates.map((t) => [t.code, t.id]));
  const missing = templateCodes.filter((c) => !templateByCode.has(c));
  if (missing.length > 0) {
    throw new Error(
      `Missing exercise templates: ${missing.join(', ')}. ` +
        `Run "npm run prisma:seed" first to seed the templates.`,
    );
  }

  // 1. Course container + published version.
  const containerId = id('container', 'norsk-b1');
  const versionId = id('version', 'norsk-b1-v1');

  await prisma.container.upsert({
    where: { id: containerId },
    update: {
      title: 'Norsk B1 — Stein på stein',
      description:
        'Demonstrasjonskurs i norsk på B1-nivå, bygd opp etter mønster av læreboka ' +
        '«Stein på stein». Hvert kapittel har lesetekst, ordforråd, grammatikk og en ' +
        'avsluttende test.',
      ownerUserId: TEACHER_ID,
      ownerSchoolId: SCHOOL_ID,
      visibility: VISIBILITY,
      accessTier: ACCESS_TIER,
      currentPublishedVersionId: versionId,
    },
    create: {
      id: containerId,
      slug: 'norsk-b1-stein-paa-stein',
      containerType: 'COURSE',
      targetLanguage: TARGET_LANG,
      difficultyLevel: LEVEL,
      title: 'Norsk B1 — Stein på stein',
      description:
        'Demonstrasjonskurs i norsk på B1-nivå, bygd opp etter mønster av læreboka ' +
        '«Stein på stein». Hvert kapittel har lesetekst, ordforråd, grammatikk og en ' +
        'avsluttende test.',
      ownerUserId: TEACHER_ID,
      ownerSchoolId: SCHOOL_ID,
      visibility: VISIBILITY,
      accessTier: ACCESS_TIER,
    },
  });

  await prisma.containerVersion.upsert({
    where: { id: versionId },
    update: { status: 'PUBLISHED' },
    create: {
      id: versionId,
      containerId,
      versionNumber: 1,
      status: 'PUBLISHED',
      changelog: 'Initial demo content.',
      createdByUserId: TEACHER_ID,
      publishedAt: new Date(),
      publishedByUserId: TEACHER_ID,
    },
  });

  // Ensure the deferred FK is satisfied (container → published version).
  await prisma.container.update({
    where: { id: containerId },
    data: { currentPublishedVersionId: versionId },
  });

  console.log('  ✓ Course container + published version');

  // 2. Chapters: section + lesson + vocab + grammar + test exercises.
  let itemPosition = 0;

  for (const [chapterIndex, ch] of chapters.entries()) {
    const sectionId = id('section', ch.key);

    await prisma.containerSection.upsert({
      where: { id: sectionId },
      update: { title: ch.sectionTitle },
      create: {
        id: sectionId,
        containerVersionId: versionId,
        title: ch.sectionTitle,
        position: chapterIndex,
      },
    });

    // 2a. Lesson + content variant.
    const lessonId = id('lesson', ch.key);
    await prisma.lesson.upsert({
      where: { id: lessonId },
      update: {
        title: ch.lesson.title,
        description: ch.lesson.description,
        ownerUserId: TEACHER_ID,
        ownerSchoolId: SCHOOL_ID,
        visibility: VISIBILITY,
      },
      create: {
        id: lessonId,
        targetLanguage: TARGET_LANG,
        difficultyLevel: LEVEL,
        slug: `norsk-b1-${ch.key}-leksjon`,
        title: ch.lesson.title,
        description: ch.lesson.description,
        ownerUserId: TEACHER_ID,
        ownerSchoolId: SCHOOL_ID,
        visibility: VISIBILITY,
      },
    });
    const lessonVariantId = id('lesson-variant', ch.key);
    await prisma.lessonContentVariant.upsert({
      where: { id: lessonVariantId },
      update: { bodyMarkdown: ch.lesson.body, status: 'PUBLISHED' },
      create: {
        id: lessonVariantId,
        lessonId,
        explanationLanguage: EXPLANATION_LANG,
        minLevel: LEVEL,
        maxLevel: LEVEL,
        displayTitle: ch.lesson.title,
        displayDescription: ch.lesson.description,
        bodyMarkdown: ch.lesson.body,
        estimatedReadingMinutes: 8,
        status: 'PUBLISHED',
        createdByUserId: TEACHER_ID,
        lastEditedByUserId: TEACHER_ID,
        publishedAt: new Date(),
      },
    });
    await upsertItem(versionId, sectionId, itemPosition++, 'LESSON', lessonId);

    // 2b. Vocabulary list + items + translations.
    const vocabListId = id('vocab', ch.key);
    await prisma.vocabularyList.upsert({
      where: { id: vocabListId },
      update: {
        title: ch.vocab.title,
        description: ch.vocab.description,
        ownerUserId: TEACHER_ID,
        ownerSchoolId: SCHOOL_ID,
        visibility: VISIBILITY,
      },
      create: {
        id: vocabListId,
        slug: `norsk-b1-${ch.key}-ordforraad`,
        title: ch.vocab.title,
        description: ch.vocab.description,
        targetLanguage: TARGET_LANG,
        difficultyLevel: LEVEL,
        ownerUserId: TEACHER_ID,
        ownerSchoolId: SCHOOL_ID,
        visibility: VISIBILITY,
      },
    });
    for (const [wordIndex, w] of ch.vocab.words.entries()) {
      const itemId = id('vocab-item', `${ch.key}-${wordIndex}`);
      await prisma.vocabularyItem.upsert({
        where: { id: itemId },
        update: { word: w.word, position: wordIndex, partOfSpeech: w.pos as never },
        create: {
          id: itemId,
          vocabularyListId: vocabListId,
          word: w.word,
          position: wordIndex,
          partOfSpeech: w.pos as never,
        },
      });
      const translationId = id('vocab-translation', `${ch.key}-${wordIndex}`);
      await prisma.vocabularyItemTranslation.upsert({
        where: { id: translationId },
        update: { primaryTranslation: w.translation },
        create: {
          id: translationId,
          vocabularyItemId: itemId,
          translationLanguage: EXPLANATION_LANG,
          primaryTranslation: w.translation,
          createdByUserId: TEACHER_ID,
          lastEditedByUserId: TEACHER_ID,
        },
      });
      const exampleId = id('vocab-example', `${ch.key}-${wordIndex}`);
      await prisma.vocabularyUsageExample.upsert({
        where: { id: exampleId },
        update: { exampleText: w.example },
        create: {
          id: exampleId,
          vocabularyItemId: itemId,
          exampleText: w.example,
          position: 0,
        },
      });
      const exampleTranslationId = id('vocab-example-translation', `${ch.key}-${wordIndex}`);
      await prisma.vocabularyExampleTranslation.upsert({
        where: { id: exampleTranslationId },
        update: { translatedText: w.exampleTranslation },
        create: {
          id: exampleTranslationId,
          vocabularyUsageExampleId: exampleId,
          translationLanguage: EXPLANATION_LANG,
          translatedText: w.exampleTranslation,
        },
      });
    }
    await upsertItem(versionId, sectionId, itemPosition++, 'VOCABULARY_LIST', vocabListId);

    // 2c. Grammar rule + explanation.
    const grammarId = id('grammar', ch.key);
    await prisma.grammarRule.upsert({
      where: { id: grammarId },
      update: {
        title: ch.grammar.title,
        subtopic: ch.grammar.subtopic,
        ownerUserId: TEACHER_ID,
        ownerSchoolId: SCHOOL_ID,
        visibility: VISIBILITY,
      },
      create: {
        id: grammarId,
        slug: `norsk-b1-${ch.key}-grammatikk`,
        targetLanguage: TARGET_LANG,
        difficultyLevel: LEVEL,
        topic: ch.grammar.topic as never,
        subtopic: ch.grammar.subtopic,
        title: ch.grammar.title,
        ownerUserId: TEACHER_ID,
        ownerSchoolId: SCHOOL_ID,
        visibility: VISIBILITY,
      },
    });
    const grammarExplanationId = id('grammar-explanation', ch.key);
    await prisma.grammarRuleExplanation.upsert({
      where: { id: grammarExplanationId },
      update: { bodyMarkdown: ch.grammar.body, status: 'PUBLISHED' },
      create: {
        id: grammarExplanationId,
        grammarRuleId: grammarId,
        explanationLanguage: EXPLANATION_LANG,
        minLevel: LEVEL,
        maxLevel: LEVEL,
        displayTitle: ch.grammar.title,
        displaySummary: ch.grammar.summary,
        bodyMarkdown: ch.grammar.body,
        estimatedReadingMinutes: 5,
        status: 'PUBLISHED',
        createdByUserId: TEACHER_ID,
        lastEditedByUserId: TEACHER_ID,
        publishedAt: new Date(),
      },
    });
    await upsertItem(versionId, sectionId, itemPosition++, 'GRAMMAR_RULE', grammarId);

    // 2d. Test — exercises after the lesson, wired into the grammar rule pool too.
    for (const [exIndex, ex] of ch.test.entries()) {
      const exerciseId = id('exercise', ex.key);
      await prisma.exercise.upsert({
        where: { id: exerciseId },
        update: {
          content: ex.content,
          expectedAnswers: ex.expectedAnswers,
          ownerUserId: TEACHER_ID,
          ownerSchoolId: SCHOOL_ID,
          visibility: VISIBILITY,
        },
        create: {
          id: exerciseId,
          exerciseTemplateId: templateByCode.get(ex.template)!,
          targetLanguage: TARGET_LANG,
          difficultyLevel: LEVEL,
          content: ex.content,
          expectedAnswers: ex.expectedAnswers,
          ownerUserId: TEACHER_ID,
          ownerSchoolId: SCHOOL_ID,
          visibility: VISIBILITY,
          estimatedDurationSeconds: 60,
        },
      });
      const instructionId = id('exercise-instruction', ex.key);
      await prisma.exerciseInstruction.upsert({
        where: { id: instructionId },
        update: { instructionText: ex.instruction, hintText: ex.hint ?? null },
        create: {
          id: instructionId,
          exerciseId,
          instructionLanguage: EXPLANATION_LANG,
          instructionText: ex.instruction,
          hintText: ex.hint ?? null,
        },
      });
      // Link exercise into the chapter's grammar rule practice pool.
      const poolId = id('grammar-pool', ex.key);
      await prisma.grammarRuleExercisePool.upsert({
        where: { id: poolId },
        update: { position: exIndex },
        create: {
          id: poolId,
          grammarRuleId: grammarId,
          exerciseId,
          position: exIndex,
          addedByUserId: TEACHER_ID,
        },
      });
      await upsertItem(versionId, sectionId, itemPosition++, 'EXERCISE', exerciseId);
    }

    console.log(`  ✓ ${ch.sectionTitle}`);
  }

  console.log(
    `Done. 1 course, ${chapters.length} chapters, ` +
      `${chapters.length} lessons, ${chapters.length} vocab lists, ` +
      `${chapters.length} grammar rules, ` +
      `${chapters.reduce((n, c) => n + c.test.length, 0)} exercises seeded.`,
  );
}

// Upsert a container item by deterministic id derived from version + type + target.
async function upsertItem(
  versionId: string,
  sectionId: string,
  position: number,
  itemType: string,
  targetId: string,
): Promise<void> {
  const itemId = id('container-item', `${versionId}:${itemType}:${targetId}`);
  await prisma.containerItem.upsert({
    where: { id: itemId },
    update: { position, sectionId },
    create: {
      id: itemId,
      containerVersionId: versionId,
      position,
      itemType: itemType as never,
      itemId: targetId,
      sectionId,
    },
  });
}

main()
  .catch((err) => {
    console.error('Demo seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
