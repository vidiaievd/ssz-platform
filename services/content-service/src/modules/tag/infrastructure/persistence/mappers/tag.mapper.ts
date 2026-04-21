import type { Tag } from '../../../../../../generated/prisma/client.js';
import { TagEntity } from '../../../domain/entities/tag.entity.js';
import {
  prismaTagCategoryToDomain,
  domainTagCategoryToPrisma,
  prismaTagScopeToDomain,
  domainTagScopeToPrisma,
} from './tag-enum-converters.js';

export class TagMapper {
  static toDomain(raw: Tag): TagEntity {
    return TagEntity.reconstitute(raw.id, {
      slug: raw.slug,
      name: raw.name,
      category: prismaTagCategoryToDomain(raw.category),
      scope: prismaTagScopeToDomain(raw.scope),
      ownerSchoolId: raw.ownerSchoolId,
      createdAt: raw.createdAt,
      deletedAt: raw.deletedAt,
      createdByUserId: raw.createdByUserId,
    });
  }

  static toCreateData(entity: TagEntity) {
    return {
      id: entity.id,
      slug: entity.slug,
      name: entity.name,
      category: domainTagCategoryToPrisma(entity.category),
      scope: domainTagScopeToPrisma(entity.scope),
      ownerSchoolId: entity.ownerSchoolId,
      createdAt: entity.createdAt,
      deletedAt: entity.deletedAt,
      createdByUserId: entity.createdByUserId,
    };
  }

  static toUpdateData(entity: TagEntity) {
    return {
      name: entity.name,
      category: domainTagCategoryToPrisma(entity.category),
      deletedAt: entity.deletedAt,
    };
  }
}
