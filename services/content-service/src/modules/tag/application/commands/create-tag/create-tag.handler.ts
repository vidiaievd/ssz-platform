import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, ForbiddenException } from '@nestjs/common';
import { CreateTagCommand } from './create-tag.command.js';
import { TagEntity } from '../../../domain/entities/tag.entity.js';
import { TagScope } from '../../../domain/value-objects/tag-scope.vo.js';
import { TagDomainError } from '../../../domain/exceptions/tag-domain.exceptions.js';
import { TAG_REPOSITORY } from '../../../domain/repositories/tag.repository.interface.js';
import type { ITagRepository } from '../../../domain/repositories/tag.repository.interface.js';
import { TagSlugGeneratorService } from '../../../domain/services/tag-slug-generator.service.js';
import { ORGANIZATION_CLIENT } from '../../../../../shared/access-control/domain/ports/organization-client.port.js';
import type { IOrganizationClient } from '../../../../../shared/access-control/domain/ports/organization-client.port.js';
import { Result } from '../../../../../shared/kernel/result.js';

@CommandHandler(CreateTagCommand)
export class CreateTagHandler implements ICommandHandler<
  CreateTagCommand,
  Result<TagEntity, TagDomainError>
> {
  constructor(
    @Inject(TAG_REPOSITORY) private readonly tagRepo: ITagRepository,
    @Inject(ORGANIZATION_CLIENT) private readonly orgClient: IOrganizationClient,
    private readonly slugGenerator: TagSlugGeneratorService,
  ) {}

  async execute(command: CreateTagCommand): Promise<Result<TagEntity, TagDomainError>> {
    // Permission: global scope requires platform admin.
    if (command.scope === TagScope.GLOBAL && !command.isPlatformAdmin) {
      throw new ForbiddenException('Only platform admins can create global tags');
    }

    // Permission: school scope requires owner or content_admin role.
    if (command.scope === TagScope.SCHOOL) {
      if (!command.ownerSchoolId) {
        return Result.fail(TagDomainError.SCHOOL_TAG_REQUIRES_SCHOOL);
      }
      if (!command.isPlatformAdmin) {
        const role = await this.orgClient.getMemberRole(command.userId, command.ownerSchoolId);
        if (role !== 'owner' && role !== 'content_admin') {
          throw new ForbiddenException('Creating school tags requires owner or content_admin role');
        }
      }
    }

    const slug = await this.slugGenerator.generate(
      command.name,
      command.scope,
      command.ownerSchoolId ?? null,
    );

    const result = TagEntity.create({
      slug,
      name: command.name,
      category: command.category,
      scope: command.scope,
      ownerSchoolId: command.ownerSchoolId,
      createdByUserId: command.userId,
    });

    if (result.isFail) return result;

    const saved = await this.tagRepo.save(result.value);
    return Result.ok(saved);
  }
}
