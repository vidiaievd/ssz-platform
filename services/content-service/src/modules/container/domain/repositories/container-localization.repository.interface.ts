import { ContainerLocalizationEntity } from '../entities/container-localization.entity.js';

export const CONTAINER_LOCALIZATION_REPOSITORY = Symbol('CONTAINER_LOCALIZATION_REPOSITORY');

export interface IContainerLocalizationRepository {
  findById(id: string): Promise<ContainerLocalizationEntity | null>;
  findByContainerId(containerId: string): Promise<ContainerLocalizationEntity[]>;
  findByContainerAndLanguage(
    containerId: string,
    languageCode: string,
  ): Promise<ContainerLocalizationEntity | null>;
  save(entity: ContainerLocalizationEntity): Promise<ContainerLocalizationEntity>;
  delete(id: string): Promise<void>;
}
