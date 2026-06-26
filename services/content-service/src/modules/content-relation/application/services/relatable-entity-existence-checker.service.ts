import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { RelatableEntityType } from '../../domain/types/relatable-entity-type.js';

// CAN_DO_DESCRIPTOR has no table yet (plan 21 §5, not implemented) — relations
// targeting it are accepted without an existence check until that lands.
const UNCHECKED_ENTITY_TYPES = new Set<RelatableEntityType>([
  RelatableEntityType.CAN_DO_DESCRIPTOR,
]);

@Injectable()
export class RelatableEntityExistenceChecker {
  constructor(private readonly prisma: PrismaService) {}

  async exists(type: RelatableEntityType, id: string): Promise<boolean> {
    if (UNCHECKED_ENTITY_TYPES.has(type)) return true;

    const count = await this.countFor(type, id);
    return count > 0;
  }

  private countFor(type: RelatableEntityType, id: string): Promise<number> {
    switch (type) {
      case RelatableEntityType.CONTAINER:
        return this.prisma.container.count({ where: { id, deletedAt: null } });
      case RelatableEntityType.LESSON:
        return this.prisma.lesson.count({ where: { id, deletedAt: null } });
      case RelatableEntityType.VOCABULARY_LIST:
        return this.prisma.vocabularyList.count({ where: { id, deletedAt: null } });
      case RelatableEntityType.VOCABULARY_ITEM:
        return this.prisma.vocabularyItem.count({ where: { id, deletedAt: null } });
      case RelatableEntityType.GRAMMAR_RULE:
        return this.prisma.grammarRule.count({ where: { id, deletedAt: null } });
      case RelatableEntityType.EXERCISE:
        return this.prisma.exercise.count({ where: { id, deletedAt: null } });
      case RelatableEntityType.CAN_DO_DESCRIPTOR:
        return Promise.resolve(1);
    }
  }
}
