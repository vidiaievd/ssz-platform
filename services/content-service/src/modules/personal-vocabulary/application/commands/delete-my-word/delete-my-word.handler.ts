import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Result } from '../../../../../shared/kernel/result.js';
import { PersonalVocabularyDomainError } from '../../../domain/exceptions/personal-vocabulary-domain.exceptions.js';
import {
  PERSONAL_VOCABULARY_REPOSITORY,
  type IPersonalVocabularyRepository,
} from '../../../domain/repositories/personal-vocabulary.repository.interface.js';
import { DeleteMyWordCommand } from './delete-my-word.command.js';

/**
 * Takes a word out of the student's dictionary. Only the entry goes: an item of the
 * personal list stays behind, unlisted, so the same word captured again comes back with
 * the translation the student once gave it. Soft-deleting it instead would also keep its
 * row — vocabulary_items is unique by (list, word) whatever deleted_at says — and block
 * that word for good.
 */
@CommandHandler(DeleteMyWordCommand)
export class DeleteMyWordHandler implements ICommandHandler<
  DeleteMyWordCommand,
  Result<void, PersonalVocabularyDomainError>
> {
  constructor(
    @Inject(PERSONAL_VOCABULARY_REPOSITORY)
    private readonly repo: IPersonalVocabularyRepository,
  ) {}

  async execute(
    command: DeleteMyWordCommand,
  ): Promise<Result<void, PersonalVocabularyDomainError>> {
    const entry = await this.repo.findEntryById(command.entryId);
    if (!entry || !entry.belongsTo(command.userId)) {
      return Result.fail(PersonalVocabularyDomainError.ENTRY_NOT_FOUND);
    }
    await this.repo.deleteEntry(entry.id);
    return Result.ok();
  }
}
