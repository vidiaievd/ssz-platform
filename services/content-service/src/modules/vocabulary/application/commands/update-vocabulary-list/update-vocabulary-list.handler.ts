import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { UpdateVocabularyListCommand } from './update-vocabulary-list.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { VocabularyDomainError } from '../../../domain/exceptions/vocabulary-domain.exceptions.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import { VOCABULARY_LIST_REPOSITORY } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import type { IVocabularyListRepository } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import { generateSlug, resolveUniqueSlug } from '../../../../../shared/utils/slug.util.js';

@CommandHandler(UpdateVocabularyListCommand)
export class UpdateVocabularyListHandler implements ICommandHandler<
  UpdateVocabularyListCommand,
  Result<void, VocabularyDomainError>
> {
  constructor(
    @Inject(VOCABULARY_LIST_REPOSITORY)
    private readonly listRepo: IVocabularyListRepository,
  ) {}

  async execute(
    command: UpdateVocabularyListCommand,
  ): Promise<Result<void, VocabularyDomainError>> {
    const list = await this.listRepo.findById(command.listId);
    if (!list) {
      return Result.fail(VocabularyDomainError.LIST_NOT_FOUND);
    }

    if (list.ownerUserId !== command.userId) {
      // TODO: Prompt 6 — extend with school content_admin role check via OrganizationService.
      return Result.fail(VocabularyDomainError.INSUFFICIENT_PERMISSIONS);
    }

    const updateResult = list.update({
      title: command.title,
      description: command.description,
      difficultyLevel: command.difficultyLevel,
      coverImageMediaId: command.coverImageMediaId,
      visibility: command.visibility,
      autoAddToSrs: command.autoAddToSrs,
    });

    if (updateResult.isFail) {
      return Result.fail(updateResult.error);
    }

    // If visibility is transitioning to PUBLIC and no slug has been assigned yet,
    // generate one now. This mirrors the create-time slug logic.
    if (command.visibility === Visibility.PUBLIC && list.slug === null) {
      const titleForSlug = list.title;
      const baseSlug = generateSlug(titleForSlug);
      const slug = await resolveUniqueSlug(baseSlug, (candidate) =>
        this.listRepo.isSlugTaken(candidate),
      );
      const slugResult = list.assignSlug(slug);
      if (slugResult.isFail) {
        return Result.fail(slugResult.error);
      }
    }

    await this.listRepo.save(list);

    return Result.ok();
  }
}
