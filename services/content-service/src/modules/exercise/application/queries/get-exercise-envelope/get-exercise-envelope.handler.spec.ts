import { GetExerciseEnvelopeHandler } from './get-exercise-envelope.handler.js';
import { GetExerciseEnvelopeQuery } from './get-exercise-envelope.query.js';
import { ExerciseEntity } from '../../../domain/entities/exercise.entity.js';
import { DifficultyLevel } from '../../../../container/domain/value-objects/difficulty-level.vo.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IExerciseTemplateRepository } from '../../../../exercise-template/domain/repositories/exercise-template.repository.interface.js';
import type { ExerciseTemplateEntity } from '../../../../exercise-template/domain/entities/exercise-template.entity.js';
import type { IExerciseAxes } from '../../../../../shared/skills/domain/exercise-axes.port.js';

const AT = new Date('2026-09-01T10:00:00.000Z');

const LISTENING = {
  skills: ['listening'],
  focus: [],
  form: 'free',
  skillSource: 'placement',
  focusSource: 'unknown',
};

function build(axes: unknown) {
  const exercise = ExerciseEntity.reconstitute('ex-1', {
    exerciseTemplateId: 'template-1',
    templateCode: 'short_answer',
    targetLanguage: 'nb',
    difficultyLevel: DifficultyLevel.B1,
    content: { prompt: 'Hva sa hun?' },
    expectedAnswers: { accepted: ['ja'] },
    answerCheckSettings: null,
    ownerUserId: 'user-1',
    ownerSchoolId: null,
    visibility: Visibility.PUBLIC,
    estimatedDurationSeconds: null,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    draft: null,
    skillOverride: null,
    instructions: [],
  });

  const repo = { findById: () => Promise.resolve(exercise) } as unknown as IExerciseRepository;
  const templates = {
    findById: () =>
      Promise.resolve({
        code: 'short_answer',
        contentSchema: {},
        answerSchema: {},
        defaultCheckSettings: {},
        supportedLanguages: null,
      } as unknown as ExerciseTemplateEntity),
  } as unknown as IExerciseTemplateRepository;

  return new GetExerciseEnvelopeHandler(repo, templates, {
    forExercise: () => Promise.resolve(axes),
  } as unknown as IExerciseAxes);
}

describe('GetExerciseEnvelopeHandler axes', () => {
  it('carries what the exercise trains, not what its template would suggest', async () => {
    // The engine snapshots the axes onto the attempt from this one call. A short_answer
    // standing as the comprehension stage of an audio lesson is listening, and nothing
    // inside its document would ever say so — only the placement does.
    const handler = build(LISTENING);

    const result = await handler.execute(new GetExerciseEnvelopeQuery('ex-1', 'ru', 'graded'));

    expect(result.isOk).toBe(true);
    expect(result.value.axes.skills).toEqual(['listening']);
    expect(result.value.axes.skillSource).toBe('placement');
  });

  it('degrades to empty axes rather than failing the attempt', async () => {
    // The exercise was read a moment earlier, so a miss here means it was deleted mid
    // flight. Losing one attempt's telemetry beats refusing to start the attempt.
    const handler = build(null);

    const result = await handler.execute(new GetExerciseEnvelopeQuery('ex-1', 'ru', 'graded'));

    expect(result.value.axes.skills).toEqual([]);
    expect(result.value.axes.skillSource).toBe('unknown');
  });
});
