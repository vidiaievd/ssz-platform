import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UpdateTagCommand } from './update-tag.command.js';
import { TagEntity } from '../../../domain/entities/tag.entity.js';
import { TagScope } from '../../../domain/value-objects/tag-scope.vo.js';
import { TagDomainError } from '../../../domain/exceptions/tag-domain.exceptions.js';
import { TAG_REPOSITORY } from '../../../domain/repositories/tag.repository.interface.js';
import type { ITagRepository } from '../../../domain/repositories/tag.repository.interface.js';
import { ORGANIZATION_CLIENT } from '../../../../../shared/access-control/domain/ports/organization-client.port.js';
import type { IOrganizationClient } from '../../../../../shared/access-control/domain/ports/organization-client.port.js';
import { Result } from '../../../../../shared/kernel/result.js';

@CommandHandler(UpdateTagCommand)
export class UpdateTagHandler implements ICommandHandler<
  UpdateTagCommand,
  Result<TagEntity, TagDomainError>
> {
  constructor(
    @Inject(TAG_REPOSITORY) private readonly tagRepo: ITagRepository,
    @Inject(ORGANIZATION_CLIENT) private readonly orgClient: IOrganizationClient,
  ) {}

  async execute(command: UpdateTagCommand): Promise<Result<TagEntity, TagDomainError>> {
    const tag = await this.tagRepo.findById(command.tagId);
    if (!tag) throw new NotFoundException(`Tag ${command.tagId} not found`);

    if (!command.isPlatformAdmin) {
      if (tag.scope === TagScope.GLOBAL) {
        throw new ForbiddenException('Only platform admins can update global tags');
      }
      if (tag.scope === TagScope.SCHOOL && tag.ownerSchoolId) {
        const role = await this.orgClient.getMemberRole(command.userId, tag.ownerSchoolId);
        if (role !== 'owner' && role !== 'content_admin') {
          throw new ForbiddenException('Updating school tags requires owner or content_admin role');
        }
      }
    }

    const updateResult = tag.update({ name: command.name, category: command.category });
    if (updateResult.isFail) return Result.fail(updateResult.error);

    const saved = await this.tagRepo.save(tag);
    return Result.ok(saved);
  }
}
