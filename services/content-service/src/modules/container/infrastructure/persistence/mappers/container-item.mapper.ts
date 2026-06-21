import type { ContainerItem } from '../../../../../../generated/prisma/client.js';
import { $Enums } from '../../../../../../generated/prisma/client.js';
import { ContainerItemEntity } from '../../../domain/entities/container-item.entity.js';
import { prismaItemTypeToDomain, domainItemTypeToPrisma } from './enum-converters.js';

export interface ContainerItemCreateData {
  id: string;
  containerVersionId: string;
  position: number;
  itemType: $Enums.ContainerItemType;
  itemId: string;
  isRequired: boolean;
  sectionId: string | null;
  sectionLabel: string | null;
  addedAt: Date;
}

export type ContainerItemUpdateData = Pick<
  ContainerItemCreateData,
  'isRequired' | 'sectionId' | 'sectionLabel'
>;

export class ContainerItemMapper {
  static toDomain(raw: ContainerItem): ContainerItemEntity {
    return ContainerItemEntity.reconstitute(raw.id, {
      containerVersionId: raw.containerVersionId,
      position: raw.position,
      itemType: prismaItemTypeToDomain(raw.itemType),
      itemId: raw.itemId,
      isRequired: raw.isRequired,
      sectionId: raw.sectionId,
      sectionLabel: raw.sectionLabel,
      addedAt: raw.addedAt,
    });
  }

  static toCreateData(entity: ContainerItemEntity): ContainerItemCreateData {
    return {
      id: entity.id,
      containerVersionId: entity.containerVersionId,
      position: entity.position,
      itemType: domainItemTypeToPrisma(entity.itemType),
      itemId: entity.itemId,
      isRequired: entity.isRequired,
      sectionId: entity.sectionId,
      sectionLabel: entity.sectionLabel,
      addedAt: entity.addedAt,
    };
  }

  static toUpdateData(entity: ContainerItemEntity): ContainerItemUpdateData {
    return {
      isRequired: entity.isRequired,
      sectionId: entity.sectionId,
      sectionLabel: entity.sectionLabel,
    };
  }
}
