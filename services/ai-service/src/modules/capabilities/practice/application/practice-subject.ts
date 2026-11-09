import type { EngineSubject } from '../../review-draft/application/ports/review-attempts.client.js';
import { toReviewSubject, unaskable, type UnaskableReason } from '../../review-draft/application/review-input.js';
import type { ReviewSubject } from '../../review-draft/prompts/prompts.js';

/**
 * The prompt's input for a rehearsal: the draft's, read from the same subject the engine
 * builds for its queue, less what only a teacher acts on — `alternative` remarks and rubric
 * marks. `language` is what the hints are written in, when known.
 */
export function toPracticeSubject(subject: EngineSubject, language: string | null): ReviewSubject {
  const prepared = toReviewSubject(subject, language);
  const aspects = prepared.input.aspects.filter((aspect) => aspect !== 'alternative');
  if (prepared.template === 'writing_task') return { template: 'writing_task', input: { ...prepared.input, aspects, rubric: null } };
  return { ...prepared, input: { ...prepared.input, aspects } } as ReviewSubject;
}

/** Why work in progress is not worth a call: the draft's reasons, and no aspect left without `alternative`. */
export function practiceUnaskable(subject: EngineSubject): UnaskableReason | null {
  return unaskable(subject) ?? (toPracticeSubject(subject, null).input.aspects.length === 0 ? 'no_checks' : null);
}
