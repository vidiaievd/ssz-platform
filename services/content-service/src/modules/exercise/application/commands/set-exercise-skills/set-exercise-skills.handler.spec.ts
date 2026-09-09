import { SetExerciseSkillsHandler } from './set-exercise-skills.handler.js';
import { SetExerciseSkillsCommand } from './set-exercise-skills.command.js';
import { ExerciseEntity } from '../../../domain/entities/exercise.entity.js';
import { ExerciseDomainError } from '../../../domain/exceptions/exercise-domain.exceptions.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IAuditLog } from '../../../../../shared/application/ports/audit-log.port.js';
import type { IExerciseAxes } from '../../../../../shared/skills/domain/exercise-axes.port.js';

const AT = new Date('2026-09-01T10:00:00.000Z');

function makeExercise(): ExerciseEntity {
  return ExerciseEntity.reconstitute('ex-1', {
    exerciseTemplateId: 'template-1',
    templateCode: 'short_answer',
    targetLanguage: 'nb',
    difficultyLevel: DifficultyLevel.B1,
    content: {},
    expectedAnswers: {},
    answerCheckSettings: null,
    ownerUserId: 'user-1',
    ownerSchoolId: null,
    visibility: Visibility.PUBLIC,
    estimatedDurationSeconds: null,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    draft: null,
    skillOverride: {
      skills: ['listening'],
      focus: ['pragmatics'],
      setAt: AT,
    },
    instructions: null,
  });
}

/**
 * The axes service answers off the saved row, so the double reads whatever the entity
 * carried at save time — which is the whole behaviour under test: withdrawing an
 * override has to come back as the derivation, not as the emptiness that was stored.
 */
function build(exercise: ExerciseEntity) {
  const saved: ExerciseEntity[] = [];
  const repo = {
    findById: () => Promise.resolve(exercise),
    save: (entity: ExerciseEntity) => {
      saved.push(entity);
      return Promise.resolve(entity);
    },
  } as unknown as IExerciseRepository;

  const record = jest.fn(() => Promise.resolve());
  const audit = { record } as unknown as IAuditLog;

  const axes = {
    forExercise: () =>
      Promise.resolve(
        exercise.skillOverride === null
          ? {
              skills: ['written'],
              focus: [],
              form: 'free',
              skillSource: 'template',
              focusSource: 'unknown',
            }
          : {
              skills: exercise.skillOverride.skills,
              focus: exercise.skillOverride.focus,
              form: 'free',
              skillSource: 'override',
              focusSource: 'override',
            },
      ),
  } as unknown as IExerciseAxes;

  return { handler: new SetExerciseSkillsHandler(repo, audit, axes), saved, record };
}

describe('SetExerciseSkillsHandler', () => {
  it('answers a withdrawal with the derivation rather than with emptiness', async () => {
    const exercise = makeExercise();
    const { handler, saved } = build(exercise);

    const result = await handler.execute(new SetExerciseSkillsCommand('user-1', 'ex-1', null));

    expect(result.isOk).toBe(true);
    expect(result.value.skills).toEqual(['written']);
    expect(result.value.skillSource).toBe('template');
    expect(saved[0]?.skillOverride).toBeNull();
  });

  it("stores the author's word and answers with it", async () => {
    const exercise = makeExercise();
    const { handler, saved } = build(exercise);

    const result = await handler.execute(
      new SetExerciseSkillsCommand('user-1', 'ex-1', { skills: ['reading'], focus: ['grammar'] }),
    );

    expect(result.value.skills).toEqual(['reading']);
    expect(result.value.skillSource).toBe('override');
    expect(saved[0]?.skillOverride?.skills).toEqual(['reading']);
  });

  it('records who changed the axes', async () => {
    const exercise = makeExercise();
    const { handler, record } = build(exercise);

    await handler.execute(new SetExerciseSkillsCommand('user-7', 'ex-1', null));

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'ex-1', actorUserId: 'user-7', action: 'updated' }),
    );
  });

  it('refuses an exercise that is not there', async () => {
    const repo = { findById: () => Promise.resolve(null) } as unknown as IExerciseRepository;
    const handler = new SetExerciseSkillsHandler(
      repo,
      { record: jest.fn() } as unknown as IAuditLog,
      {} as unknown as IExerciseAxes,
    );

    const result = await handler.execute(new SetExerciseSkillsCommand('user-1', 'gone', null));

    expect(result.isFail).toBe(true);
    expect(result.error).toBe(ExerciseDomainError.EXERCISE_NOT_FOUND);
  });
});
