import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ContainerDomainError } from '../../domain/exceptions/container-domain.exceptions.js';
import { CONTAINER_VERSION_REPOSITORY } from '../../domain/repositories/container-version.repository.interface.js';
import type { IContainerVersionRepository } from '../../domain/repositories/container-version.repository.interface.js';
import { CONTAINER_ITEM_REPOSITORY } from '../../domain/repositories/container-item.repository.interface.js';
import type { IContainerItemRepository } from '../../domain/repositories/container-item.repository.interface.js';
import { CONTAINER_SECTION_REPOSITORY } from '../../domain/repositories/container-section.repository.interface.js';
import type { IContainerSectionRepository } from '../../domain/repositories/container-section.repository.interface.js';
import { throwHttpException } from '../utils/domain-error.mapper.js';

/**
 * Keeps the ids nested under `containers/:containerId/…` inside that container.
 *
 * VisibilityGuard decides access by the container the route names, while the handlers
 * load the version, row or section by their own id. Without this check, edit rights on
 * one container reached the versions, rows and sections of any other: the route said
 * "my module", the id pointed elsewhere, and nothing compared the two.
 *
 * Whatever does not belong answers as missing — the same 404 an unknown id gets.
 * Params the route does not have are skipped, so one guard serves the version, item and
 * section controllers.
 */
@Injectable()
export class ContainerScopeGuard implements CanActivate {
  constructor(
    @Inject(CONTAINER_VERSION_REPOSITORY)
    private readonly versionRepo: IContainerVersionRepository,
    @Inject(CONTAINER_ITEM_REPOSITORY)
    private readonly itemRepo: IContainerItemRepository,
    @Inject(CONTAINER_SECTION_REPOSITORY)
    private readonly sectionRepo: IContainerSectionRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const params = context.switchToHttp().getRequest<Request<Record<string, string>>>().params;
    const { containerId, versionId, itemId, sectionId } = params;
    if (!containerId || !versionId) return true;

    const version = await this.versionRepo.findById(versionId);
    if (!version || version.containerId !== containerId) {
      throwHttpException(ContainerDomainError.VERSION_NOT_FOUND);
    }

    if (itemId) {
      const item = await this.itemRepo.findById(itemId);
      if (!item || item.containerVersionId !== versionId) {
        throwHttpException(ContainerDomainError.ITEM_NOT_FOUND);
      }
    }

    if (sectionId) {
      const section = await this.sectionRepo.findById(sectionId);
      if (!section || section.containerVersionId !== versionId) {
        throwHttpException(ContainerDomainError.SECTION_NOT_FOUND);
      }
    }

    return true;
  }
}
