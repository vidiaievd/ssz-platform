import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import {
  deliverableRows,
  fieldsFor,
  fromPersisted,
  grade,
  isSentenceSchemaDocument,
  revealRow,
  TEMPLATE_CODE as SENTENCE_SCHEMA,
  toStudentResult,
} from '@ssz/shared-kernel/sentence-schema';
import type { StudentResult } from '@ssz/shared-kernel/sentence-schema';
import { CheckRowCommand } from './check-row.command.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../domain/repositories/attempt.repository.js';
import {
  CONTENT_CLIENT,
  type IContentClient,
  ContentClientError,
} from '../../../../../shared/application/ports/content-client.port.js';
import { Result } from '../../../../../shared/kernel/result.js';
import type { AttemptDomainError } from '../../../domain/exceptions/attempt.errors.js';

export type CheckRowError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  | { code: 'FORBIDDEN' }
  | { code: 'UNSUPPORTED_TEMPLATE' }
  | { code: 'ROW_NOT_FOUND' }
  | { code: 'NOTHING_PLACED' }
  | ContentClientError
  | AttemptDomainError;
import { audioTranscriptFor, type AudioTranscript } from '../../services/audio-transcript.js';

export interface CheckRowResult {
  attemptId: string;
  /** Sentences closed — solved or revealed — including this one. */
  closed: number;
  /** Sentences in the set. */
  total: number;
  /** The marks, and the answer only once the sentence is closed. */
  result: StudentResult;
  /** What the clip said, once every sentence is closed (plan 56 §3.3). */
  audioTranscript?: AudioTranscript;
}

/**
 * Check one sentence of a `sentence_schema` set, or ask to be shown it.
 *
 * Grading happens here, on the server, and it has to: `chunk.field` is the answer, and the
 * student's payload never held it (plan 52 §3.2). What comes back is the kernel's own
 * result projection — the marks, the resolved feedback note, and the sentence itself only
 * once it is closed.
 *
 * The design is unlimited retries: `Sjekk`, then `Rett opp (N)` with the correct pieces
 * kept, then `Sjekk` again, with the counter reading `Forsøk N`. So unlike
 * `answer-question`, being wrong here decides nothing and is not refused a second time.
 * What is refused is checking a sentence that is already closed, and that refusal lives in
 * the domain rather than in the runner's disabled button: `Vis riktig skjema` puts the
 * answer on the board, so a revealed sentence checked again would be the answer handed
 * straight back.
 *
 * IMPLEMENTATION.md proposes `POST /attempts` per sentence for this. What it cannot
 * propose, because it does not know this platform, is that an attempt here is the unit of
 * everything else — progress, spaced repetition, the review queue, the notifications are
 * all built on "one attempt, one submission" (plans 43-47). So the attempt stays one
 * attempt and the sentences are checked on it, as plan 51 §3.3 already settled for
 * `short_answer`.
 *
 * Closing the attempt is still `submit`, with every board in one aggregate, and it
 * regrades all of them. Nothing decided here is trusted there — except which sentences
 * were revealed, which is a fact about what happened and is read off the attempt.
 */
@CommandHandler(CheckRowCommand)
export class CheckRowHandler implements ICommandHandler<CheckRowCommand> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
  ) {}

  async execute(command: CheckRowCommand): Promise<Result<CheckRowResult, CheckRowError>> {
    const attempt = await this.attempts.findById(command.attemptId);
    if (!attempt) {
      return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });
    }
    if (attempt.userId !== command.userId) {
      return Result.fail({ code: 'FORBIDDEN' });
    }
    if (attempt.templateCode !== SENTENCE_SCHEMA) {
      return Result.fail({ code: 'UNSUPPORTED_TEMPLATE' });
    }
    // `Sjekk` is disabled on an empty board, and an empty one checked anyway would spend
    // an attempt on nothing. A reveal is allowed from an empty board — giving up before
    // placing anything is a legitimate move.
    if (!command.reveal && Object.values(command.placement).every((items) => items.length === 0)) {
      return Result.fail({ code: 'NOTHING_PLACED' });
    }

    // PRACTICE rather than the attempt's own mode: the key is needed here whatever the
    // attempt shipped to the client, and only the projection of the result goes back.
    const defResult = await this.contentClient.getExerciseForAttempt(
      attempt.exerciseId,
      attempt.targetLanguage,
      'PRACTICE',
    );
    if (defResult.isFail) {
      return Result.fail(defResult.error);
    }

    const { content, expectedAnswers } = defResult.value.exercise;
    // A document that is not a set has no sentence ids to check against — a leftover from
    // before the rewrite (plan 52 §8 Q7). Refused rather than read as an empty set, which
    // would answer "no such sentence" about every sentence it has.
    if (!isSentenceSchemaDocument(content)) {
      return Result.fail({ code: 'UNSUPPORTED_TEMPLATE' });
    }

    const document = fromPersisted(content, expectedAnswers);
    const rows = deliverableRows(document);
    // Also the case where the sentence exists but the author has left a word out of the
    // schema since: it has no key, the projection never shipped it, and grading it would
    // invent a verdict.
    const row = rows.find((r) => r.id === command.rowId);
    if (!row) {
      return Result.fail({ code: 'ROW_NOT_FOUND' });
    }

    const fields = fieldsFor(document, row);
    const previous = attempt.checkedRows.find((r) => r.rowId === command.rowId);
    const attemptNo = (previous?.attempts ?? 0) + (command.reveal ? 0 : 1);

    const { placement, result } = command.reveal
      ? revealRow(row, fields, document.settings, attemptNo)
      : {
          placement: command.placement,
          result: toStudentResult({
            row,
            fields,
            marks: grade(row, fields, command.placement, document.settings),
            settings: document.settings,
            attempt: attemptNo,
            revealed: false,
          }),
        };

    const checked = attempt.checkRow({
      rowId: command.rowId,
      placement,
      solved: result.solved,
      revealed: command.reveal,
    });
    if (checked.isFail) {
      return Result.fail(checked.error as AttemptDomainError);
    }

    await this.attempts.save(attempt);

    return Result.ok<CheckRowResult, CheckRowError>({
      attemptId: attempt.id,
      closed: attempt.checkedRows.filter((r) => r.solved || r.revealed).length,
      // The sentences the student was given — the deliverable ones, which is what the
      // projection shipped — so the `n/total` on screen matches the set they are walking
      // through.
      total: rows.length,
      result,
      audioTranscript: audioTranscriptFor(
        content,
        attempt.checkedRows.filter((r) => r.solved || r.revealed).length >= rows.length,
      ),
    });
  }
}
