import {
  authoredItems,
  expandRef,
  fromPersisted,
  judge,
  readEdits,
  route,
  type SpanOutcome,
  type SpanType,
} from '@ssz/shared-kernel/error-correction';

/** One mistake the engine derived from the faulty sentence, and what the learner did to it. */
export interface ErrorCorrectionSubjectMistake {
  /** The faulty words as given; empty when a word is missing. */
  wrong: string;
  /** What the key has instead; empty when the words are superfluous. */
  fix: string;
  type: SpanType;
  state: SpanOutcome;
  /** What the learner's edits made of these words. */
  submitted: string;
  /** The author's explanation of the mistake. */
  note?: string;
}

/** One sentence of an `error_correction` submission as a reviewer sees it. */
export interface ErrorCorrectionSubjectSentence {
  itemId: string;
  /** The faulty sentence the learner was asked to repair. */
  given: string;
  /** The key and the other accepted sentences, inline `(a|b)` alternatives unexpanded. */
  refs: string[];
  /** The sentence the learner's edits produced. */
  answer: string;
  /** The auto-check closed it: identical to an accepted sentence. */
  matchesKey: boolean;
  mistakes: ErrorCorrectionSubjectMistake[];
  /** Words the learner changed or inserted where there was no mistake. */
  stray: string[];
  teacherNote?: string;
}

/** What ai-service reviews an `error_correction` submission from (plan 79, step 1.7). */
export interface ErrorCorrectionSubject {
  template: 'error_correction';
  /** The language learnt, as the attempt records it (`nb`). The template carries no labels. */
  targetLanguage: string;
  /** The author's context line, shown to the learner under the instruction. */
  note: string;
  ai: { on: boolean; checks: { explainWhy: boolean; altFixes: boolean; register: boolean } };
  sentences: ErrorCorrectionSubjectSentence[];
}

/**
 * The submission read through the template's own engine — the same `judge` the runner and
 * the teacher's card run — so the reviewer is told which mistakes the learner reached rather
 * than having to recompute it from two sentences.
 */
export function errorCorrectionSubject(
  content: unknown,
  expectedAnswers: unknown,
  submittedAnswer: unknown,
  targetLanguage: string,
): ErrorCorrectionSubject {
  const document = fromPersisted(
    // The envelope is the exercise row's business; the review needs none of it.
    { id: '', moduleId: '', title: '', instructions: '', updatedAt: '' },
    content,
    expectedAnswers,
  );
  const edits = readSubmittedEdits(submittedAnswer);

  return {
    template: 'error_correction',
    targetLanguage,
    note: document.note,
    ai: { on: document.ai.on, checks: document.ai.checks },
    sentences: authoredItems(document).map((item) => {
      const judgement = judge(document.check, item, edits[item.id]);
      return {
        itemId: item.id,
        given: item.wrong,
        refs: [item.ref, ...item.alts].filter((ref) => ref.trim() !== '' && expandRef(ref).length > 0),
        answer: judgement.built,
        matchesKey: route(document.check, judgement) === 'pass',
        mistakes: judgement.spans.map((span) => ({
          wrong: span.wrong,
          fix: span.fix,
          type: span.type,
          state: span.state,
          submitted: span.localFix,
          ...(span.note.trim() ? { note: span.note } : {}),
        })),
        stray: judgement.stray.map((edit) => edit.word).filter((word) => word.trim() !== ''),
        ...(item.teacherNote?.trim() ? { teacherNote: item.teacherNote } : {}),
      };
    }),
  };
}

/** `{ items: { [itemId]: edits } }`, as the validator reads it; anything else is no edits at all. */
function readSubmittedEdits(submitted: unknown): Record<string, ReturnType<typeof readEdits>> {
  const items =
    typeof submitted === 'object' && submitted !== null ? (submitted as { items?: unknown }).items : undefined;
  if (typeof items !== 'object' || items === null || Array.isArray(items)) return {};
  return Object.fromEntries(Object.entries(items).map(([id, raw]) => [id, readEdits(raw)]));
}
