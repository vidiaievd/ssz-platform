import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetCourseDictionaryQuery } from './get-course-dictionary.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ExerciseDomainError } from '../../../domain/exceptions/exercise-domain.exceptions.js';
import { EXERCISE_REPOSITORY } from '../../../domain/repositories/exercise.repository.interface.js';
import type { IExerciseRepository } from '../../../domain/repositories/exercise.repository.interface.js';
import { COURSE_DICTIONARY_READER } from '../../../domain/repositories/course-dictionary.reader.interface.js';
import type {
  CourseDictionaryEntry,
  ICourseDictionaryReader,
} from '../../../domain/repositories/course-dictionary.reader.interface.js';

/**
 * The words an inflection table can be built over — plan 69 §3.8, DECISIONS §3: «the course
 * dictionary (filtered to the paradigm's part of speech, showing unit provenance)».
 *
 * Read for the builder's picker. The server returns entries as stored; turning an entry into a row
 * — the article from `gender`, the forms from `grammaticalProperties` — is the kernel's
 * `fromDictionary`, one function for the builder and its tests. Searching is the client's: a course
 * dictionary is hundreds of words, not thousands.
 *
 * An exercise that stands in no course gets an empty list, not an error: the picker says so, and
 * the author types the lemmas.
 */
@QueryHandler(GetCourseDictionaryQuery)
export class GetCourseDictionaryHandler implements IQueryHandler<
  GetCourseDictionaryQuery,
  Result<CourseDictionaryEntry[], ExerciseDomainError>
> {
  constructor(
    @Inject(EXERCISE_REPOSITORY)
    private readonly exerciseRepo: IExerciseRepository,
    @Inject(COURSE_DICTIONARY_READER)
    private readonly reader: ICourseDictionaryReader,
  ) {}

  async execute(
    query: GetCourseDictionaryQuery,
  ): Promise<Result<CourseDictionaryEntry[], ExerciseDomainError>> {
    const exercise = await this.exerciseRepo.findById(query.exerciseId);
    if (!exercise || exercise.deletedAt !== null) {
      return Result.fail(ExerciseDomainError.EXERCISE_NOT_FOUND);
    }

    const entries = await this.reader.forExercise(query.exerciseId, {
      pos: query.pos,
      glossLanguage: query.glossLanguage,
    });
    return Result.ok(entries);
  }
}
