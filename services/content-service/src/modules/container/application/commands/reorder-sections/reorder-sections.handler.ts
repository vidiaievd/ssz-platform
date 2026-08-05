import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ReorderSectionsCommand } from './reorder-sections.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { VersionStatus } from '../../../domain/value-objects/version-status.vo.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';
import { CONTAINER_VERSION_REPOSITORY } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';
import { CONTAINER_SECTION_REPOSITORY } from '../../../domain/repositories/container-section.repository.interface.js';
import type { IContainerSectionRepository } from '../../../domain/repositories/container-section.repository.interface.js';

@CommandHandler(ReorderSectionsCommand)
export class ReorderSectionsHandler implements ICommandHandler<
  ReorderSectionsCommand,
  Result<void, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
    @Inject(CONTAINER_VERSION_REPOSITORY)
    private readonly versionRepo: IContainerVersionRepository,
    @Inject(CONTAINER_SECTION_REPOSITORY)
    private readonly sectionRepo: IContainerSectionRepository,
  ) {}

  async execute(command: ReorderSectionsCommand): Promise<Result<void, ContainerDomainError>> {
    const version = await this.versionRepo.findById(command.versionId);
    if (!version) {
      return Result.fail(ContainerDomainError.VERSION_NOT_FOUND);
    }

    if (version.status !== VersionStatus.DRAFT) {
      return Result.fail(ContainerDomainError.CANNOT_MODIFY_NON_DRAFT_VERSION);
    }

    const container = await this.containerRepo.findById(version.containerId);
    if (!container) {
      return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);
    }

    const existingSections = await this.sectionRepo.findByVersionId(command.versionId);
    const existingIds = new Set(existingSections.map((s) => s.id));

    // Validate: all provided IDs must belong to this version.
    for (const section of command.sections) {
      if (!existingIds.has(section.id)) {
        return Result.fail(ContainerDomainError.SECTION_NOT_FOUND);
      }
    }

    // Validate: positions must be unique and form a continuous 0-based sequence.
    const positions = command.sections.map((s) => s.position).sort((a, b) => a - b);
    for (let i = 0; i < positions.length; i++) {
      if (positions[i] !== i) {
        return Result.fail(ContainerDomainError.DUPLICATE_SECTION_POSITION);
      }
    }

    // Validate: the reorder payload must cover all sections in the version.
    if (command.sections.length !== existingSections.length) {
      return Result.fail(ContainerDomainError.DUPLICATE_SECTION_POSITION);
    }

    await this.sectionRepo.reorder(command.versionId, command.sections);

    return Result.ok();
  }
}
