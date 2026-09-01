import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import type { DerivedProfile } from '@ssz/shared-kernel/skills';
import { GetExerciseEnvelopeQuery } from './get-exercise-envelope.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ExerciseDomainError } from '../../../domain/exceptions/exercise-domain.exceptions.js';
import { EXERCISE_REPOSITORY } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';
import { EXERCISE_TEMPLATE_REPOSITORY } from '../../../../exercise-template/domain/repositories/exercise-template.repository.interface.js';
import type { IExerciseTemplateRepository } from '../../../../exercise-template/domain/repositories/exercise-template.repository.interface.js';
import { studentSafeContent } from '../../../domain/services/student-safe-content.js';
import { EXERCISE_AXES } from '../../../../../shared/skills/domain/exercise-axes.port.js';
import type { IExerciseAxes } from '../../../../../shared/skills/domain/exercise-axes.port.js';

export interface ExerciseEnvelope {
  exercise: {
    id: string;
    templateCode: string;
    targetLanguage: string;
    difficultyLevel: string;
    content: Record<string, unknown>;
    // null when query.mode === 'graded' — withheld so the client can't read it.
    expectedAnswers: Record<string, unknown> | null;
    answerCheckSettings: Record<string, unknown> | null;
  };
  template: {
    code: string;
    contentSchema: unknown;
    answerSchema: unknown;
    defaultCheckSettings: Record<string, unknown> | null;
    supportedLanguages: string[] | null;
  };
  instruction: {
    language: string;
    text: string;
    hint: string | null;
    overrides: Record<string, unknown> | null;
  } | null;
  /**
   * What this exercise trains — plan 55 §3.6.
   *
   * Carried here rather than fetched separately because the engine already makes this
   * call at the start of every attempt, and the axes have to be snapshotted onto the
   * attempt at the same instant `practicedAtoms` is: an exercise that is moved out of a
   * listening lesson next week must not retroactively change what last week's attempt
   * says it exercised.
   *
   * Always the live document's axes. The engine grades against what the learner was
   * served, so the unreleased edit is not this call's business.
   */
  axes: DerivedProfile;
}

@QueryHandler(GetExerciseEnvelopeQuery)
export class GetExerciseEnvelopeHandler implements IQueryHandler<
  GetExerciseEnvelopeQuery,
  Result<ExerciseEnvelope, ExerciseDomainError>
> {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly exerciseRepo: IExerciseRepository,
    @Inject(EXERCISE_TEMPLATE_REPOSITORY)
    private readonly templateRepo: IExerciseTemplateRepository,
    @Inject(EXERCISE_AXES)
    private readonly axes: IExerciseAxes,
  ) {}

  async execute(
    query: GetExerciseEnvelopeQuery,
  ): Promise<Result<ExerciseEnvelope, ExerciseDomainError>> {
    const exercise = await this.exerciseRepo.findById(query.exerciseId, true);
    if (!exercise || exercise.deletedAt !== null) {
      return Result.fail(ExerciseDomainError.EXERCISE_NOT_FOUND);
    }

    const template = await this.templateRepo.findById(exercise.exerciseTemplateId);
    if (!template) {
      return Result.fail(ExerciseDomainError.EXERCISE_NOT_FOUND);
    }

    // The exercise was found a moment ago, so this cannot miss; the fallback exists so
    // that a race with a delete degrades to empty axes rather than to a failed attempt.
    const axes = (await this.axes.forExercise(query.exerciseId)) ?? {
      skills: [],
      focus: [],
      form: 'unknown' as const,
      skillSource: 'unknown' as const,
      focusSource: 'unknown' as const,
    };

    const instructions = exercise.instructions ?? [];
    const picked =
      instructions.find((i) => i.instructionLanguage === query.preferredInstructionLanguage) ??
      instructions.find((i) => i.instructionLanguage === 'en') ??
      instructions[0] ??
      null;

    return Result.ok({
      exercise: {
        id: exercise.id,
        templateCode: exercise.templateCode,
        targetLanguage: exercise.targetLanguage,
        difficultyLevel: exercise.difficultyLevel,
        // `graded` is the learner's envelope: the engine will do the grading, so
        // the client gets neither the expected answers nor — for the template
        // that keeps its answers inside the sentences — the raw content.
        content:
          query.mode === 'graded'
            ? studentSafeContent(exercise.templateCode, exercise.content, exercise.expectedAnswers)
            : exercise.content,
        expectedAnswers: query.mode === 'graded' ? null : exercise.expectedAnswers,
        answerCheckSettings: exercise.answerCheckSettings,
      },
      template: {
        code: template.code,
        contentSchema: template.contentSchema,
        answerSchema: template.answerSchema,
        defaultCheckSettings: template.defaultCheckSettings,
        supportedLanguages: template.supportedLanguages,
      },
      axes,
      instruction: picked
        ? {
            language: picked.instructionLanguage,
            text: picked.instructionText,
            hint: picked.hintText,
            overrides: picked.textOverrides,
          }
        : null,
    });
  }
}
