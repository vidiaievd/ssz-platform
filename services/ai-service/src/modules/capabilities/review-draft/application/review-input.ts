import { commentLanguage, languageName } from '../domain/comment-language.js';
import { enabledAspects, errorCorrectionAspects, writingTaskAspects, type ReviewAspect } from '../domain/review-aspect.js';
import type { ReviewFrame } from '../domain/review-remarks.js';
import type { TranslateReviewInput } from '../domain/translate-review.js';
import { ESSAY_ITEM_ID, type WritingTaskReviewInput } from '../domain/writing-task-review.js';
import type { ReviewSubject } from '../prompts/prompts.js';
import type { EngineSubject, TranslateSubject, WritingTaskSubject } from './ports/review-attempts.client.js';

/** Why a submission is not asked of a model at all — the same in the queue and in a run over the set. */
export type UnaskableReason = 'ai_off' | 'no_checks' | 'empty_answer';

/** The aspects the author's AI block allows, read by the template's own switches. */
export function subjectAspects(subject: EngineSubject): ReviewAspect[] {
  switch (subject.template) {
    case 'translate':
      return enabledAspects(subject.ai.checks);
    case 'error_correction':
      return errorCorrectionAspects(subject.ai.checks);
    case 'writing_task':
      return writingTaskAspects(subject.ai.checks);
  }
}

/**
 * The submission's answers in the order the prompt numbers them — what remarks quote and
 * point at by index. An essay is one: the whole text.
 */
export function subjectSentences(subject: EngineSubject): ReviewFrame['sentences'] {
  if (subject.template === 'writing_task') return [{ itemId: ESSAY_ITEM_ID, answer: subject.text }];
  return subject.sentences.map((s) => ({ itemId: s.itemId, answer: s.answer }));
}

/**
 * Whether the submission is worth a call, from the subject alone. An `error_correction`
 * answer is never blank — the given sentence is there to quote even untouched — so a set
 * nobody edited is the one that counts as empty.
 */
export function unaskable(subject: EngineSubject): UnaskableReason | null {
  if (!subject.ai.on) return 'ai_off';
  if (subjectAspects(subject).length === 0) return 'no_checks';
  switch (subject.template) {
    case 'translate':
      return subject.sentences.every((s) => s.answer.trim() === '') ? 'empty_answer' : null;
    case 'error_correction':
      return subject.sentences.every((s) => s.answer === s.given) ? 'empty_answer' : null;
    case 'writing_task':
      return subject.text.trim() === '' ? 'empty_answer' : null;
  }
}

/**
 * The prompt's input from a submission as exercise-engine reads it — one shape for the
 * teacher's queue (1.3) and for a candidate's run over the set (1.6), so a model is
 * measured on exactly what it would be asked in the queue. The school's explanation
 * language, when known, is what the remarks are written in.
 */
export function toReviewSubject(subject: EngineSubject, schoolLanguage: string | null): ReviewSubject {
  const aspects = subjectAspects(subject);
  if (subject.template === 'translate') {
    return { template: 'translate', input: toTranslateInput(subject, aspects, commentLanguage(schoolLanguage, subject.langs.explain)) };
  }
  if (subject.template === 'writing_task') {
    return { template: 'writing_task', input: toWritingTaskInput(subject, aspects, schoolLanguage) };
  }
  const target = languageName(subject.targetLanguage);
  return {
    template: 'error_correction',
    input: {
      targetLanguage: target,
      // The template carries no explanation language: without the school's, the language learnt.
      commentLanguage: commentLanguage(schoolLanguage, target),
      note: subject.note,
      aspects,
      sentences: subject.sentences.map((s) => ({
        itemId: s.itemId,
        given: s.given,
        refs: s.refs,
        answer: s.answer,
        matchesKey: s.matchesKey,
        mistakes: s.mistakes,
        stray: s.stray,
        ...(s.teacherNote ? { teacherNote: s.teacherNote } : {}),
      })),
    },
  };
}

function toTranslateInput(subject: TranslateSubject, aspects: ReviewAspect[], language: string): TranslateReviewInput {
  return {
    langs: subject.langs,
    commentLanguage: language,
    aspects,
    sentences: subject.sentences.map((s) => ({
      itemId: s.itemId,
      direction: s.direction,
      source: s.source,
      refs: s.refs,
      answer: s.answer,
      ...(s.explanation ? { explanation: s.explanation } : {}),
      ...(s.teacherNote ? { teacherNote: s.teacherNote } : {}),
    })),
  };
}

function toWritingTaskInput(subject: WritingTaskSubject, aspects: ReviewAspect[], schoolLanguage: string | null): WritingTaskReviewInput {
  const target = languageName(subject.targetLanguage);
  return {
    targetLanguage: target,
    // The template carries no explanation language: without the school's, the language learnt.
    commentLanguage: commentLanguage(schoolLanguage, target),
    mode: subject.mode,
    instruction: subject.instruction,
    prompt: subject.prompt,
    source: subject.source,
    letter: subject.letter,
    imageCaption: subject.imageCaption,
    points: subject.points,
    example: subject.example,
    length: subject.length,
    aspects,
    sentences: [{ itemId: ESSAY_ITEM_ID, answer: subject.text }],
  };
}
