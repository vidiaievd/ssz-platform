/**
 * Hand in one item of a set, on an attempt that stays open.
 *
 * One command for two templates, and generalised rather than duplicated (plan 53 §3.3).
 * What they share is everything around the judging: the attempt is the unit of progress,
 * of spaced repetition, of the review queue and of the locks, so a set is answered piece
 * by piece *onto one attempt* — and the loading, the ownership check, the fetch of the
 * key and the write-back are the same work whichever template asks for it.
 *
 * What differs is the payload and the verdict, and the payload is a union rather than a
 * widened shape: `short_answer` hands in what the student wrote, `multiple_choice` hands
 * in which option they picked — or nothing at all, when they asked to be shown the answer
 * instead of trying again.
 */
export type AnswerPayload =
  /** `short_answer`: a few words to three sentences. */
  | { kind: 'text'; text: string }
  /**
   * `multiple_choice`: the option picked. `reveal` closes the question and shows the key
   * instead of judging a pick, so it carries no option of its own.
   */
  | { kind: 'option'; optionId: string | null; reveal: boolean };

export class AnswerQuestionCommand {
  constructor(
    public readonly attemptId: string,
    public readonly userId: string,
    /** Which question of the set is being handed in. */
    public readonly questionId: string,
    public readonly payload: AnswerPayload,
  ) {}
}
