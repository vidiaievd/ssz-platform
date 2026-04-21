import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ContainerDomainError } from '../../domain/exceptions/container-domain.exceptions.js';

const NOT_FOUND_ERRORS = new Set<ContainerDomainError>([
  ContainerDomainError.CONTAINER_NOT_FOUND,
  ContainerDomainError.VERSION_NOT_FOUND,
  ContainerDomainError.ITEM_NOT_FOUND,
  ContainerDomainError.LOCALIZATION_NOT_FOUND,
]);

const CONFLICT_ERRORS = new Set<ContainerDomainError>([
  ContainerDomainError.CONTAINER_ALREADY_DELETED,
  ContainerDomainError.DRAFT_ALREADY_EXISTS,
  ContainerDomainError.SLUG_ALREADY_EXISTS,
  ContainerDomainError.LOCALIZATION_ALREADY_EXISTS,
]);

const UNPROCESSABLE_ERRORS = new Set<ContainerDomainError>([
  ContainerDomainError.VERSION_NOT_IN_DRAFT_STATUS,
  ContainerDomainError.VERSION_NOT_IN_PUBLISHED_STATUS,
  ContainerDomainError.VERSION_NOT_IN_DEPRECATED_STATUS,
  ContainerDomainError.CANNOT_PUBLISH_EMPTY_VERSION,
  ContainerDomainError.CANNOT_PUBLISH_WITH_BROKEN_REFERENCES,
  ContainerDomainError.CANNOT_MODIFY_NON_DRAFT_VERSION,
  ContainerDomainError.CANNOT_CANCEL_ONLY_VERSION,
  ContainerDomainError.DUPLICATE_ITEM_POSITION,
]);

export function throwHttpException(error: ContainerDomainError): never {
  if (NOT_FOUND_ERRORS.has(error)) {
    throw new NotFoundException(error);
  }
  if (CONFLICT_ERRORS.has(error)) {
    throw new ConflictException(error);
  }
  if (UNPROCESSABLE_ERRORS.has(error)) {
    throw new UnprocessableEntityException(error);
  }
  if (error === ContainerDomainError.INSUFFICIENT_PERMISSIONS) {
    throw new ForbiddenException(error);
  }
  if (error === ContainerDomainError.INVALID_VISIBILITY_FOR_OWNER_TYPE) {
    throw new BadRequestException(error);
  }
  throw new UnprocessableEntityException(error);
}
