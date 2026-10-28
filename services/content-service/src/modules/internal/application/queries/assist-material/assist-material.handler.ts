import { NotFoundException } from '@nestjs/common';
import { QueryBus, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { GetLeafItemsQuery } from '../../../../container/application/queries/get-leaf-items/get-leaf-items.query.js';
import type { LeafItem } from '../../../../container/application/queries/get-leaf-items/get-leaf-items.handler.js';
import {
  GetAssistGrammarRuleQuery,
  GetAssistUnitMaterialQuery,
  LookupAssistWordQuery,
} from './assist-material.query.js';
import {
  ASSIST_CAPS,
  pickVariant,
  trimText,
  type AssistGrammarRule,
  type AssistGrammarRuleSummary,
  type AssistUnitMaterial,
  type AssistWordLookup,
} from './assist-material.projection.js';

const PUBLISHED = 'PUBLISHED' as const;

// Every read below selects its fields explicitly and maps them one by one: an exercise's
// `content`, `expectedAnswers` and a rule's quick check are never fetched, so they have
// nowhere to ride along into a model's context (plan 83, R-g).

function ruleExplanationSelect() {
  return {
    where: { status: PUBLISHED, deletedAt: null },
    select: {
      explanationLanguage: true,
      minLevel: true,
      displayTitle: true,
      displaySummary: true,
      bodyMarkdown: true,
      compareExamples: {
        orderBy: { position: 'asc' as const },
        take: ASSIST_CAPS.ruleExamples,
        select: { sentence: true, isCorrect: true, note: true },
      },
    },
  };
}

type RuleRow = {
  id: string;
  title: string;
  explanations: {
    explanationLanguage: string;
    minLevel: string;
    displayTitle: string;
    displaySummary: string | null;
    bodyMarkdown: string;
    compareExamples: { sentence: string; isCorrect: boolean; note: string | null }[];
  }[];
};

function ruleSummary(row: RuleRow, language: string): { summary: AssistGrammarRuleSummary; body: string } {
  const explanation = pickVariant(row.explanations, language);
  return {
    summary: {
      id: row.id,
      title: explanation?.displayTitle ?? row.title,
      summary: explanation?.displaySummary ?? null,
      examples: (explanation?.compareExamples ?? []).map((e) => ({ sentence: e.sentence, correct: e.isCorrect, note: e.note })),
    },
    body: explanation?.bodyMarkdown ?? '',
  };
}

async function courseLeaves(queryBus: QueryBus, courseId: string): Promise<LeafItem[]> {
  return queryBus.execute<GetLeafItemsQuery, LeafItem[]>(new GetLeafItemsQuery(courseId));
}

function idsOf(leaves: LeafItem[], type: string): string[] {
  return [...new Set(leaves.filter((l) => l.itemType === type).map((l) => l.itemId))];
}

@QueryHandler(GetAssistUnitMaterialQuery)
export class GetAssistUnitMaterialHandler implements IQueryHandler<GetAssistUnitMaterialQuery, AssistUnitMaterial> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: GetAssistUnitMaterialQuery): Promise<AssistUnitMaterial> {
    // A unit is a top-level module of the course's published tree; one with no published
    // leaf there is not the course's, whatever it is elsewhere.
    const leaves = (await courseLeaves(this.queryBus, query.courseId)).filter((l) => l.moduleId === query.unitId);
    if (leaves.length === 0) throw new NotFoundException(`Unit ${query.unitId} is not published in course ${query.courseId}`);

    const [unit, lessons, rules, vocabulary, exercises] = await Promise.all([
      this.prisma.container.findUnique({ where: { id: query.unitId }, select: { id: true, title: true } }),
      this.prisma.lesson.findMany({
        where: { id: { in: idsOf(leaves, 'LESSON').slice(0, ASSIST_CAPS.lessons) }, deletedAt: null },
        select: {
          id: true,
          title: true,
          variants: {
            where: { status: PUBLISHED, deletedAt: null },
            select: { explanationLanguage: true, minLevel: true, displayTitle: true, bodyMarkdown: true },
          },
        },
      }),
      this.prisma.grammarRule.findMany({
        where: { id: { in: idsOf(leaves, 'GRAMMAR_RULE').slice(0, ASSIST_CAPS.rules) }, deletedAt: null },
        select: { id: true, title: true, explanations: ruleExplanationSelect() },
      }),
      this.prisma.vocabularyItem.findMany({
        where: { vocabularyListId: { in: idsOf(leaves, 'VOCABULARY_LIST') }, deletedAt: null },
        orderBy: [{ vocabularyListId: 'asc' }, { position: 'asc' }],
        take: ASSIST_CAPS.vocabulary,
        select: {
          id: true,
          word: true,
          partOfSpeech: true,
          translations: { where: { translationLanguage: query.language }, select: { primaryTranslation: true } },
        },
      }),
      this.prisma.exercise.findMany({
        where: { id: { in: idsOf(leaves, 'EXERCISE').slice(0, ASSIST_CAPS.exercises) }, deletedAt: null },
        select: { id: true, title: true, template: { select: { code: true } } },
      }),
    ]);

    return {
      courseId: query.courseId,
      unit: { id: query.unitId, title: unit?.title ?? '' },
      lessons: lessons.flatMap((lesson) => {
        const variant = pickVariant(lesson.variants, query.language);
        if (!variant) return [];
        const { text, truncated } = trimText(variant.bodyMarkdown, ASSIST_CAPS.lessonChars);
        return [{ id: lesson.id, title: variant.displayTitle || lesson.title, text, truncated }];
      }),
      grammarRules: (rules as RuleRow[]).map((row) => ruleSummary(row, query.language).summary),
      vocabulary: vocabulary.map((item) => ({
        id: item.id,
        word: item.word,
        partOfSpeech: item.partOfSpeech ? String(item.partOfSpeech).toLowerCase() : null,
        translation: item.translations[0]?.primaryTranslation ?? null,
      })),
      exercises: exercises.map((e) => ({ id: e.id, title: e.title, template: e.template.code })),
    };
  }
}

@QueryHandler(GetAssistGrammarRuleQuery)
export class GetAssistGrammarRuleHandler implements IQueryHandler<GetAssistGrammarRuleQuery, AssistGrammarRule> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: GetAssistGrammarRuleQuery): Promise<AssistGrammarRule> {
    const inCourse = idsOf(await courseLeaves(this.queryBus, query.courseId), 'GRAMMAR_RULE').includes(query.ruleId);
    if (!inCourse) throw new NotFoundException(`Grammar rule ${query.ruleId} is not published in course ${query.courseId}`);

    const row = await this.prisma.grammarRule.findFirst({
      where: { id: query.ruleId, deletedAt: null },
      select: { id: true, title: true, explanations: ruleExplanationSelect() },
    });
    if (!row) throw new NotFoundException(`Grammar rule ${query.ruleId} not found`);

    const { summary, body } = ruleSummary(row as RuleRow, query.language);
    return { ...summary, ...trimText(body, ASSIST_CAPS.ruleChars) };
  }
}

@QueryHandler(LookupAssistWordQuery)
export class LookupAssistWordHandler implements IQueryHandler<LookupAssistWordQuery, AssistWordLookup> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(query: LookupAssistWordQuery): Promise<AssistWordLookup> {
    const lemma = query.lemma.trim();
    const same = { equals: lemma, mode: 'insensitive' as const };
    const listIds = query.courseId ? idsOf(await courseLeaves(this.queryBus, query.courseId), 'VOCABULARY_LIST') : [];

    const [course, personal] = await Promise.all([
      listIds.length === 0
        ? Promise.resolve([])
        : this.prisma.vocabularyItem.findMany({
            where: { vocabularyListId: { in: listIds }, deletedAt: null, word: same },
            take: ASSIST_CAPS.wordMatches,
            select: {
              id: true,
              word: true,
              partOfSpeech: true,
              translations: {
                where: { translationLanguage: query.language },
                select: {
                  primaryTranslation: true,
                  alternativeTranslations: true,
                  definition: true,
                  usageNotes: true,
                  falseFriendWarning: true,
                },
              },
              usageExamples: { orderBy: { position: 'asc' }, take: ASSIST_CAPS.wordExamples, select: { exampleText: true } },
            },
          }),
      this.prisma.personalVocabularyEntry.findMany({
        where: { userId: query.userId, OR: [{ surfaceForm: same }, { vocabularyItem: { word: same, deletedAt: null } }] },
        take: ASSIST_CAPS.wordMatches,
        select: {
          vocabularyItemId: true,
          surfaceForm: true,
          contextSentence: true,
          vocabularyItem: {
            select: {
              word: true,
              translations: { where: { translationLanguage: query.language }, select: { primaryTranslation: true } },
            },
          },
        },
      }),
    ]);

    return {
      lemma,
      course: course.map((item) => {
        const t = item.translations[0];
        return {
          id: item.id,
          word: item.word,
          partOfSpeech: item.partOfSpeech ? String(item.partOfSpeech).toLowerCase() : null,
          translation: t?.primaryTranslation ?? null,
          alternatives: t?.alternativeTranslations ?? [],
          definition: t?.definition ?? null,
          usageNotes: t?.usageNotes ?? null,
          falseFriendWarning: t?.falseFriendWarning ?? null,
          examples: item.usageExamples.map((e) => e.exampleText),
        };
      }),
      personal: personal.map((entry) => ({
        vocabularyItemId: entry.vocabularyItemId,
        word: entry.vocabularyItem.word,
        surfaceForm: entry.surfaceForm,
        contextSentence: entry.contextSentence,
        translation: entry.vocabularyItem.translations[0]?.primaryTranslation ?? null,
      })),
    };
  }
}
