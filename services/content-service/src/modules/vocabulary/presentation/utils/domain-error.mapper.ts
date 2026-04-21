import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { VocabularyDomainError } from '../../domain/exceptions/vocabulary-domain.exceptions.js';

const NOT_FOUND_ERRORS = new Set<VocabularyDomainError>([
  VocabularyDomainError.LIST_NOT_FOUND,
  VocabularyDomainError.ITEM_NOT_FOUND,
  VocabularyDomainError.TRANSLATION_NOT_FOUND,
  VocabularyDomainError.USAGE_EXAMPLE_NOT_FOUND,
  VocabularyDomainError.EXAMPLE_TRANSLATION_NOT_FOUND,
]);

const GONE_ERRORS = new Set<VocabularyDomainError>([
  VocabularyDomainError.LIST_ALREADY_DELETED,
  VocabularyDomainError.ITEM_ALREADY_DELETED,
]);

const CONFLICT_ERRORS = new Set<VocabularyDomainError>([
  VocabularyDomainError.DUPLICATE_WORD_IN_LIST,
  VocabularyDomainError.DUPLICATE_POSITION,
  VocabularyDomainError.DUPLICATE_TRANSLATION_LANGUAGE,
  VocabularyDomainError.DUPLICATE_EXAMPLE_TRANSLATION_LANGUAGE,
  VocabularyDomainError.SLUG_ALREADY_ASSIGNED,
  VocabularyDomainError.SLUG_ALREADY_EXISTS,
]);

const UNPROCESSABLE_ERRORS = new Set<VocabularyDomainError>([
  VocabularyDomainError.EMPTY_WORD,
  VocabularyDomainError.EMPTY_TRANSLATION,
  VocabularyDomainError.EMPTY_EXAMPLE_TEXT,
  VocabularyDomainError.INVALID_GRAMMATICAL_PROPERTIES,
  VocabularyDomainError.LIST_HAS_PUBLISHED_CONTAINER_REFERENCES,
  VocabularyDomainError.INVALID_REORDER_INPUT,
  VocabularyDomainError.INVALID_BULK_INPUT,
  VocabularyDomainError.BATCH_SIZE_EXCEEDED,
]);

export function throwHttpException(error: VocabularyDomainError): never {
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
  if (error === VocabularyDomainError.INSUFFICIENT_PERMISSIONS) {
    throw new ForbiddenException(error);
  }
  if (error === VocabularyDomainError.INVALID_VISIBILITY_FOR_OWNER_TYPE) {
    throw new BadRequestException(error);
  }
  throw new UnprocessableEntityException(error);
}
