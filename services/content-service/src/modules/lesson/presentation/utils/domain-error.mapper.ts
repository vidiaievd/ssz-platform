import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { LessonDomainError } from '../../domain/exceptions/lesson-domain.exceptions.js';

const NOT_FOUND_ERRORS = new Set<LessonDomainError>([
  LessonDomainError.LESSON_NOT_FOUND,
  LessonDomainError.VARIANT_NOT_FOUND,
  LessonDomainError.BEST_VARIANT_NOT_FOUND,
]);

const GONE_ERRORS = new Set<LessonDomainError>([
  LessonDomainError.LESSON_ALREADY_DELETED,
  LessonDomainError.VARIANT_ALREADY_DELETED,
]);

const CONFLICT_ERRORS = new Set<LessonDomainError>([
  LessonDomainError.DUPLICATE_VARIANT,
  LessonDomainError.VARIANT_ALREADY_PUBLISHED,
  LessonDomainError.SLUG_ALREADY_EXISTS,
]);

const UNPROCESSABLE_ERRORS = new Set<LessonDomainError>([
  LessonDomainError.INVALID_LEVEL_RANGE,
  LessonDomainError.EMPTY_BODY_MARKDOWN,
  LessonDomainError.VARIANT_NOT_IN_DRAFT_STATUS,
  LessonDomainError.LESSON_HAS_PUBLISHED_REFERENCES,
]);

export function throwHttpException(error: LessonDomainError): never {
  if (NOT_FOUND_ERRORS.has(error)) {
    throw new NotFoundException(error);
  }
  if (GONE_ERRORS.has(error)) {
    throw new GoneException(error);
  }
  if (CONFLICT_ERRORS.has(error)) {
    throw new ConflictException(error);
  }
  if (UNPROCESSABLE_ERRORS.has(error)) {
    throw new UnprocessableEntityException(error);
  }
  if (error === LessonDomainError.INSUFFICIENT_PERMISSIONS) {
    throw new ForbiddenException(error);
  }
  if (error === LessonDomainError.INVALID_VISIBILITY_FOR_OWNER_TYPE) {
    throw new BadRequestException(error);
  }
  throw new UnprocessableEntityException(error);
}
