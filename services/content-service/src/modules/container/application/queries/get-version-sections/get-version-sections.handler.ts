import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetVersionSectionsQuery } from './get-version-sections.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { ContainerSectionEntity } from '../../../domain/entities/container-section.entity.js';
import { CONTAINER_VERSION_REPOSITORY } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';
import { CONTAINER_SECTION_REPOSITORY } from '../../../domain/repositories/container-section.repository.interface.js';
import type { IContainerSectionRepository } from '../../../domain/repositories/container-section.repository.interface.js';

@QueryHandler(GetVersionSectionsQuery)
export class GetVersionSectionsHandler implements IQueryHandler<
  GetVersionSectionsQuery,
  Result<ContainerSectionEntity[], ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_VERSION_REPOSITORY)
    private readonly versionRepo: IContainerVersionRepository,
    @Inject(CONTAINER_SECTION_REPOSITORY)
    private readonly sectionRepo: IContainerSectionRepository,
  ) {}

  async execute(
    query: GetVersionSectionsQuery,
  ): Promise<Result<ContainerSectionEntity[], ContainerDomainError>> {
    const version = await this.versionRepo.findById(query.versionId);
    if (!version) {
      return Result.fail(ContainerDomainError.VERSION_NOT_FOUND);
    }

    const sections = await this.sectionRepo.findByVersionId(query.versionId);
    return Result.ok(sections);
  }
}
