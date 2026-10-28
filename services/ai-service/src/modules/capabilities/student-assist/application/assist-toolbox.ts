import { Inject, Injectable } from '@nestjs/common';
import type { LlmTool } from '../../../providers/domain/llm-request.js';
import type { LlmToolCall } from '../../../providers/domain/llm-result.js';
import type { AssistContext, AssistSource } from '../domain/assist-answer.js';
import {
  CLASS_SESSION_READER,
  COURSE_MATERIAL_READER,
  MASTERY_READER,
  REVIEWED_WORK_READER,
  type IClassSessionReader,
  type ICourseMaterialReader,
  type IMasteryReader,
  type IReviewedWorkReader,
  type UnitMaterial,
} from './ports/assist-readers.js';

/**
 * Who asks and about what, fixed by the server for the whole turn. Whether the learner may
 * read this course or class at all is settled before the loop starts (step 3's resolver);
 * the toolbox only reads within it.
 */
export interface AssistToolScope {
  userId: string;
  context: AssistContext;
  /** Code of the explanation language (Q5): picks content variants and translations. */
  language: string;
}

/** A tool's answer: the text the model reads, and what in it the answer may cite. */
export interface AssistToolOutcome {
  content: string;
  sources: AssistSource[];
}

/** No tool result is longer than this in the model's context. */
export const MAX_TOOL_CHARS = 12_000;
const MAX_ANSWER_CHARS = 4_000;
const MAX_WEAK_TOPICS = 5;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_INPUT = { type: 'object', additionalProperties: false, properties: {} };

const TOOLS = {
  get_unit_material: {
    name: 'get_unit_material',
    description:
      'The published material of the unit the learner is in: lesson texts, grammar rules with examples, ' +
      'the word list, and the titles of its exercises (never their answers).',
    inputSchema: NO_INPUT,
  },
  get_grammar_rule: {
    name: 'get_grammar_rule',
    description: 'One grammar rule of the course in full, by the id another tool returned.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['ruleId'],
      properties: { ruleId: { type: 'string', description: 'A grammar rule id exactly as a tool returned it' } },
    },
  },
  lookup_word: {
    name: 'lookup_word',
    description: 'A word in the course\'s word lists and among the words the learner saved, with translations and examples.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['lemma'],
      properties: { lemma: { type: 'string', minLength: 1, maxLength: 100, description: 'The word, in its base form' } },
    },
  },
  get_weak_topics: {
    name: 'get_weak_topics',
    description: 'The skills the learner\'s results show as weak, with why (e.g. forgets, slow). Labels only.',
    inputSchema: NO_INPUT,
  },
  get_my_reviewed_work: {
    name: 'get_my_reviewed_work',
    description: 'The learner\'s submitted work this question is about, with the reviewer\'s verdict and remarks.',
    inputSchema: NO_INPUT,
  },
  get_class: {
    name: 'get_class',
    description: 'The class this question is about: date, time, kind, and which unit it covers.',
    inputSchema: NO_INPUT,
  },
} satisfies Record<string, LlmTool>;

type ToolName = keyof typeof TOOLS;

function outcome(value: unknown, sources: AssistSource[] = []): AssistToolOutcome {
  return { content: capped(JSON.stringify(value)), sources };
}

function refused(error: string, message: string): AssistToolOutcome {
  return outcome({ error, message });
}

function capped(text: string): string {
  return text.length <= MAX_TOOL_CHARS ? text : `${text.slice(0, MAX_TOOL_CHARS)} …[cut: the rest did not fit]`;
}

/**
 * The read-only tools of `student_assist` (plan 83, step 2). Ids the reads turn on — the
 * unit, the attempt, the class — come from the turn's context, never from the model: a
 * model told to read another learner's work has no parameter to name it by. The model
 * names only a rule (content-service answers only for the course's own) and a word.
 *
 * Failures are answers, not exceptions: the model reads «not found» or «unavailable» and
 * says it does not know (R-f) rather than the turn dying on a tool. Nothing here logs a
 * tool's result (R-j).
 */
@Injectable()
export class AssistToolbox {
  constructor(
    @Inject(COURSE_MATERIAL_READER) private readonly content: ICourseMaterialReader,
    @Inject(MASTERY_READER) private readonly mastery: IMasteryReader,
    @Inject(REVIEWED_WORK_READER) private readonly reviews: IReviewedWorkReader,
    @Inject(CLASS_SESSION_READER) private readonly classes: IClassSessionReader,
  ) {}

  /** The tools a context offers: only those that can answer anything in it. */
  toolsFor(context: AssistContext): LlmTool[] {
    const names: ToolName[] = [];
    if (context.kind === 'unit' && context.courseId && context.unitId) names.push('get_unit_material');
    if (context.kind === 'submission' && context.attemptId) names.push('get_my_reviewed_work');
    if (context.kind === 'class' && context.lessonId) {
      names.push('get_class');
      if (context.courseId) names.push('get_unit_material');
    }
    if (context.courseId) names.push('get_grammar_rule');
    names.push('lookup_word', 'get_weak_topics');
    return names.map((name) => TOOLS[name]);
  }

  async run(call: LlmToolCall, scope: AssistToolScope): Promise<AssistToolOutcome> {
    if (!this.toolsFor(scope.context).some((tool) => tool.name === call.name)) {
      return refused('unknown_tool', `No tool "${call.name}" in this conversation`);
    }
    try {
      switch (call.name as ToolName) {
        case 'get_unit_material':
          return await this.unitMaterial(scope);
        case 'get_grammar_rule':
          return await this.grammarRule(call.input, scope);
        case 'lookup_word':
          return await this.lookupWord(call.input, scope);
        case 'get_weak_topics':
          return outcome({
            weakTopics: (await this.mastery.weakTopics(scope.userId, scope.context.courseId ?? null)).slice(0, MAX_WEAK_TOPICS),
          });
        case 'get_my_reviewed_work':
          return await this.reviewedWork(scope);
        case 'get_class':
          return await this.classSession(scope);
      }
    } catch {
      // The reason stays out of the model's context and of the logs; the caller logs the failure by name.
      return refused('unavailable', 'This could not be read right now');
    }
  }

  private async unitMaterial(scope: AssistToolScope): Promise<AssistToolOutcome> {
    const courseId = scope.context.courseId!;
    let unitId = scope.context.unitId ?? null;
    if (scope.context.kind === 'class') {
      unitId = (await this.classes.session(scope.context.lessonId!))?.contentUnitId ?? null;
      if (!unitId) return refused('not_found', 'The class has no unit assigned');
    }
    const material = await this.content.unitMaterial(courseId, unitId!, scope.language);
    if (!material) return refused('not_found', 'The unit is not published in this course');
    return outcome(material, unitSources(material));
  }

  private async grammarRule(input: unknown, scope: AssistToolScope): Promise<AssistToolOutcome> {
    const ruleId = (input as { ruleId?: unknown } | null)?.ruleId;
    if (typeof ruleId !== 'string' || !UUID.test(ruleId)) return refused('invalid_input', 'ruleId must be an id a tool returned');
    const courseId = scope.context.courseId!;
    const rule = await this.content.grammarRule(courseId, ruleId, scope.language);
    if (!rule) return refused('not_found', 'No such rule in this course');
    return outcome(rule, [{ kind: 'grammar_rule', id: rule.id, title: rule.title, courseId }]);
  }

  private async lookupWord(input: unknown, scope: AssistToolScope): Promise<AssistToolOutcome> {
    const lemma = (input as { lemma?: unknown } | null)?.lemma;
    if (typeof lemma !== 'string' || lemma.trim() === '' || lemma.length > 100) {
      return refused('invalid_input', 'lemma must be a word of at most 100 characters');
    }
    const courseId = scope.context.courseId ?? null;
    const found = await this.content.lookupWord(lemma.trim(), scope.userId, scope.language, courseId);
    const sources: AssistSource[] = [
      ...found.course.map((w) => withCourse({ kind: 'vocabulary_item' as const, id: w.id, title: w.word }, courseId)),
      ...found.personal.map((w) => ({ kind: 'vocabulary_item' as const, id: w.vocabularyItemId, title: w.word })),
    ];
    return outcome(found, dedupe(sources));
  }

  private async reviewedWork(scope: AssistToolScope): Promise<AssistToolOutcome> {
    const work = await this.reviews.reviewedWork(scope.context.attemptId!, scope.userId);
    if (work === null) return refused('not_found', 'No such submission of this learner');
    if (work === 'not_reviewed') {
      return refused('not_reviewed', 'The work has not been reviewed yet; do not discuss what may be wrong with it');
    }
    const answer = JSON.stringify(work.answer);
    return outcome({ ...work, answer: answer.length <= MAX_ANSWER_CHARS ? work.answer : `${answer.slice(0, MAX_ANSWER_CHARS)} …` });
  }

  private async classSession(scope: AssistToolScope): Promise<AssistToolOutcome> {
    const session = await this.classes.session(scope.context.lessonId!);
    if (!session) return refused('not_found', 'No such class');
    return outcome(session);
  }
}

function withCourse(source: AssistSource, courseId: string | null): AssistSource {
  return courseId ? { ...source, courseId } : source;
}

function dedupe(sources: AssistSource[]): AssistSource[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = `${s.kind}:${s.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Everything in a unit's material the answer may cite: the unit, its lessons, rules and words. */
export function unitSources(material: UnitMaterial): AssistSource[] {
  const at = { unitId: material.unit.id, courseId: material.courseId };
  return dedupe([
    { kind: 'unit', id: material.unit.id, title: material.unit.title, courseId: material.courseId },
    ...material.lessons.map((l) => ({ kind: 'lesson' as const, id: l.id, title: l.title, ...at })),
    ...material.grammarRules.map((r) => ({ kind: 'grammar_rule' as const, id: r.id, title: r.title, ...at })),
    ...material.vocabulary.map((v) => ({ kind: 'vocabulary_item' as const, id: v.id, title: v.word, ...at })),
  ]);
}
