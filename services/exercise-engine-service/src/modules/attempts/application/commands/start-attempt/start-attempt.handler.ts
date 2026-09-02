import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import {
  readContent,
  toStudentProjection,
  TEMPLATE_CODE as WORD_BANK_GAP_FILL,
} from '@ssz/shared-kernel/wordbank-gapfill';
import {
  fromPersisted as ecFromPersisted,
  toStudentProjection as ecToStudentProjection,
  TEMPLATE_CODE as ERROR_CORRECTION,
} from '@ssz/shared-kernel/error-correction';
import {
  fromPersisted as trFromPersisted,
  isTranslateCode,
  toStudentProjection as trToStudentProjection,
} from '@ssz/shared-kernel/translate';
import {
  readContent as mpReadContent,
  toStudentProjection as mpToStudentProjection,
  TEMPLATE_CODE as MATCH_PAIRS,
} from '@ssz/shared-kernel/match-pairs';
import {
  TEMPLATE_CODE as WRITING_TASK,
  toStudentProjection as wtToStudentProjection,
} from '@ssz/shared-kernel/writing-task';
import {
  isShortAnswerDocument,
  TEMPLATE_CODE as SHORT_ANSWER,
  toStudentProjection as saToStudentProjection,
} from '@ssz/shared-kernel/short-answer';
import {
  isMultipleChoiceDocument,
  TEMPLATE_CODE as MULTIPLE_CHOICE,
  toStudentProjection as mcToStudentProjection,
} from '@ssz/shared-kernel/multiple-choice';
import {
  fromPersisted as ssFromPersisted,
  isSentenceSchemaDocument,
  TEMPLATE_CODE as SENTENCE_SCHEMA,
  toStudentProjection as ssToStudentProjection,
} from '@ssz/shared-kernel/sentence-schema';
import {
  isMultipleChoiceGroupDocument,
  shuffled as mcgShuffled,
  TEMPLATE_CODE as MULTIPLE_CHOICE_GROUP,
  toStudentProjection as mcgToStudentProjection,
} from '@ssz/shared-kernel/multiple-choice-group';
import { StartAttemptCommand } from './start-attempt.command.js';
import { Attempt } from '../../../domain/entities/attempt.entity.js';
import type { DifficultyLevel } from '../../../domain/entities/attempt.entity.js';
import { ATTEMPT_REPOSITORY, type IAttemptRepository } from '../../../domain/repositories/attempt.repository.js';
import {
  CONTENT_CLIENT,
  type ExerciseDefinition,
  type IContentClient,
  ContentClientError,
} from '../../../../../shared/application/ports/content-client.port.js';
import { EVENT_PUBLISHER, type IEventPublisher } from '../../../../../shared/application/ports/event-publisher.port.js';
import { ReviewContextResolver } from '../../services/review-context-resolver.js';
import { attemptShuffle, seedFrom } from '../../../../../shared/application/services/multiple-choice-attempt.js';
import { Result } from '../../../../../shared/kernel/result.js';
import type { ExercisePathSnapshot } from '../../../domain/entities/attempt.entity.js';

export type StartAttemptError =
  | ContentClientError
  | { code: 'ALREADY_IN_PROGRESS'; attemptId: string };

/** One sentence of a `sentence_schema` set already worked on in this attempt. */
export interface ResumedRow {
  rowId: string;
  attempts: number;
  placement: Record<string, string[]>;
  solved: boolean;
  revealed: boolean;
}

/** One question of a `short_answer` set already handed in on this attempt. */
export interface ResumedAnswer {
  questionId: string;
  text: string;
  verdict: 'pass' | 'partial' | 'fail';
}

/** One question of a `multiple_choice` set already picked at on this attempt. */
export interface ResumedPick {
  questionId: string;
  /** In order; `picks[0]` is the first try, the only one that scores. */
  picks: string[];
  /** The options a 50/50 has already dimmed. */
  eliminated: string[];
  correct: boolean;
  closed: boolean;
  revealed: boolean;
}

export interface StartAttemptResult {
  attemptId: string;
  templateCode: string;
  targetLanguage: string;
  difficultyLevel: string;
  checkMode: string;
  exerciseContent: unknown;
  // null when checkMode is GRADED.
  expectedAnswers: unknown;
  answerSchema: unknown;
  checkSettings: Record<string, unknown>;
  /**
   * What has already been handed in on this attempt, in the order it was handed in.
   *
   * Empty for a fresh attempt, and empty for every template but `short_answer` — it is
   * the only one that takes answers before the attempt closes. A caller resuming a set
   * reads it to know which question it is on; the verdicts are the ones the student was
   * already shown, and the texts are their own words.
   */
  answeredQuestions: ResumedAnswer[];
  /**
   * The sentences already worked on in this attempt, for `sentence_schema` and nothing
   * else.
   *
   * A caller resuming a set reads it to put the boards back and to know which sentences
   * are closed. `revealed` in particular cannot be recovered from anywhere else: the
   * student was shown that sentence, and reopening it on a reload would let a reveal be
   * replayed as a solve.
   */
  checkedRows: ResumedRow[];
  /**
   * The questions already picked at in this attempt, for `multiple_choice` and nothing
   * else.
   *
   * A caller resuming a set reads it to know which questions are finished and which
   * options are already dimmed. `picks` in particular cannot be recovered from anywhere
   * else, and it is the score: only a first-attempt hit counts, so a reload that started
   * every question over would hand out full marks for a second try.
   */
  pickedOptions: ResumedPick[];
}

/**
 * What the client may hold once the attempt starts.
 *
 * `checkMode: PRACTICE` normally means "ship the answers so the client can check
 * locally", and for eleven templates that is fine: their answers are a separate key,
 * and the content is just the question. `word_bank_gap_fill` stores each sentence
 * solved, so its content *is* the answer key — shipping it in PRACTICE would put every
 * answer in the browser at the moment the exercise opens, whatever the attempt's mode.
 *
 * `error_correction` is the second such template, for a subtler reason: its key is a
 * separate field, but the mistakes the student is hunting for are *derived* from it. A
 * browser holding the key holds the answer to "which words are wrong", which is the
 * whole exercise — so it gets counts and types instead, and never the words.
 *
 * The translate pair is the third, and the plainest of them: `expectedAnswers` there is a
 * list of accepted translations, which is the exercise typed out. The projection keeps the
 * sentence, the hint and the glosses, and drops the key, the guards (`require: ["har
 * bodd"]` hands over two words of it) and the author's explanations.
 *
 * `match_pairs` is the fifth, and stores its answers the way gap-fill does: a pair is
 * written once and whole, so `content.pairs[].right` is the answer to `left`. The
 * projection keeps the left halves as slots and the pool as anonymous items — answers
 * and distractors in the same shape, with no shared identifier between a slot and its
 * own half — and drops the pairing, the explanations and the reveal notes.
 *
 * `writing_task` is the sixth and the odd one out. Its content hides nothing — the key
 * is in its own column already — yet it is projected anyway, and the projection reaches
 * *into* the key rather than away from it. With `showRubric: 'always'` the rubric's
 * level descriptors are what the student is meant to write against, and they live in
 * `expected_answers`; with any other setting they must not arrive before the mark, and
 * neither must the example answer or the point keywords, ever. One setting decides, and
 * the kernel decides it (plan 50 §5).
 *
 * `short_answer` is the seventh, and the plainest case of all: its key is a set of
 * anchor phrases, which is the answer written in the words the student is being asked to
 * find. The projection keeps the prompt and — for `reading` only — the passage, and
 * drops the elements, the model answer and the explanation; `showModel: 'always'` is the
 * one setting that reaches back into the key, exactly as `showRubric` does above. It is
 * also the one template here with two live document shapes (plan 51 §8 Q1), so the shape
 * decides whether there is anything to project at all.
 *
 * `sentence_schema` is the eighth, and the one where the arrangement is as much of the
 * masking as the omission. Its key — the field each chunk belongs in, the fields that also
 * accept it, the rule and the per-chunk notes — is in its own column, and so is `row.text`,
 * the sentence in its correct order, which plan 52 §3.2 adds to the handoff's list. What
 * the student gets is the pieces, and they are *shuffled here*: a bank in sentence order
 * hands over the answer as surely as the key would. A document that is not a set is
 * handed on unprojected (plan 52 §8 Q7) — there is nothing in it to take away.
 *
 * `multiple_choice` is the ninth, and the one whose content column was built with nothing
 * in it to withhold: which option is right is neither a flag nor a position but a map in
 * `expected_answers`. What its projection does instead is drop the option rows the author
 * left blank and *deal the order* — and unlike every shuffle above, this one is seeded by
 * the attempt rather than by the CSPRNG, so that the order belongs to the attempt and a
 * reload does not re-deal the card the student is looking at (plan 53 §3.4, §8 Q7). The
 * order and the 50/50 are independent, incidentally: `eliminate` runs over the author's
 * own option list and is seeded by `(attempt, question, try)`, so it would survive a
 * re-deal — the reason for the per-attempt seed is what the student sees, not what the
 * judge computes. It has two live document shapes like `short_answer`, and one of them has
 * nothing to project.
 *
 * `multiple_choice_group` is the tenth, and the one that inverts the usual reason for
 * taking both columns. Nothing in its content has to be withheld — the column each
 * statement belongs in, the author's line and the quote that proves it are all in the key
 * column already. What the key column decides is which statements *exist*: a row reaches
 * the student only once it has text and a marked column, so a projection built from the
 * content alone could not tell a finished statement from a half-written one and would ship
 * both. It deals its row order from the attempt, exactly as `multiple_choice` deals its
 * options, and for the same reason; the answer columns never move.
 *
 * The masking rules are the kernel's, shared with content-service and the builders;
 * only the shuffle is local, because a shuffle cannot live in a module that must be pure.
 */
function withheldWhereNeeded(
  templateCode: string,
  exercise: { content: unknown; expectedAnswers: unknown },
  attemptId: string,
): { exerciseContent: unknown; expectedAnswers: unknown } {
  if (templateCode === WORD_BANK_GAP_FILL) {
    return {
      exerciseContent: toStudentProjection(readContent(exercise.content), { shuffle: shuffled }),
      expectedAnswers: null,
    };
  }

  if (templateCode === ERROR_CORRECTION) {
    // The projection needs the key in order to take it away — it counts the spans it
    // derives from it — so the document is assembled first and masked second.
    const document = ecFromPersisted(
      { id: '', moduleId: '', title: '', instructions: '', updatedAt: '' },
      exercise.content,
      exercise.expectedAnswers,
    );
    return { exerciseContent: ecToStudentProjection(document), expectedAnswers: null };
  }

  if (isTranslateCode(templateCode)) {
    const document = trFromPersisted(
      { id: '', moduleId: '', title: '', instructions: '', updatedAt: '' },
      templateCode,
      exercise.content,
      exercise.expectedAnswers,
    );
    return { exerciseContent: trToStudentProjection(document), expectedAnswers: null };
  }

  if (templateCode === MATCH_PAIRS) {
    return {
      // Both columns, deliberately: a document still in the pre-plan-49 shape kept its
      // pairing in `expected_answers`, and reading the content alone would fall back to
      // pairing by position. Five of the seeded exercises were written with the right
      // column deliberately out of order, so that fallback is a wrong answer key rather
      // than a near miss.
      exerciseContent: mpToStudentProjection(
        mpReadContent(exercise.content, exercise.expectedAnswers),
        { shuffle: shuffled },
      ),
      expectedAnswers: null,
    };
  }

  if (templateCode === SHORT_ANSWER) {
    // A document of the old form keeps nothing secret in its content — one question and
    // its context — and its key is what PRACTICE mode has always shipped. Projecting it
    // would find no `questions` and blank the exercise.
    if (!isShortAnswerDocument(exercise.content)) {
      return { exerciseContent: exercise.content, expectedAnswers: exercise.expectedAnswers };
    }

    // As for `writing_task` below: in `graded` mode content-service has already projected
    // this and answered with no key, and a second pass has nothing left to read the model
    // answer from. With no key in hand there is nothing left to withhold either.
    if (exercise.expectedAnswers === null || exercise.expectedAnswers === undefined) {
      return { exerciseContent: exercise.content, expectedAnswers: null };
    }

    return {
      exerciseContent: saToStudentProjection(exercise.content, exercise.expectedAnswers),
      expectedAnswers: null,
    };
  }

  if (templateCode === MULTIPLE_CHOICE) {
    // A document of the old form: one question, its options plain text, its key in the
    // other column — which is what PRACTICE mode has always shipped for it. Projecting it
    // would find no `questions` and blank the exercise.
    if (!isMultipleChoiceDocument(exercise.content)) {
      return { exerciseContent: exercise.content, expectedAnswers: exercise.expectedAnswers };
    }

    // A `graded` envelope content-service has already projected, reaching here only
    // because `documentToDealFrom` could not fetch the unprojected document. Handed on as
    // it stands: projecting a projection would deal the options a second time on top of an
    // order that is already arbitrary, and would still not be an order this attempt owns
    // (plan 53 §6.2). What the student loses is the per-attempt deal, not correctness —
    // the verdict and the 50/50 work in option ids.
    if (exercise.expectedAnswers === null || exercise.expectedAnswers === undefined) {
      return { exerciseContent: exercise.content, expectedAnswers: null };
    }

    return {
      exerciseContent: mcToStudentProjection(exercise.content, attemptShuffle(attemptId)),
      expectedAnswers: null,
    };
  }

  if (templateCode === SENTENCE_SCHEMA) {
    // Not a set at all — a document predating the rewrite (plan 52 §8 Q7). Handed on as
    // it stands: projecting it would find no `rows` and blank the exercise, which looks
    // like an exercise with nothing in it rather than one that needs rewriting.
    if (!isSentenceSchemaDocument(exercise.content)) {
      return { exerciseContent: exercise.content, expectedAnswers: exercise.expectedAnswers };
    }

    // As for `writing_task` below: in `graded` mode content-service has already projected
    // this and answered with no key. A second pass would read a projection — whose rows
    // carry a bank rather than chunks — as a set where nothing is placed, and hand back an
    // empty board. With no key in hand there is nothing left to withhold either.
    if (exercise.expectedAnswers === null || exercise.expectedAnswers === undefined) {
      return { exerciseContent: exercise.content, expectedAnswers: null };
    }

    return {
      exerciseContent: ssToStudentProjection(
        ssFromPersisted(exercise.content, exercise.expectedAnswers),
        shuffled,
      ),
      expectedAnswers: null,
    };
  }

  if (templateCode === MULTIPLE_CHOICE_GROUP) {
    // A document of the old form: `items[]` with their own options, its key in the other
    // column — which is what PRACTICE mode has always shipped for it. Projecting it would
    // find no `rows` and blank the exercise.
    if (!isMultipleChoiceGroupDocument(exercise.content)) {
      return { exerciseContent: exercise.content, expectedAnswers: exercise.expectedAnswers };
    }

    // A `graded` envelope content-service has already projected, reaching here only
    // because `documentToDealFrom` could not fetch the unprojected document. Handed on as
    // it stands: this projection needs the key column to know which statements are
    // finished, and a second pass over a projection has no key left to ask — it would
    // hand back an empty table rather than a smaller one.
    if (exercise.expectedAnswers === null || exercise.expectedAnswers === undefined) {
      return { exerciseContent: exercise.content, expectedAnswers: null };
    }

    return {
      // Both columns, and not for the reason `match_pairs` needs both: nothing in this
      // content column is a secret. The key column is what says whether a *row exists* —
      // a statement is shown only once the author has marked which column it belongs in —
      // so `content` alone cannot tell a finished statement from a half-written one, and a
      // call with no key returns an empty table rather than a leak (plan 54 §1, fact 2).
      //
      // The order is dealt here and seeded by the attempt, like `multiple_choice`'s and
      // for the same reason: in `graded` mode content-service deals with the CSPRNG and
      // then caches the envelope by `(exerciseId, language, mode)`, so the order would
      // belong to a Redis entry rather than to the attempt. Rows only — the columns are
      // the table's header and never move.
      exerciseContent: mcgToStudentProjection(
        exercise.content,
        exercise.expectedAnswers,
        <T,>(items: readonly T[]): T[] => mcgShuffled(items, seedFrom(attemptId)),
      ),
      expectedAnswers: null,
    };
  }

  if (templateCode === WRITING_TASK) {
    // In `graded` mode content-service has already projected this document and answered
    // with no key at all. Projecting a projection would then drop the one thing §5 is
    // about: a second pass has no answer column left to read the level descriptors from,
    // so a task with `showRubric: 'always'` would arrive without the rubric it is meant
    // to be written against. With no key in hand there is nothing left to withhold.
    if (exercise.expectedAnswers === null || exercise.expectedAnswers === undefined) {
      return { exerciseContent: exercise.content, expectedAnswers: null };
    }

    return {
      exerciseContent: wtToStudentProjection(exercise.content, exercise.expectedAnswers),
      expectedAnswers: null,
    };
  }

  return { exerciseContent: exercise.content, expectedAnswers: exercise.expectedAnswers };
}

/**
 * Fisher-Yates over a copy, seeded by the platform CSPRNG rather than Math.random.
 *
 * Unconstrained in its element type: each kernel names its own shape for a bank item — a
 * string here, `{ itemId, text }` there, `{ id, text }` in the third — and a union of them
 * all would need widening for every template that arrives next, while adding nothing this
 * function could get wrong.
 */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

@CommandHandler(StartAttemptCommand)
export class StartAttemptHandler implements ICommandHandler<StartAttemptCommand> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
    private readonly reviewContext: ReviewContextResolver,
    @Inject(EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
  ) {}

  async execute(
    command: StartAttemptCommand,
  ): Promise<Result<StartAttemptResult, StartAttemptError>> {
    const existing = await this.attempts.findInProgress(command.userId, command.exerciseId);

    /*
     * An open attempt that already holds answers is resumed rather than reported as a
     * conflict — the caller would otherwise abandon it and start again, which is right
     * for every template whose unfinished work only ever lived in the browser and wrong
     * for this one (plan 51 §8 Q6).
     *
     * A `short_answer` answer is handed in for good: it is graded on the server, written
     * onto the attempt, and refused a second time. Starting over would let a reload
     * re-play a question the domain says is closed, and would leave the answers already
     * in on a row nothing reads. So the attempt comes back as it stands, with what has
     * been answered on it.
     *
     * `sentence_schema` joins on the same reasoning and a sharper case (plan 52 §3.3).
     * Its sentences are not final — they may be checked as often as the student likes —
     * but one thing about them is: a sentence closed with `Vis riktig skjema` was shown
     * to the student, and it scores nothing. Starting over would erase that, and revealing
     * every sentence and then reloading would be the cheapest route to a full score.
     *
     * `multiple_choice` joins on the sharpest case of the three (plan 53 §3.3). Its
     * questions have an attempt budget, and which try a question was taken on is the
     * score — only a first-attempt hit counts. Starting over would hand a reload a fresh
     * first try at every question, which is a full score for anyone who reloads after a
     * miss. A revealed question would reopen the same way.
     *
     * Only an attempt with work on it takes this path. An empty one is still a conflict,
     * so the ten other templates keep the behaviour they were built on.
     */
    if (
      existing &&
      (existing.answeredQuestions.length > 0 ||
        existing.checkedRows.length > 0 ||
        existing.pickedOptions.length > 0)
    ) {
      const resumedDef = await this.contentClient.getExerciseForAttempt(
        command.exerciseId,
        command.language,
        existing.checkMode,
      );
      if (resumedDef.isFail) {
        return Result.fail<StartAttemptResult, StartAttemptError>(resumedDef.error);
      }

      const resumedSource = await this.documentToDealFrom(
        resumedDef.value,
        command.exerciseId,
        command.language,
        existing.checkMode,
      );

      return Result.ok<StartAttemptResult, StartAttemptError>({
        attemptId: existing.id,
        templateCode: existing.templateCode,
        targetLanguage: existing.targetLanguage,
        difficultyLevel: existing.difficultyLevel,
        checkMode: existing.checkMode,
        ...withheldWhereNeeded(existing.templateCode, resumedSource, existing.id),
        answerSchema: resumedDef.value.template.answerSchema,
        checkSettings: {
          ...(resumedDef.value.template.defaultCheckSettings ?? {}),
          ...(resumedDef.value.exercise.answerCheckSettings ?? {}),
        },
        answeredQuestions: existing.answeredQuestions.map(({ questionId, text, verdict }) => ({
          questionId,
          text,
          verdict,
        })),
        checkedRows: existing.checkedRows.map(
          ({ rowId, attempts, placement, solved, revealed }) => ({
            rowId,
            attempts,
            placement,
            solved,
            revealed,
          }),
        ),
        pickedOptions: existing.pickedOptions.map(
          ({ questionId, picks, eliminated, correct, closed, revealed }) => ({
            questionId,
            picks,
            eliminated,
            correct,
            closed,
            revealed,
          }),
        ),
      });
    }

    if (existing) {
      return Result.fail<StartAttemptResult, StartAttemptError>({
        code: 'ALREADY_IN_PROGRESS',
        attemptId: existing.id,
      });
    }

    const defResult = await this.contentClient.getExerciseForAttempt(
      command.exerciseId,
      command.language,
      command.checkMode,
    );
    if (defResult.isFail) {
      return Result.fail<StartAttemptResult, StartAttemptError>(defResult.error);
    }

    // Best-effort — a relation-graph hiccup must not block starting the attempt;
    // it only means this attempt won't feed the SRS fan-out on scoring.
    const atomsResult = await this.contentClient.getPracticedAtoms(command.exerciseId);
    const practicedAtoms = atomsResult.isOk ? atomsResult.value : [];

    const def = defResult.value;
    const attempt = Attempt.create({
      userId: command.userId,
      exerciseId: command.exerciseId,
      assignmentId: command.assignmentId,
      enrollmentId: command.enrollmentId,
      templateCode: def.exercise.templateCode,
      targetLanguage: def.exercise.targetLanguage,
      difficultyLevel: def.exercise.difficultyLevel as DifficultyLevel,
      checkMode: command.checkMode,
      practicedAtoms,
      // Off the envelope fetched a few lines above, not a second call: the axes and the
      // atoms have to describe the exercise as it stood at this instant (plan 55 §3.6).
      // An envelope without them — a Content Service that predates the axes — snapshots
      // nothing rather than blocking the attempt.
      axes: { skills: def.axes?.skills ?? [], focus: def.axes?.focus ?? [] },
    });

    attempt.snapshotReviewContext(
      await this.resolveReviewContext(command.userId, command.exerciseId),
    );

    await this.attempts.save(attempt);

    for (const event of attempt.getDomainEvents()) {
      await this.publisher.publish(event.eventType, event.payload);
    }
    attempt.clearDomainEvents();

    const checkSettings: Record<string, unknown> = {
      ...(def.template.defaultCheckSettings ?? {}),
      ...(def.exercise.answerCheckSettings ?? {}),
    };

    const source = await this.documentToDealFrom(
      def,
      command.exerciseId,
      command.language,
      attempt.checkMode,
    );

    return Result.ok<StartAttemptResult, StartAttemptError>({
      attemptId: attempt.id,
      templateCode: def.exercise.templateCode,
      targetLanguage: def.exercise.targetLanguage,
      difficultyLevel: def.exercise.difficultyLevel,
      checkMode: attempt.checkMode,
      ...withheldWhereNeeded(def.exercise.templateCode, source, attempt.id),
      answerSchema: def.template.answerSchema,
      checkSettings,
      answeredQuestions: [],
      checkedRows: [],
      pickedOptions: [],
    });
  }

  /**
   * The document `withheldWhereNeeded` deals `multiple_choice` from.
   *
   * This handler is the one place in the module that fetches the definition in the
   * attempt's own mode. `submit-answer`, `reveal-answers` and `answer-question` all ask
   * for `PRACTICE` whatever the attempt is, and say why: the server needs the real
   * document to work with, and only a projection of the result ever goes back. For eight
   * templates the difference does not show here — content-service's projection and the
   * engine's agree on what to take away.
   *
   * For `multiple_choice` it shows, because its projection does not only take away, it
   * **deals an order**. In `graded` mode that deal is made by content-service with a
   * CSPRNG and then cached by `(exerciseId, language, mode)` for the definition cache's
   * TTL, which is five minutes. So the order would belong to a Redis entry rather than to
   * the attempt: every student starting the same assignment inside that window would be
   * dealt the same one — in the mode where a shuffle exists precisely so that «I picked B»
   * means nothing — and an attempt living across the expiry would find its card re-dealt
   * under it, closed questions included (plan 53 §8 Q7).
   *
   * `multiple_choice_group` joins on exactly the same argument one template later: it
   * deals the *row* order rather than the option order, and a cached deal would give a
   * cohort the same shuffled table and re-deal it under an attempt that outlived the TTL.
   *
   * So for these templates, and only where the envelope has already been projected, the
   * document is fetched a second time as `PRACTICE` and dealt here, seeded by the attempt.
   * The key that arrives with it is read by the projection and does not leave: the
   * `multiple_choice` branch answers `expectedAnswers: null` on both paths. The extra
   * fetch is nearly always a cache hit, because `answer-question` fills that same entry on
   * every pick.
   *
   * A failed fetch is not an error. The already-projected envelope is still a playable
   * exercise; the attempt loses its own deal and nothing else, which is a worse card than
   * it should have rather than no card at all.
   */
  private async documentToDealFrom(
    definition: ExerciseDefinition,
    exerciseId: string,
    language: string,
    checkMode: string,
  ): Promise<ExerciseDefinition['exercise']> {
    const exercise = definition.exercise;
    if (checkMode === 'PRACTICE') return exercise;
    if (
      exercise.templateCode !== MULTIPLE_CHOICE &&
      exercise.templateCode !== MULTIPLE_CHOICE_GROUP
    ) {
      return exercise;
    }
    // The old forms travel unprojected in both modes — there is no deal to take back, and
    // their keys are what `PRACTICE` has always shipped for them.
    if (exercise.templateCode === MULTIPLE_CHOICE && !isMultipleChoiceDocument(exercise.content)) {
      return exercise;
    }
    if (
      exercise.templateCode === MULTIPLE_CHOICE_GROUP &&
      !isMultipleChoiceGroupDocument(exercise.content)
    ) {
      return exercise;
    }
    // A key in hand means this envelope was never projected, so it is already the
    // document. Only the projected one — answered with no key — needs fetching again.
    if (exercise.expectedAnswers !== null && exercise.expectedAnswers !== undefined) {
      return exercise;
    }

    const practice = await this.contentClient.getExerciseForAttempt(
      exerciseId,
      language,
      'PRACTICE',
    );
    return practice.isOk ? practice.value.exercise : exercise;
  }

  /**
   * The review context this attempt starts life with (plan 44 §44.4): where the
   * exercise sits and who the learner is to a teacher, plus — when this follows a
   * RETURNED verdict — the attempt it resubmits and which try it is.
   */
  private async resolveReviewContext(
    userId: string,
    exerciseId: string,
  ): Promise<{
    schoolId: string | null;
    containerId: string | null;
    groupId: string | null;
    exercisePath: ExercisePathSnapshot | null;
    previousAttemptId: string | null;
    revisionCount: number;
  }> {
    const context = await this.reviewContext.resolve(userId, exerciseId);
    const previous = await this.attempts.findLatestReturned(userId, exerciseId);

    return {
      ...context,
      previousAttemptId: previous?.id ?? null,
      revisionCount: previous ? previous.revisionCount + 1 : 0,
    };
  }
}
