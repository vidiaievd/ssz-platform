import { commentLanguage, languageName } from '../domain/comment-language.js';
import { enabledAspects, errorCorrectionAspects, type ReviewAspect } from '../domain/review-aspect.js';
import type { TranslateReviewInput } from '../domain/translate-review.js';
import type { ReviewSubject } from '../prompts/prompts.js';
import type { EngineSubject, TranslateSubject } from './ports/review-attempts.client.js';

/** Why a submission is not asked of a model at all — the same in the queue and in a run over the set. */
export type UnaskableReason = 'ai_off' | 'no_checks' | 'empty_answer';

/** The aspects the author's AI block allows, read by the template's own switches. */
export function subjectAspects(subject: EngineSubject): ReviewAspect[] {
  return subject.template === 'translate' ? enabledAspects(subject.ai.checks) : errorCorrectionAspects(subject.ai.checks);
}

/**
 * Whether the submission is worth a call, from the subject alone. An `error_correction`
 * answer is never blank — the given sentence is there to quote even untouched — so a set
 * nobody edited is the one that counts as empty.
 */
export function unaskable(subject: EngineSubject): UnaskableReason | null {
  if (!subject.ai.on) return 'ai_off';
  if (subjectAspects(subject).length === 0) return 'no_checks';
  if (subject.template === 'translate') {
    if (subject.sentences.every((s) => s.answer.trim() === '')) return 'empty_answer';
  } else if (subject.sentences.every((s) => s.answer === s.given)) {
    return 'empty_answer';
  }
  return null;
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
