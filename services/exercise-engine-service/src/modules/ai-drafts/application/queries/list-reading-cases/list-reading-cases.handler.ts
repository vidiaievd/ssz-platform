import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  checkReading,
  fromPersisted,
  readingPassPercent,
  readSubmission,
  TEMPLATE_CODE as READ_ALOUD,
} from '@ssz/shared-kernel/read-aloud';
import {
  CONTENT_CLIENT,
  type IContentClient,
} from '../../../../../shared/application/ports/content-client.port.js';
import { Result } from '../../../../../shared/kernel/result.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../../attempts/domain/repositories/attempt.repository.js';
import { ListReadingCasesQuery } from './list-reading-cases.query.js';

/** One prompt a teacher ruled on by ear: the passage, the take they heard, their word on it. */
export interface ReadingCasePrompt {
  itemId: string;
  /** The passage as the exercise holds it today — what the speech model is given as reference. */
  text: string;
  /** The take the teacher heard, by media id; ai-service fetches its `speech` variant. */
  assetId: string;
  seconds: number;
  /** The teacher's verdict on this prompt: the label a machine's check is measured against. */
  approved: boolean;
}

/**
 * One reading a teacher decided, as labelled data (plan 82, step 10, Q5). No person in it,
 * and none of the teacher's words — only which prompts they let pass. `caseId` is the attempt.
 */
export interface ReadingCase {
  caseId: string;
  decidedAt: string;
  /** The language learnt (`nb`) — the recognizer's language and the check's number words. */
  targetLanguage: string;
  /** The exercise's mark today (`review.readingPassPercent`) — what the check would rule by. */
  passPercent: number;
  /** In the exercise's order. */
  prompts: ReadingCasePrompt[];
}

/** Why a decided reading is not in the set. */
export type ReadingCaseSkip =
  /** The verdict carries no decisions: nothing to measure a check against. */
  | 'NO_DECISIONS'
  /** The exercise was deleted: there is no passage to check against. */
  | 'EXERCISE_GONE'
  /** A `monologue` or `dialogue`: there is no passage to read (Q7). */
  | 'NOT_READ_MODE'
  /** No prompt of this try left: all carried from a returned try, undecided, or with no passage. */
  | 'NO_PROMPTS';

export interface ReadingCasesResult {
  cases: ReadingCase[];
  /** Decided readings left out, by reason; zero counts are omitted. */
  skipped: Partial<Record<ReadingCaseSkip, number>>;
}

export type ListReadingCasesError = { code: 'CONTENT_UNAVAILABLE' };

/**
 * Readings aloud teachers ruled on, prompt by prompt, as the set a speech model is run over in
 * the shadow (plan 82, step 10, Q5): ai-service hears every take, this service checks what was
 * heard (`POST internal/reading-checks`), and the machine's pass or fail is compared with the
 * teacher's on each prompt.
 *
 * Unlike the drafts' set it does not start from a model's draft: the gate is opened before any
 * model reads a school's work, so every teacher's verdict on a `read` reading is a case. The
 * author's AI switch is not asked either — the run is what decides whether to offer it.
 *
 * Only this try's own prompts count: a carried one keeps an earlier ruling (plan 70, phase 11b)
 * and is not a judgement of the take it points to. The passage and mark are read as they are
 * today, as in the drafts' set; an exercise read is shared by every case of it.
 */
@QueryHandler(ListReadingCasesQuery)
export class ListReadingCasesHandler implements IQueryHandler<ListReadingCasesQuery> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(CONTENT_CLIENT) private readonly content: IContentClient,
  ) {}

  async execute(query: ListReadingCasesQuery): Promise<Result<ReadingCasesResult, ListReadingCasesError>> {
    const decided = await this.attempts.findTeacherReviewed(READ_ALOUD, query.limit);
    const cases: ReadingCase[] = [];
    const skipped: ReadingCasesResult['skipped'] = {};
    const skip = (reason: ReadingCaseSkip) => {
      skipped[reason] = (skipped[reason] ?? 0) + 1;
    };
    const exercises = new Map<string, Promise<Awaited<ReturnType<IContentClient['getExerciseForAttempt']>>>>();

    for (const attempt of decided) {
      const decisions = new Map((attempt.reviewDecisions ?? []).map((d) => [d.itemId, d.approved]));
      if (decisions.size === 0 || !attempt.reviewedAt) {
        skip('NO_DECISIONS');
        continue;
      }

      const key = `${attempt.exerciseId}:${attempt.targetLanguage}`;
      if (!exercises.has(key)) {
        exercises.set(key, this.content.getExerciseForAttempt(attempt.exerciseId, attempt.targetLanguage, 'PRACTICE'));
      }
      const exercise = await exercises.get(key)!;
      if (exercise.isFail) {
        if (exercise.error.statusCode === 404) {
          skip('EXERCISE_GONE');
          continue;
        }
        return Result.fail({ code: 'CONTENT_UNAVAILABLE' });
      }

      const document = fromPersisted(exercise.value.exercise.content, exercise.value.exercise.expectedAnswers);
      if (document.mode !== 'read') {
        skip('NOT_READ_MODE');
        continue;
      }

      const recordings = new Map((readSubmission(attempt.submittedAnswer)?.recordings ?? []).map((r) => [r.itemId, r]));
      const prompts: ReadingCasePrompt[] = [];
      for (const prompt of document.prompts) {
        const recording = recordings.get(prompt.id);
        const approved = decisions.get(prompt.id);
        if (!recording || recording.carried || approved === undefined) continue;
        // A passage with no word in it gives the check nothing to count.
        if (checkReading(prompt.text, '', attempt.targetLanguage, []).total === 0) continue;
        prompts.push({ itemId: prompt.id, text: prompt.text, assetId: recording.assetId, seconds: recording.seconds, approved });
      }
      if (prompts.length === 0) {
        skip('NO_PROMPTS');
        continue;
      }

      cases.push({
        caseId: attempt.id,
        decidedAt: attempt.reviewedAt.toISOString(),
        targetLanguage: attempt.targetLanguage,
        passPercent: readingPassPercent(document),
        prompts,
      });
    }

    return Result.ok({ cases, skipped });
  }
}
