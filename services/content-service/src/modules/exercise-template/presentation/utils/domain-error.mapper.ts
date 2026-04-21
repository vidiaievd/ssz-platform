import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ExerciseTemplateDomainError } from '../../domain/exceptions/exercise-template-domain.exceptions.js';

export function throwHttpException(error: ExerciseTemplateDomainError | string): never {
  if ((error as ExerciseTemplateDomainError) === ExerciseTemplateDomainError.TEMPLATE_NOT_FOUND) {
    throw new NotFoundException(error);
  }
  if ((error as ExerciseTemplateDomainError) === ExerciseTemplateDomainError.TEMPLATE_NOT_ACTIVE) {
    throw new UnprocessableEntityException(error);
  }
  if (
    (error as ExerciseTemplateDomainError) ===
    ExerciseTemplateDomainError.LANGUAGE_NOT_SUPPORTED_BY_TEMPLATE
  ) {
    throw new UnprocessableEntityException(error);
  }
  throw new UnprocessableEntityException(error);
}
