import { SetListeningStagesHandler } from './set-listening-stages.handler.js';
import { SetListeningStagesCommand } from './set-listening-stages.command.js';
import { LessonDomainError } from '../../../domain/exceptions/lesson-domain.exceptions.js';
import { LessonEntity } from '../../../domain/entities/lesson.entity.js';
import { LessonContentVariantEntity } from '../../../domain/entities/lesson-content-variant.entity.js';
import { LessonKind } from '../../../domain/value-objects/lesson-kind.vo.js';
import { ListeningStageType } from '../../../domain/value-objects/listening-stage-type.vo.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import type { ILessonRepository } from '../../../domain/repositories/lesson.repository.interface.js';
import type { ILessonContentVariantRepository } from '../../../domain/repositories/lesson-content-variant.repository.interface.js';
import type { ILessonListeningStageRepository } from '../../../domain/repositories/lesson-listening-stage.repository.interface.js';
import type { IExerciseRepository } from '../../../../exercise/domain/repositories/exercise.repository.interface.js';

const OWNER_ID = 'owner-1';
const EXERCISE_ID = 'exercise-1';

function makeLesson(kind: LessonKind): LessonEntity {
  const result = LessonEntity.create({
    targetLanguage: 'no',
    difficultyLevel: DifficultyLevel.A1,
    title: 'Listening practice',
    ownerUserId: OWNER_ID,
    visibility: Visibility.PUBLIC,
    kind,
  });
  if (result.isFail) throw new Error('unexpected failure building test fixture');
  return result.value;
}

function makeVariant(lessonId: string): LessonContentVariantEntity {
  const result = LessonContentVariantEntity.create({
    lessonId,
    explanationLanguage: 'en',
    minLevel: DifficultyLevel.A1,
    maxLevel: DifficultyLevel.A2,
    displayTitle: 'Listening — EN',
    bodyMarkdown: 'audio lesson body',
    createdByUserId: OWNER_ID,
  });
  if (result.isFail) throw new Error('unexpected failure building test fixture');
  return result.value;
}

function makeHandler(overrides: {
  lesson?: LessonEntity | null;
  variant?: LessonContentVariantEntity | null;
  exercise?: { deletedAt: Date | null } | null;
}) {
  const lessonRepo = {
    findById: jest.fn().mockResolvedValue(overrides.lesson ?? null),
  } as unknown as ILessonRepository;

  const variantRepo = {
    findById: jest.fn().mockResolvedValue(overrides.variant ?? null),
  } as unknown as ILessonContentVariantRepository;

  const stageRepo = {
    findByVariantId: jest.fn(),
    replaceForVariant: jest.fn().mockResolvedValue(undefined),
  } as unknown as ILessonListeningStageRepository;

  const exerciseRepo = {
    findById: jest
      .fn()
      .mockResolvedValue(
        overrides.exercise === undefined ? { deletedAt: null } : overrides.exercise,
      ),
  } as unknown as IExerciseRepository;

  return {
    handler: new SetListeningStagesHandler(lessonRepo, variantRepo, stageRepo, exerciseRepo),
    stageRepo,
  };
}

describe('SetListeningStagesHandler', () => {
  it('replaces staged exercises for an AUDIO-kind lesson variant', async () => {
    const lesson = makeLesson(LessonKind.AUDIO);
    const variant = makeVariant(lesson.id);
    const { handler, stageRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(
      new SetListeningStagesCommand(OWNER_ID, variant.id, [
        { exerciseId: EXERCISE_ID, position: 0, stageType: ListeningStageType.GAP_FILL },
        { exerciseId: EXERCISE_ID, position: 1, stageType: ListeningStageType.COMPREHENSION },
      ]),
    );

    expect(result.isOk).toBe(true);
    expect(stageRepo.replaceForVariant).toHaveBeenCalledTimes(1);
    expect(stageRepo.replaceForVariant).toHaveBeenCalledWith(
      variant.id,
      expect.arrayContaining([
        expect.objectContaining({ position: 0, stageType: ListeningStageType.GAP_FILL }),
        expect.objectContaining({ position: 1, stageType: ListeningStageType.COMPREHENSION }),
      ]),
    );
  });

  it('replaces with an empty list, clearing all staged exercises', async () => {
    const lesson = makeLesson(LessonKind.AUDIO);
    const variant = makeVariant(lesson.id);
    const { handler, stageRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(new SetListeningStagesCommand(OWNER_ID, variant.id, []));

    expect(result.isOk).toBe(true);
    expect(stageRepo.replaceForVariant).toHaveBeenCalledWith(variant.id, []);
  });

  it('rejects when the variant belongs to a non-AUDIO lesson', async () => {
    const lesson = makeLesson(LessonKind.TEXT);
    const variant = makeVariant(lesson.id);
    const { handler, stageRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(
      new SetListeningStagesCommand(OWNER_ID, variant.id, [
        { exerciseId: EXERCISE_ID, position: 0, stageType: ListeningStageType.GAP_FILL },
      ]),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.LESSON_KIND_MISMATCH);
    expect(stageRepo.replaceForVariant).not.toHaveBeenCalled();
  });

  it('rejects duplicate positions within the same request', async () => {
    const lesson = makeLesson(LessonKind.AUDIO);
    const variant = makeVariant(lesson.id);
    const { handler, stageRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(
      new SetListeningStagesCommand(OWNER_ID, variant.id, [
        { exerciseId: EXERCISE_ID, position: 0, stageType: ListeningStageType.GAP_FILL },
        { exerciseId: EXERCISE_ID, position: 0, stageType: ListeningStageType.COMPREHENSION },
      ]),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.DUPLICATE_STAGE_POSITION);
    expect(stageRepo.replaceForVariant).not.toHaveBeenCalled();
  });

  it('rejects when a staged exercise does not exist', async () => {
    const lesson = makeLesson(LessonKind.AUDIO);
    const variant = makeVariant(lesson.id);
    const { handler, stageRepo } = makeHandler({ lesson, variant, exercise: null });

    const result = await handler.execute(
      new SetListeningStagesCommand(OWNER_ID, variant.id, [
        { exerciseId: 'missing-exercise', position: 0, stageType: ListeningStageType.GAP_FILL },
      ]),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.EXERCISE_NOT_FOUND);
    expect(stageRepo.replaceForVariant).not.toHaveBeenCalled();
  });

  it('rejects when a staged exercise is soft-deleted', async () => {
    const lesson = makeLesson(LessonKind.AUDIO);
    const variant = makeVariant(lesson.id);
    const { handler, stageRepo } = makeHandler({
      lesson,
      variant,
      exercise: { deletedAt: new Date() },
    });

    const result = await handler.execute(
      new SetListeningStagesCommand(OWNER_ID, variant.id, [
        { exerciseId: EXERCISE_ID, position: 0, stageType: ListeningStageType.GAP_FILL },
      ]),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.EXERCISE_NOT_FOUND);
    expect(stageRepo.replaceForVariant).not.toHaveBeenCalled();
  });

  it('rejects when the variant does not exist', async () => {
    const { handler, stageRepo } = makeHandler({ variant: null });

    const result = await handler.execute(
      new SetListeningStagesCommand(OWNER_ID, 'missing-variant', []),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.VARIANT_NOT_FOUND);
    expect(stageRepo.replaceForVariant).not.toHaveBeenCalled();
  });

  it('rejects when the caller does not own the lesson', async () => {
    const lesson = makeLesson(LessonKind.AUDIO);
    const variant = makeVariant(lesson.id);
    const { handler, stageRepo } = makeHandler({ lesson, variant });

    const result = await handler.execute(
      new SetListeningStagesCommand('someone-else', variant.id, []),
    );

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(LessonDomainError.INSUFFICIENT_PERMISSIONS);
    expect(stageRepo.replaceForVariant).not.toHaveBeenCalled();
  });
});
