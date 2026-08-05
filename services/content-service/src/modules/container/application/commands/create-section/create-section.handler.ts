import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CreateSectionCommand } from './create-section.command.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { ContainerSectionEntity } from '../../../domain/entities/container-section.entity.js';
import { VersionStatus } from '../../../domain/value-objects/version-status.vo.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';
import { CONTAINER_VERSION_REPOSITORY } from '../../../domain/repositories/container-version.repository.interface.js';
import type { IContainerVersionRepository } from '../../../domain/repositories/container-version.repository.interface.js';
import { CONTAINER_SECTION_REPOSITORY } from '../../../domain/repositories/container-section.repository.interface.js';
import type { IContainerSectionRepository } from '../../../domain/repositories/container-section.repository.interface.js';

export interface CreateSectionResult {
  sectionId: string;
  position: number;
}

@CommandHandler(CreateSectionCommand)
export class CreateSectionHandler implements ICommandHandler<
  CreateSectionCommand,
  Result<CreateSectionResult, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
    @Inject(CONTAINER_VERSION_REPOSITORY)
    private readonly versionRepo: IContainerVersionRepository,
    @Inject(CONTAINER_SECTION_REPOSITORY)
    private readonly sectionRepo: IContainerSectionRepository,
  ) {}

  async execute(
    command: CreateSectionCommand,
  ): Promise<Result<CreateSectionResult, ContainerDomainError>> {
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

    let position: number;
    if (command.position !== undefined) {
      const existing = await this.sectionRepo.findByVersionId(command.versionId);
      const occupied = existing.some((s) => s.position === command.position);
      if (occupied) {
        return Result.fail(ContainerDomainError.DUPLICATE_SECTION_POSITION);
      }
      position = command.position;
    } else {
      position = (await this.sectionRepo.getMaxPosition(command.versionId)) + 1;
    }

    const section = ContainerSectionEntity.create({
      containerVersionId: command.versionId,
      title: command.title,
      position,
    });

    await this.sectionRepo.save(section);

    return Result.ok({ sectionId: section.id, position });
  }
}
