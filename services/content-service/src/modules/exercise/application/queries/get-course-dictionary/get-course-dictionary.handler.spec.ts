import { GetCourseDictionaryHandler } from './get-course-dictionary.handler.js';
import { GetCourseDictionaryQuery } from './get-course-dictionary.query.js';
import { ExerciseDomainError } from '../../../domain/exceptions/exercise-domain.exceptions.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';
import type { ICourseDictionaryReader } from '../../../domain/repositories/course-dictionary.reader.interface.js';

function handler(exercise: { deletedAt: Date | null } | null) {
  const reader = { forExercise: jest.fn().mockResolvedValue([{ id: 'w1', word: 'bok' }]) };
  const repo = { findById: jest.fn().mockResolvedValue(exercise) };
  return {
    reader,
    handler: new GetCourseDictionaryHandler(
      repo as unknown as IExerciseRepository,
      reader as unknown as ICourseDictionaryReader,
    ),
  };
}

describe('GetCourseDictionaryHandler', () => {
  it('reads the dictionary with the part of speech and the gloss language it was asked for', async () => {
    const { handler: h, reader } = handler({ deletedAt: null });
    const result = await h.execute(new GetCourseDictionaryQuery('ex-1', 'NOUN', 'uk'));
    expect(result.isOk).toBe(true);
    expect(result.value).toEqual([{ id: 'w1', word: 'bok' }]);
    expect(reader.forExercise).toHaveBeenCalledWith('ex-1', { pos: 'NOUN', glossLanguage: 'uk' });
  });

  it('refuses a missing or deleted exercise without reading', async () => {
    for (const exercise of [null, { deletedAt: new Date() }]) {
      const { handler: h, reader } = handler(exercise);
      const result = await h.execute(new GetCourseDictionaryQuery('ex-1'));
      expect(result.isFail).toBe(true);
      expect(result.error).toBe(ExerciseDomainError.EXERCISE_NOT_FOUND);
      expect(reader.forExercise).not.toHaveBeenCalled();
    }
  });
});
