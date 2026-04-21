import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ExerciseDomainError } from '../../domain/exceptions/exercise-domain.exceptions.js';
import { ExerciseTemplateDomainError } from '../../../exercise-template/domain/exceptions/exercise-template-domain.exceptions.js';

type AnyExerciseError = ExerciseDomainError | ExerciseTemplateDomainError | string;

const NOT_FOUND: Set<AnyExerciseError> = new Set([
  ExerciseDomainError.EXERCISE_NOT_FOUND,
  ExerciseDomainError.INSTRUCTION_NOT_FOUND,
  ExerciseTemplateDomainError.TEMPLATE_NOT_FOUND,
]);

const GONE: Set<AnyExerciseError> = new Set([ExerciseDomainError.EXERCISE_ALREADY_DELETED]);

const CONFLICT: Set<AnyExerciseError> = new Set([
  ExerciseDomainError.DUPLICATE_INSTRUCTION_LANGUAGE,
]);

const UNPROCESSABLE: Set<AnyExerciseError> = new Set([
  ExerciseDomainError.INVALID_EXERCISE_CONTENT,
  ExerciseDomainError.INVALID_EXERCISE_ANSWERS,
  ExerciseDomainError.EXERCISE_HAS_PUBLISHED_CONTAINER_REFERENCES,
  ExerciseTemplateDomainError.TEMPLATE_NOT_ACTIVE,
  ExerciseTemplateDomainError.LANGUAGE_NOT_SUPPORTED_BY_TEMPLATE,
]);

export function throwHttpException(error: AnyExerciseError): never {
  if (NOT_FOUND.has(error)) throw new NotFoundException(error);
  if (GONE.has(error)) throw new GoneException(error);
  if (CONFLICT.has(error)) throw new ConflictException(error);
  if (UNPROCESSABLE.has(error)) throw new UnprocessableEntityException(error);
  if ((error as ExerciseDomainError) === ExerciseDomainError.INSUFFICIENT_PERMISSIONS)
    throw new ForbiddenException(error);
  if ((error as ExerciseDomainError) === ExerciseDomainError.INVALID_VISIBILITY_FOR_OWNER_TYPE) {
    throw new BadRequestException(error);
  }
  throw new UnprocessableEntityException(error);
}
