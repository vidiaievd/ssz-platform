import type { ContainerSection } from '../../../../../../generated/prisma/client.js';
import { ContainerSectionEntity } from '../../../domain/entities/container-section.entity.js';

export interface ContainerSectionCreateData {
  id: string;
  containerVersionId: string;
  title: string;
  position: number;
  createdAt: Date;
}

export type ContainerSectionUpdateData = Pick<ContainerSectionCreateData, 'title' | 'position'>;

export class ContainerSectionMapper {
  static toDomain(raw: ContainerSection): ContainerSectionEntity {
    return ContainerSectionEntity.reconstitute(raw.id, {
      containerVersionId: raw.containerVersionId,
      title: raw.title,
      position: raw.position,
      createdAt: raw.createdAt,
    });
  }

  static toCreateData(entity: ContainerSectionEntity): ContainerSectionCreateData {
    return {
      id: entity.id,
      containerVersionId: entity.containerVersionId,
      title: entity.title,
      position: entity.position,
      createdAt: entity.createdAt,
    };
  }

  static toUpdateData(entity: ContainerSectionEntity): ContainerSectionUpdateData {
    return {
      title: entity.title,
      position: entity.position,
    };
  }
}
