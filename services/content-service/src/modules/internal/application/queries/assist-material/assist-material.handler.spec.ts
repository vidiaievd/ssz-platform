jest.mock('../../../../../infrastructure/database/prisma.service.js', () => ({
  PrismaService: class {},
}));

import { NotFoundException } from '@nestjs/common';
import {
  GetAssistGrammarRuleHandler,
  GetAssistUnitMaterialHandler,
  LookupAssistWordHandler,
} from './assist-material.handler.js';
import {
  GetAssistGrammarRuleQuery,
  GetAssistUnitMaterialQuery,
  LookupAssistWordQuery,
} from './assist-material.query.js';
import { pickVariant, trimText } from './assist-material.projection.js';

// Plan 83, step 2: what the student assistant may read of a course.

const COURSE = 'course-1';
const UNIT = 'unit-1';

const leaves = [
  { itemType: 'LESSON', itemId: 'lesson-1', moduleId: UNIT, isRequired: true },
  { itemType: 'GRAMMAR_RULE', itemId: 'rule-1', moduleId: UNIT, isRequired: true },
  { itemType: 'VOCABULARY_LIST', itemId: 'list-1', moduleId: UNIT, isRequired: true },
  { itemType: 'EXERCISE', itemId: 'ex-1', moduleId: UNIT, isRequired: true },
  { itemType: 'GRAMMAR_RULE', itemId: 'rule-other-unit', moduleId: 'unit-2', isRequired: true },
];

// Every key-bearing column of an exercise, as Prisma would return them if they were asked
// for. The stub hands them back whatever the select says; the handler must still drop them.
const KEY_FIELDS = {
  content: { gaps: [{ answer: 'har' }] },
  expectedAnswers: { gaps: ['har'] },
  answerCheckSettings: { caseSensitive: false },
  draftContent: { gaps: [] },
  draftExpectedAnswers: { gaps: [] },
};

const explanation = (language: string, minLevel = 'A1') => ({
  explanationLanguage: language,
  minLevel,
  displayTitle: `Kjønn (${language})`,
  displaySummary: 'en, ei, et',
  bodyMarkdown: 'Substantiv har kjønn. '.repeat(400),
  compareExamples: [
    { sentence: 'en bil', isCorrect: true, note: null },
    { sentence: 'et bil', isCorrect: false, note: 'bil er hankjønn' },
  ],
  quickCheck: { question: 'en/et hus?', answer: 'et' },
});

function prismaStub() {
  return {
    container: { findUnique: jest.fn().mockResolvedValue({ id: UNIT, title: 'Leksjon 1' }) },
    lesson: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'lesson-1',
          title: 'Tekst',
          variants: [
            { explanationLanguage: 'en', minLevel: 'A1', displayTitle: 'Text (en)', bodyMarkdown: 'Hei!' },
            { explanationLanguage: 'ru', minLevel: 'A1', displayTitle: 'Текст', bodyMarkdown: 'Hei! Jeg heter Ola.' },
          ],
        },
      ]),
    },
    grammarRule: {
      findMany: jest.fn().mockResolvedValue([{ id: 'rule-1', title: 'Kjønn', explanations: [explanation('ru')] }]),
      findFirst: jest.fn().mockResolvedValue({ id: 'rule-1', title: 'Kjønn', explanations: [explanation('ru')] }),
    },
    vocabularyItem: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'word-1',
          word: 'bil',
          partOfSpeech: 'NOUN',
          translations: [
            {
              primaryTranslation: 'машина',
              alternativeTranslations: ['автомобиль'],
              definition: null,
              usageNotes: null,
              falseFriendWarning: null,
            },
          ],
          usageExamples: [{ exampleText: 'Jeg har en bil.' }],
        },
      ]),
    },
    exercise: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'ex-1', title: 'Fyll inn', template: { code: 'fill_in_blank' }, ...KEY_FIELDS },
      ]),
    },
    personalVocabularyEntry: {
      findMany: jest.fn().mockResolvedValue([
        {
          vocabularyItemId: 'word-9',
          surfaceForm: 'Bil',
          contextSentence: 'Bil er dyrt.',
          vocabularyItem: { word: 'bil', translations: [{ primaryTranslation: 'машина' }] },
        },
      ]),
    },
  };
}

function setup() {
  const prisma = prismaStub();
  const queryBus = { execute: jest.fn().mockResolvedValue(leaves) };
  return {
    prisma,
    queryBus,
    unit: new GetAssistUnitMaterialHandler(prisma as never, queryBus as never),
    rule: new GetAssistGrammarRuleHandler(prisma as never, queryBus as never),
    word: new LookupAssistWordHandler(prisma as never, queryBus as never),
  };
}

const FORBIDDEN = Object.keys(KEY_FIELDS).concat('quickCheck');

/** Every key of every object in a value, at any depth. */
function keysDeep(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysDeep(v, out);
    }
  }
  return out;
}

describe('GetAssistUnitMaterialHandler', () => {
  it('reads the unit\'s published material in the asked language', async () => {
    const { unit } = setup();
    const material = await unit.execute(new GetAssistUnitMaterialQuery(COURSE, UNIT, 'ru'));

    expect(material.unit).toEqual({ id: UNIT, title: 'Leksjon 1' });
    expect(material.lessons).toEqual([{ id: 'lesson-1', title: 'Текст', text: 'Hei! Jeg heter Ola.', truncated: false }]);
    expect(material.grammarRules).toEqual([
      {
        id: 'rule-1',
        title: 'Kjønn (ru)',
        summary: 'en, ei, et',
        examples: [
          { sentence: 'en bil', correct: true, note: null },
          { sentence: 'et bil', correct: false, note: 'bil er hankjønn' },
        ],
      },
    ]);
    expect(material.vocabulary).toEqual([{ id: 'word-1', word: 'bil', partOfSpeech: 'noun', translation: 'машина' }]);
    expect(material.exercises).toEqual([{ id: 'ex-1', title: 'Fyll inn', template: 'fill_in_blank' }]);
  });

  it('never asks for an exercise\'s content, keys or check settings, nor a rule\'s quick check (R-g)', async () => {
    const { unit, prisma } = setup();
    await unit.execute(new GetAssistUnitMaterialQuery(COURSE, UNIT, 'ru'));

    const exerciseSelect = prisma.exercise.findMany.mock.calls[0][0].select;
    expect(Object.keys(exerciseSelect).sort()).toEqual(['id', 'template', 'title']);
    expect(exerciseSelect.template).toEqual({ select: { code: true } });
    const ruleSelect = keysDeep(prisma.grammarRule.findMany.mock.calls[0][0].select);
    for (const field of FORBIDDEN) expect(ruleSelect.has(field)).toBe(false);
  });

  it('drops key fields even when the database hands them back', async () => {
    const { unit } = setup();
    const material = await unit.execute(new GetAssistUnitMaterialQuery(COURSE, UNIT, 'ru'));
    const keys = keysDeep(material);
    for (const field of FORBIDDEN) expect(keys.has(field)).toBe(false);
    expect(JSON.stringify(material)).not.toContain('"har"');
  });

  it('reads only items of this unit, and only from the published tree', async () => {
    const { unit, prisma, queryBus } = setup();
    await unit.execute(new GetAssistUnitMaterialQuery(COURSE, UNIT, 'ru'));
    expect(queryBus.execute.mock.calls[0][0]).toMatchObject({ containerId: COURSE });
    expect(prisma.grammarRule.findMany.mock.calls[0][0].where.id).toEqual({ in: ['rule-1'] });
  });

  it('is 404 for a unit not published in the course', async () => {
    const { unit } = setup();
    await expect(unit.execute(new GetAssistUnitMaterialQuery(COURSE, 'unit-elsewhere', 'ru'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('GetAssistGrammarRuleHandler', () => {
  it('reads a rule of the course, its text capped', async () => {
    const { rule } = setup();
    const read = await rule.execute(new GetAssistGrammarRuleQuery(COURSE, 'rule-other-unit', 'ru'));
    expect(read.title).toBe('Kjønn (ru)');
    expect(read.truncated).toBe(true);
    expect(read.text.length).toBeLessThanOrEqual(3002);
    expect(keysDeep(read).has('quickCheck')).toBe(false);
  });

  it('is 404 for a rule the course does not publish', async () => {
    const { rule, prisma } = setup();
    await expect(rule.execute(new GetAssistGrammarRuleQuery(COURSE, 'rule-of-another-school', 'ru'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.grammarRule.findFirst).not.toHaveBeenCalled();
  });
});

describe('LookupAssistWordHandler', () => {
  it('finds the word in the course\'s lists and in the learner\'s own words', async () => {
    const { word, prisma } = setup();
    const found = await word.execute(new LookupAssistWordQuery(' bil ', 'user-1', 'ru', COURSE));
    expect(found.lemma).toBe('bil');
    expect(found.course[0]).toMatchObject({ id: 'word-1', translation: 'машина', alternatives: ['автомобиль'], examples: ['Jeg har en bil.'] });
    expect(found.personal).toEqual([
      { vocabularyItemId: 'word-9', word: 'bil', surfaceForm: 'Bil', contextSentence: 'Bil er dyrt.', translation: 'машина' },
    ]);
    expect(prisma.vocabularyItem.findMany.mock.calls[0][0].where.vocabularyListId).toEqual({ in: ['list-1'] });
    expect(prisma.personalVocabularyEntry.findMany.mock.calls[0][0].where.userId).toBe('user-1');
  });

  it('without a course, searches only the learner\'s own words', async () => {
    const { word, prisma, queryBus } = setup();
    const found = await word.execute(new LookupAssistWordQuery('bil', 'user-1', 'ru', null));
    expect(found.course).toEqual([]);
    expect(queryBus.execute).not.toHaveBeenCalled();
    expect(prisma.vocabularyItem.findMany).not.toHaveBeenCalled();
  });
});

describe('pickVariant / trimText', () => {
  it('prefers the asked language, then English, then any; the lowest level first', () => {
    const v = (explanationLanguage: string, minLevel: string) => ({ explanationLanguage, minLevel });
    expect(pickVariant([v('en', 'A1'), v('ru', 'B1'), v('ru', 'A2')], 'ru')).toEqual(v('ru', 'A2'));
    expect(pickVariant([v('uk', 'A1'), v('en', 'A1')], 'ru')).toEqual(v('en', 'A1'));
    expect(pickVariant([v('uk', 'B1')], 'ru')).toEqual(v('uk', 'B1'));
    expect(pickVariant([], 'ru')).toBeNull();
  });

  it('cuts at a word near the limit', () => {
    expect(trimText('  kort  ', 10)).toEqual({ text: 'kort', truncated: false });
    expect(trimText('alpha beta gamma delta', 19)).toEqual({ text: 'alpha beta gamma …', truncated: true });
    // No space near the limit: a hard cut rather than losing a fifth of the text.
    expect(trimText('en to tre fire fem', 12)).toEqual({ text: 'en to tre fi …', truncated: true });
  });
});
