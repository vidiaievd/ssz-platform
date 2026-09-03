import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import {
  fromPersisted,
  grade,
  isShortAnswerDocument,
  TEMPLATE_CODE as SHORT_ANSWER,
  toStudentResult,
  usableElements,
} from '@ssz/shared-kernel/short-answer';
import type { StudentResult } from '@ssz/shared-kernel/short-answer';
import {
  answerableQuestions,
  fromPersisted as mcFromPersisted,
  isMultipleChoiceDocument,
  judge,
  TEMPLATE_CODE as MULTIPLE_CHOICE,
} from '@ssz/shared-kernel/multiple-choice';
import type { AnswerVerdict } from '@ssz/shared-kernel/multiple-choice';
import { AnswerQuestionCommand } from './answer-question.command.js';
import {
  ATTEMPT_REPOSITORY,
  type IAttemptRepository,
} from '../../../domain/repositories/attempt.repository.js';
import type { Attempt } from '../../../domain/entities/attempt.entity.js';
import {
  CONTENT_CLIENT,
  type IContentClient,
  ContentClientError,
} from '../../../../../shared/application/ports/content-client.port.js';
import { seedFrom } from '../../../../../shared/application/services/multiple-choice-attempt.js';
import { Result } from '../../../../../shared/kernel/result.js';
import type { AttemptDomainError } from '../../../domain/exceptions/attempt.errors.js';
import { audioTranscriptFor, type AudioTranscript } from '../../services/audio-transcript.js';

export type AnswerQuestionError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  | { code: 'FORBIDDEN' }
  | { code: 'UNSUPPORTED_TEMPLATE' }
  | { code: 'QUESTION_NOT_FOUND' }
  /** `multiple_choice`: this question is right, revealed, or out of attempts. */
  | { code: 'QUESTION_CLOSED' }
  | { code: 'EMPTY_ANSWER' }
  | ContentClientError
  | AttemptDomainError;

export interface AnswerQuestionResult {
  attemptId: string;
  /**
   * Which shape `result` came back in. The two templates that answer a set piece by piece
   * hand back different verdicts — a coverage breakdown and a pick verdict have nothing
   * in common — and the client is told which it got rather than left to sniff for fields.
   */
  templateCode: string;
  /** How many of the set have been handed in, including this one. */
  answered: number;
  /** How many there are to answer. */
  total: number;
  /** The verdict and everything the student is allowed to see behind it. */
  result: StudentResult | AnswerVerdict;
  /** Whether this answer is on its way to a teacher, for the routing line. */
  routedForReview: boolean;
  /**
   * What the clip said, once the set is finished (plan 56 §3.3).
   *
   * Absent until the last question is answered, and absent altogether unless the teacher
   * set the transcript to show after the answer: one clip covers the whole set, so
   * handing it over after the first of five questions would answer the other four.
   */
  audioTranscript?: AudioTranscript;
}

/**
 * Hand in one question of a set.
 *
 * The design is a question at a time: the student answers, is told what the answer was
 * worth, and moves on. IMPLEMENTATION.md proposes `POST /attempts/:id/answers` for
 * `short_answer` and `POST /attempts` for `multiple_choice`. What neither can propose,
 * because they do not know this platform, is that an attempt here is the unit of
 * everything else — progress, spaced repetition, the review queue, the locks, the
 * notifications are all built on "one attempt, one submission, one thing a teacher marks"
 * (plans 43-47).
 *
 * So the attempt stays one attempt and the answers arrive one at a time onto it. This is
 * a command on an existing attempt, modelled on `self-check` and pointedly not one: a
 * self-check is rationed, records nothing and can be asked again, while this is written
 * down and the domain — not the runner's disabled button — decides whether it may be
 * asked again.
 *
 * Grading happens here, on the server, and for both templates it has to. `short_answer`'s
 * anchor phrases are the answer written in the words the student is being asked to find.
 * `multiple_choice`'s key is only an id, but the whole mechanism around it — the retry,
 * the 50/50, the rule shown when the question closes — is dosing: it is meaningful
 * exactly as long as the browser does not know which option is right, and a client-side
 * judge gives that away with the first response (plan 53 §3.2).
 *
 * Closing the attempt is still `submit`, with every answer in one aggregate, and it
 * regrades all of them from scratch. Nothing decided here is trusted there: a verdict
 * that reached the client is a verdict a client could send back.
 *
 * Generalised rather than duplicated (plan 53 §3.3). The two templates share the loading,
 * the ownership check, the fetch of the key and the write-back, and differ in the payload,
 * the judge and the verdict — so the shared work is written once here and the two judges
 * are two private methods below.
 */
@CommandHandler(AnswerQuestionCommand)
export class AnswerQuestionHandler implements ICommandHandler<AnswerQuestionCommand> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
  ) {}

  async execute(
    command: AnswerQuestionCommand,
  ): Promise<Result<AnswerQuestionResult, AnswerQuestionError>> {
    const attempt = await this.attempts.findById(command.attemptId);
    if (!attempt) {
      return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });
    }
    if (attempt.userId !== command.userId) {
      return Result.fail({ code: 'FORBIDDEN' });
    }
    // Everything that can be refused without the key is refused here, before the
    // round-trip. A client bug should cost neither a call to content-service nor a
    // question the student can never revisit.
    //
    // The payload has to be the one this template is answered with: a pick sent to a
    // short-answer set would otherwise be graded as an empty text and written down as a
    // `fail`.
    if (attempt.templateCode === SHORT_ANSWER) {
      if (command.payload.kind !== 'text') return Result.fail({ code: 'UNSUPPORTED_TEMPLATE' });
      // `Lever svaret` is disabled on an empty field; an empty answer handed in anyway is
      // a client bug rather than a lost question.
      if (command.payload.text.trim() === '') return Result.fail({ code: 'EMPTY_ANSWER' });
    } else if (attempt.templateCode === MULTIPLE_CHOICE) {
      if (command.payload.kind !== 'option') return Result.fail({ code: 'UNSUPPORTED_TEMPLATE' });
      const { optionId, reveal } = command.payload;
      // A pick with no option is only meaningful as «Vis svaret», which says so.
      if (!reveal && (optionId === null || optionId === '')) {
        return Result.fail({ code: 'EMPTY_ANSWER' });
      }
      // Checked here as well as in the domain, so that a replayed request never reaches
      // `judge` — a second call would compute a verdict, and the key rides on it.
      const state = attempt.pickedOptions.find((q) => q.questionId === command.questionId);
      if (state?.closed === true) return Result.fail({ code: 'QUESTION_CLOSED' });
    } else {
      return Result.fail({ code: 'UNSUPPORTED_TEMPLATE' });
    }

    // PRACTICE rather than the attempt's own mode: the key is needed here whatever the
    // attempt ships to the client, and only the projection of the result goes back.
    const defResult = await this.contentClient.getExerciseForAttempt(
      attempt.exerciseId,
      attempt.targetLanguage,
      'PRACTICE',
    );
    if (defResult.isFail) {
      return Result.fail(defResult.error);
    }

    const { content, expectedAnswers } = defResult.value.exercise;

    return command.payload.kind === 'text'
      ? this.answerShortAnswer(attempt, command.questionId, command.payload.text, {
          content,
          expectedAnswers,
        })
      : this.pickOption(
          attempt,
          command.questionId,
          command.payload.optionId,
          command.payload.reveal,
          { content, expectedAnswers },
        );
  }

  /**
   * `short_answer`: an open question, matched against the semantic elements of the key.
   *
   * Unchanged from plan 51 but for its new place. The answer is final — the domain refuses
   * a second one — and what comes back is the kernel's own student projection of the
   * result: the element labels with a hit flag, never the phrase that matched, and the
   * model answer only when `showModel` allows it.
   */
  private async answerShortAnswer(
    attempt: Attempt,
    questionId: string,
    text: string,
    exercise: { content: unknown; expectedAnswers: unknown },
  ): Promise<Result<AnswerQuestionResult, AnswerQuestionError>> {
    // A document of the old form has one question and no ids to hand in against; it is
    // answered by submitting, as it always was (plan 51 §8 Q1).
    if (!isShortAnswerDocument(exercise.content)) {
      return Result.fail({ code: 'UNSUPPORTED_TEMPLATE' });
    }

    const document = fromPersisted(exercise.content, exercise.expectedAnswers);
    const question = document.questions.find((q) => q.id === questionId);
    // Also the case where the question exists but has no usable key. Answering it would
    // record a `fail` against a question that could never have been passed, and the
    // publish preflight already refuses to ship one.
    if (!question || usableElements(question).length === 0) {
      return Result.fail({ code: 'QUESTION_NOT_FOUND' });
    }

    const result = grade(question, text, document.settings);

    const answered = attempt.answerQuestion({
      questionId,
      text,
      verdict: result.verdict,
    });
    if (answered.isFail) {
      return Result.fail(answered.error as AttemptDomainError);
    }

    await this.attempts.save(attempt);

    const settings = projectedSettings(document.settings);
    // Questions with no usable key are not answerable and are not counted, so the
    // `n/total` the student sees matches the set they are actually walking through.
    const total = document.questions.filter((q) => usableElements(q).length > 0).length;

    return Result.ok<AnswerQuestionResult, AnswerQuestionError>({
      attemptId: attempt.id,
      templateCode: SHORT_ANSWER,
      answered: attempt.answeredQuestions.length,
      total,
      result: toStudentResult(
        {
          questionId,
          verdict: result.verdict,
          covered: result.covered,
          total: result.total,
          tooShort: result.tooShort,
          hits: result.hits,
          why: question.why,
          model: question.model,
        },
        settings,
      ),
      routedForReview:
        document.settings.teacherReview === 'all' ||
        (document.settings.teacherReview === 'flagged' && result.verdict !== 'pass'),
      audioTranscript: audioTranscriptFor(
        exercise.content,
        attempt.answeredQuestions.length >= total,
      ),
    });
  }

  /**
   * `multiple_choice`: one pick, judged against a key the browser never sees.
   *
   * The judging is the kernel's and the dosing is the point of it: `keyOptionId` and the
   * rule behind it come back **only once the question closes** — right, revealed, or out
   * of attempts — because a key handed over on a wrong pick with a try left makes the
   * retry and the 50/50 into theatre (IMPLEMENTATION.md, "Grading payload").
   *
   * Which attempt this is comes from the attempt, never from the request: it decides the
   * score, since only a first-attempt hit counts. The dimmed set comes from there too, and
   * is carried back in so a second 50/50 narrows what is left rather than dealing again.
   */
  private async pickOption(
    attempt: Attempt,
    questionId: string,
    optionId: string | null,
    reveal: boolean,
    exercise: { content: unknown; expectedAnswers: unknown },
  ): Promise<Result<AnswerQuestionResult, AnswerQuestionError>> {
    // A document of the old form is one question with no ids to hand in against; it is
    // answered by submitting, as it always was (plan 53 §8 Q2).
    if (!isMultipleChoiceDocument(exercise.content)) {
      return Result.fail({ code: 'UNSUPPORTED_TEMPLATE' });
    }

    const document = mcFromPersisted(exercise.content, exercise.expectedAnswers);
    const answerable = answerableQuestions(document);
    const question = answerable.find((q) => q.id === questionId);
    // Also covers a question with no key marked: picking at it would record a wrong
    // answer against a question no pick could have got right, and the publish preflight
    // already refuses to ship one.
    if (!question) {
      return Result.fail({ code: 'QUESTION_NOT_FOUND' });
    }

    const state = attempt.pickedOptions.find((q) => q.questionId === questionId);

    // A reveal does not spend a try: the counter the student sees stands still while the
    // answer is shown to them, exactly as it does for a revealed sentence.
    const attemptNo = (state?.picks.length ?? 0) + (reveal ? 0 : 1);
    // The option to judge on a reveal is the one they last picked — there is a rebuttal
    // owed for it, and the alternative is judging a pick that was never made.
    const picked = reveal ? (state?.picks[state.picks.length - 1] ?? '') : (optionId ?? '');

    const verdict = judge({
      question,
      settings: document.settings,
      optionId: picked,
      attempt: Math.max(1, attemptNo),
      reveal,
      eliminated: state?.eliminated ?? [],
      // Seeded by the attempt and the question rather than left to chance: a reload must
      // dim the same distractor, or the hint is a second hint.
      seed: seedFrom(attempt.id, questionId, String(attemptNo)),
    });

    const recorded = attempt.pickOption({
      questionId,
      optionId: reveal ? null : optionId,
      correct: verdict.correct,
      closed: verdict.closed,
      revealed: reveal,
      eliminated: verdict.eliminated,
    });
    if (recorded.isFail) {
      return Result.fail(recorded.error as AttemptDomainError);
    }

    await this.attempts.save(attempt);

    return Result.ok<AnswerQuestionResult, AnswerQuestionError>({
      attemptId: attempt.id,
      templateCode: MULTIPLE_CHOICE,
      // Questions the student is done with, not questions they have touched: a wrong pick
      // with a try left is not progress through the set, and a progress bar that said it
      // was would run ahead of the runner.
      answered: attempt.pickedOptions.filter((q) => q.closed).length,
      total: answerable.length,
      result: verdict,
      // Never. The verdict is an id comparison, and «the server counts» is not the same
      // thing as «a person marks» (plan 53 §3.10).
      routedForReview: false,
      audioTranscript: audioTranscriptFor(
        exercise.content,
        attempt.pickedOptions.filter((q) => q.closed).length >= answerable.length,
      ),
    });
  }
}

/**
 * The settings the `short_answer` result projection reads, lifted off the document.
 *
 * Only `showBreakdown` and `showModel` change what comes back; the rest are carried
 * because the projection's own contract asks for them, and naming them here rather than
 * spreading the document keeps the AI switches from arriving in a payload by accident.
 */
function projectedSettings(settings: ReturnType<typeof fromPersisted>['settings']) {
  return {
    passRule: settings.passRule,
    passN: settings.passN,
    minWords: settings.minWords,
    showBreakdown: settings.showBreakdown,
    showModel: settings.showModel,
    aiStage: settings.aiStage,
    aiGrammar: settings.aiGrammar,
    teacherReview: settings.teacherReview,
    progress: settings.progress,
  };
}
