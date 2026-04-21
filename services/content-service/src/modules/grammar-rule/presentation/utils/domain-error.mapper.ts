import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { GrammarRuleDomainError } from '../../domain/exceptions/grammar-rule-domain.exceptions.js';

const NOT_FOUND = new Set<GrammarRuleDomainError>([
  GrammarRuleDomainError.GRAMMAR_RULE_NOT_FOUND,
  GrammarRuleDomainError.EXPLANATION_NOT_FOUND,
  GrammarRuleDomainError.POOL_ENTRY_NOT_FOUND,
  GrammarRuleDomainError.EXERCISE_NOT_FOUND_FOR_POOL,
  GrammarRuleDomainError.NO_EXERCISES_AVAILABLE,
]);

const GONE = new Set<GrammarRuleDomainError>([GrammarRuleDomainError.RULE_ALREADY_DELETED]);

const CONFLICT = new Set<GrammarRuleDomainError>([
  GrammarRuleDomainError.DUPLICATE_EXPLANATION,
  GrammarRuleDomainError.EXERCISE_ALREADY_IN_POOL,
  GrammarRuleDomainError.SLUG_ALREADY_EXISTS,
  GrammarRuleDomainError.EXPLANATION_ALREADY_PUBLISHED,
]);

const UNPROCESSABLE = new Set<GrammarRuleDomainError>([
  GrammarRuleDomainError.INVALID_LEVEL_RANGE,
  GrammarRuleDomainError.EMPTY_BODY_MARKDOWN,
  GrammarRuleDomainError.EXPLANATION_NOT_IN_DRAFT_STATUS,
  GrammarRuleDomainError.RULE_HAS_PUBLISHED_CONTAINER_REFERENCES,
  GrammarRuleDomainError.EXERCISE_DELETED_FOR_POOL,
  GrammarRuleDomainError.INVALID_WEIGHT,
  GrammarRuleDomainError.INVALID_REORDER_INPUT,
  GrammarRuleDomainError.EMPTY_TITLE,
]);

export function throwHttpException(error: GrammarRuleDomainError | string): never {
  if (NOT_FOUND.has(error as GrammarRuleDomainError)) throw new NotFoundException(error);
  if (GONE.has(error as GrammarRuleDomainError)) throw new GoneException(error);
  if (CONFLICT.has(error as GrammarRuleDomainError)) throw new ConflictException(error);
  if (UNPROCESSABLE.has(error as GrammarRuleDomainError)) {
    throw new UnprocessableEntityException(error);
  }
  if ((error as GrammarRuleDomainError) === GrammarRuleDomainError.INSUFFICIENT_PERMISSIONS)
    throw new ForbiddenException(error);
  if (
    (error as GrammarRuleDomainError) === GrammarRuleDomainError.INVALID_VISIBILITY_FOR_OWNER_TYPE
  ) {
    throw new BadRequestException(error);
  }
  throw new UnprocessableEntityException(error);
}
