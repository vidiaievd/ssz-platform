import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DeleteTagCommand } from './delete-tag.command.js';
import { TagScope } from '../../../domain/value-objects/tag-scope.vo.js';
import { TagDomainError } from '../../../domain/exceptions/tag-domain.exceptions.js';
import { TAG_REPOSITORY } from '../../../domain/repositories/tag.repository.interface.js';
import type { ITagRepository } from '../../../domain/repositories/tag.repository.interface.js';
import { ORGANIZATION_CLIENT } from '../../../../../shared/access-control/domain/ports/organization-client.port.js';
import type { IOrganizationClient } from '../../../../../shared/access-control/domain/ports/organization-client.port.js';
import { Result } from '../../../../../shared/kernel/result.js';

@CommandHandler(DeleteTagCommand)
export class DeleteTagHandler implements ICommandHandler<
  DeleteTagCommand,
  Result<void, TagDomainError>
> {
  constructor(
    @Inject(TAG_REPOSITORY) private readonly tagRepo: ITagRepository,
    @Inject(ORGANIZATION_CLIENT) private readonly orgClient: IOrganizationClient,
  ) {}

  async execute(command: DeleteTagCommand): Promise<Result<void, TagDomainError>> {
    const tag = await this.tagRepo.findById(command.tagId);
    if (!tag) throw new NotFoundException(`Tag ${command.tagId} not found`);

    if (!command.isPlatformAdmin) {
      if (tag.scope === TagScope.GLOBAL) {
        throw new ForbiddenException('Only platform admins can delete global tags');
      }
      if (tag.scope === TagScope.SCHOOL && tag.ownerSchoolId) {
        const role = await this.orgClient.getMemberRole(command.userId, tag.ownerSchoolId);
        if (role !== 'owner' && role !== 'content_admin') {
          throw new ForbiddenException('Deleting school tags requires owner or content_admin role');
        }
      }
    }

    const result = tag.softDelete();
    if (result.isFail) return Result.fail(result.error);

    await this.tagRepo.save(tag);
    return Result.ok();
  }
}
