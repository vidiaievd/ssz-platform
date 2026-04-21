import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CreateVocabularyListCommand } from './create-vocabulary-list.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { VocabularyDomainError } from '../../../domain/exceptions/vocabulary-domain.exceptions.js';
import { VocabularyListEntity } from '../../../domain/entities/vocabulary-list.entity.js';
import { Visibility } from '../../../../container/domain/value-objects/visibility.vo.js';
import { VOCABULARY_LIST_REPOSITORY } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import type { IVocabularyListRepository } from '../../../domain/repositories/vocabulary-list.repository.interface.js';
import { generateSlug, resolveUniqueSlug } from '../../../../../shared/utils/slug.util.js';

export interface CreateVocabularyListResult {
  listId: string;
}

@CommandHandler(CreateVocabularyListCommand)
export class CreateVocabularyListHandler implements ICommandHandler<
  CreateVocabularyListCommand,
  Result<CreateVocabularyListResult, VocabularyDomainError>
> {
  constructor(
    @Inject(VOCABULARY_LIST_REPOSITORY)
    private readonly listRepo: IVocabularyListRepository,
  ) {}

  async execute(
    command: CreateVocabularyListCommand,
  ): Promise<Result<CreateVocabularyListResult, VocabularyDomainError>> {
    const listResult = VocabularyListEntity.create({
      title: command.title,
      targetLanguage: command.targetLanguage,
      difficultyLevel: command.difficultyLevel,
      ownerUserId: command.userId,
      ownerSchoolId: command.ownerSchoolId,
      visibility: command.visibility,
      description: command.description,
      coverImageMediaId: command.coverImageMediaId,
      autoAddToSrs: command.autoAddToSrs,
    });

    if (listResult.isFail) {
      return Result.fail(listResult.error);
    }

    const list = listResult.value;

    // Vocabulary lists: slug generated at creation if visibility = PUBLIC.
    // (Unlike containers/lessons where slug is generated at first publish.)
    if (command.visibility === Visibility.PUBLIC) {
      const baseSlug = generateSlug(command.title);
      const slug = await resolveUniqueSlug(baseSlug, (candidate) =>
        this.listRepo.isSlugTaken(candidate),
      );
      const slugResult = list.assignSlug(slug);
      if (slugResult.isFail) {
        return Result.fail(slugResult.error);
      }
    }

    await this.listRepo.save(list);

    return Result.ok({ listId: list.id });
  }
}
