import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { VocabularyDomainError } from '../../../vocabulary/domain/exceptions/vocabulary-domain.exceptions.js';
import { throwHttpException as throwVocabularyHttpException } from '../../../vocabulary/presentation/utils/domain-error.mapper.js';
import { PersonalVocabularyDomainError } from '../../domain/exceptions/personal-vocabulary-domain.exceptions.js';

const OWN_ERRORS = new Set<string>(Object.values(PersonalVocabularyDomainError));

/** Own errors map here; a vocabulary error from a delegated write maps as it does there. */
export function throwHttpException(
  error: PersonalVocabularyDomainError | VocabularyDomainError,
): never {
  if (!OWN_ERRORS.has(error)) throwVocabularyHttpException(error as VocabularyDomainError);

  switch (error as PersonalVocabularyDomainError) {
    case PersonalVocabularyDomainError.ENTRY_NOT_FOUND:
      throw new NotFoundException(error);
    case PersonalVocabularyDomainError.CATALOG_WORD_READ_ONLY:
      throw new ConflictException(error);
    default:
      throw new UnprocessableEntityException(error);
  }
}
