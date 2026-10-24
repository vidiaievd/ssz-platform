import type { EngineSubject } from '../../review-draft/application/ports/review-attempts.client.js';
import { toReviewSubject } from '../../review-draft/application/review-input.js';
import type { ReviewSubject } from '../../review-draft/prompts/prompts.js';

/**
 * The prompt's input for a learner's own review: the draft's input, with one difference. An
 * essay is marked by the rubric frozen on the attempt whenever there is one — the engine
 * scores it by these marks as it would a teacher's — while the draft asks for marks only when
 * the author's `draft` switch is on. `language` is what the remarks are written in, when known.
 */
export function toDirectSubject(subject: EngineSubject, language: string | null): ReviewSubject {
  const prepared = toReviewSubject(subject, language);
  if (prepared.template !== 'writing_task' || subject.template !== 'writing_task') return prepared;
  const rubric = subject.rubric && subject.rubric.length > 0 ? subject.rubric : null;
  return { template: 'writing_task', input: { ...prepared.input, rubric } };
}
