import type {
  CanDoDescriptor as PrismaDescriptor,
  CanDoDescriptorLocalization as PrismaLocalization,
  CanDoSkill as PrismaSkill,
  CanDoScope as PrismaScope,
  DifficultyLevel as PrismaLevel,
} from '../../../../../../generated/prisma/client.js';
import { CanDoDescriptorEntity } from '../../../domain/entities/can-do-descriptor.entity.js';
import type { CefrLevel } from '../../../domain/entities/can-do-descriptor.entity.js';
import { CanDoSkill } from '../../../domain/value-objects/can-do-skill.vo.js';
import { CanDoScope } from '../../../domain/value-objects/can-do-scope.vo.js';

type PrismaRow = PrismaDescriptor & { localizations: PrismaLocalization[] };

function toDomainSkill(s: PrismaSkill): CanDoSkill {
  return s as unknown as CanDoSkill;
}

function toDomainScope(s: PrismaScope): CanDoScope {
  return s as unknown as CanDoScope;
}

function toPrismaSkill(s: CanDoSkill): PrismaSkill {
  return s as unknown as PrismaSkill;
}

function toPrismaScope(s: CanDoScope): PrismaScope {
  return s as unknown as PrismaScope;
}

function toPrismaLevel(l: CefrLevel): PrismaLevel {
  return l as PrismaLevel;
}

export class CanDoDescriptorMapper {
  static toDomain(row: PrismaRow): CanDoDescriptorEntity {
    return CanDoDescriptorEntity.reconstitute(row.id, {
      cefrLevel: row.cefrLevel as CefrLevel,
      skill: toDomainSkill(row.skill),
      scope: toDomainScope(row.scope),
      ownerSchoolId: row.ownerSchoolId,
      source: row.source,
      localizations: row.localizations.map((l) => ({
        language: l.language,
        text: l.text,
      })),
      createdAt: row.createdAt,
      deletedAt: row.deletedAt,
      createdByUserId: row.createdByUserId,
    });
  }

  static toCreateData(entity: CanDoDescriptorEntity) {
    return {
      id: entity.id,
      cefrLevel: toPrismaLevel(entity.cefrLevel),
      skill: toPrismaSkill(entity.skill),
      scope: toPrismaScope(entity.scope),
      ownerSchoolId: entity.ownerSchoolId,
      source: entity.source,
      createdByUserId: entity.createdByUserId,
      localizations: {
        create: entity.localizations.map((l) => ({
          language: l.language,
          text: l.text,
        })),
      },
    };
  }

  static toUpdateData(entity: CanDoDescriptorEntity) {
    return {
      deletedAt: entity.deletedAt,
      source: entity.source,
      localizations: {
        deleteMany: {},
        create: entity.localizations.map((l) => ({
          language: l.language,
          text: l.text,
        })),
      },
    };
  }
}
