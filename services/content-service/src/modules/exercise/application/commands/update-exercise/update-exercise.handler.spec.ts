import { UpdateExerciseHandler, isModifiedElsewhere } from './update-exercise.handler.js';
import { UpdateExerciseCommand } from './update-exercise.command.js';
import { ExerciseEntity } from '../../../domain/entities/exercise.entity.js';
import { ExerciseDomainError } from '../../../domain/exceptions/exercise-domain.exceptions.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IExerciseTemplateRepository } from '../../../../exercise-template/domain/repositories/exercise-template.repository.interface.js';

const EXERCISE_ID = 'exercise-1';
const USER_ID = 'user-1';
const STORED_AT = new Date('2026-08-05T10:00:00.000Z');
const SAVED_AT = new Date('2026-08-05T10:05:00.000Z');

function makeExercise(updatedAt = STORED_AT): ExerciseEntity {
  return ExerciseEntity.reconstitute(EXERCISE_ID, {
    exerciseTemplateId: 'template-1',
    templateCode: 'word_bank_gap_fill',
    targetLanguage: 'nb',
    difficultyLevel: DifficultyLevel.B1,
    content: { sentences: [] },
    expectedAnswers: { feedback: {} },
    answerCheckSettings: null,
    ownerUserId: USER_ID,
    ownerSchoolId: null,
    visibility: Visibility.PUBLIC,
    estimatedDurationSeconds: 60,
    createdAt: STORED_AT,
    updatedAt,
    deletedAt: null,
    instructions: null,
  });
}

function makeHandler(exercise: ExerciseEntity | null = makeExercise()) {
  const saved: ExerciseEntity[] = [];

  const exerciseRepo = {
    findById: () => Promise.resolve(exercise),
    save: (entity: ExerciseEntity) => {
      saved.push(entity);
      // Mirrors Prisma's `@updatedAt`: the stored value is the row's, not the
      // entity's, which is why the handler returns what `save` gives back.
      return Promise.resolve(makeExercise(SAVED_AT));
    },
  } as unknown as IExerciseRepository;

  const templateRepo = {
    findById: () => Promise.resolve(null),
  } as unknown as IExerciseTemplateRepository;

  return { handler: new UpdateExerciseHandler(exerciseRepo, templateRepo), saved };
}

function command(expectedUpdatedAt?: string): UpdateExerciseCommand {
  return new UpdateExerciseCommand(
    USER_ID,
    EXERCISE_ID,
    DifficultyLevel.B2,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    expectedUpdatedAt,
  );
}

describe('UpdateExerciseHandler — optimistic concurrency', () => {
  it('writes unconditionally when no token is given, as every caller did before', async () => {
    const { handler, saved } = makeHandler();

    const result = await handler.execute(command());

    expect(result.isOk).toBe(true);
    expect(saved).toHaveLength(1);
  });

  it('returns the stored updatedAt so the next write can carry it', async () => {
    const { handler } = makeHandler();

    const result = await handler.execute(command(STORED_AT.toISOString()));

    expect(result.isOk).toBe(true);
    expect(result.value.updatedAt).toEqual(SAVED_AT);
  });

  it('refuses a write behind the row, and says what it is behind', async () => {
    const { handler, saved } = makeHandler();

    const result = await handler.execute(command('2026-08-05T09:59:00.000Z'));

    expect(result.isFail).toBe(true);
    const error = result.error;
    expect(isModifiedElsewhere(error)).toBe(true);
    if (isModifiedElsewhere(error)) {
      expect(error.code).toBe(ExerciseDomainError.EXERCISE_MODIFIED_ELSEWHERE);
      expect(error.currentUpdatedAt).toEqual(STORED_AT);
    }
    // Nothing was written: the author's text is still theirs to resolve.
    expect(saved).toHaveLength(0);
  });

  it('accepts a token that is the same instant written differently', async () => {
    const { handler } = makeHandler();

    const result = await handler.execute(command('2026-08-05T12:00:00.000+02:00'));

    expect(result.isOk).toBe(true);
  });

  it('reports a missing exercise as before, token or not', async () => {
    const { handler } = makeHandler(null);

    const result = await handler.execute(command(STORED_AT.toISOString()));

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(ExerciseDomainError.EXERCISE_NOT_FOUND);
  });
});
