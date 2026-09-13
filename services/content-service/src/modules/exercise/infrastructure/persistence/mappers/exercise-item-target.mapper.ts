import type {
  $Enums,
  ExerciseItemTarget as PrismaTarget,
} from '../../../../../../generated/prisma/client.js';
import { ExerciseItemTarget } from '../../../domain/entities/exercise-item-target.entity.js';
import { AtomType, TargetRole } from '../../../domain/value-objects/atom-type.vo.js';

// A Prisma enum carries member NAMES, not the `@map` values, so the domain's lowercase
// strings cannot be handed to the client as-is: it type-checks and fails at runtime.
const PRISMA_TO_DOMAIN_ATOM_TYPE: Record<$Enums.AtomType, AtomType> = {
  VOCABULARY_ITEM: AtomType.VOCABULARY_ITEM,
  GRAMMAR_RULE_ATOM: AtomType.GRAMMAR_RULE_ATOM,
};

const DOMAIN_TO_PRISMA_ATOM_TYPE: Record<AtomType, $Enums.AtomType> = {
  [AtomType.VOCABULARY_ITEM]: 'VOCABULARY_ITEM',
  [AtomType.GRAMMAR_RULE_ATOM]: 'GRAMMAR_RULE_ATOM',
};

const PRISMA_TO_DOMAIN_ROLE: Record<$Enums.TargetRole, TargetRole> = {
  FOCUS: TargetRole.FOCUS,
  CONTEXT: TargetRole.CONTEXT,
};

const DOMAIN_TO_PRISMA_ROLE: Record<TargetRole, $Enums.TargetRole> = {
  [TargetRole.FOCUS]: 'FOCUS',
  [TargetRole.CONTEXT]: 'CONTEXT',
};

export interface ExerciseItemTargetCreateData {
  id: string;
  exerciseId: string;
  itemKey: string | null;
  atomType: $Enums.AtomType;
  atomId: string;
  role: $Enums.TargetRole;
  createdAt: Date;
  createdByUserId: string;
}

export class ExerciseItemTargetMapper {
  static toDomain(raw: PrismaTarget): ExerciseItemTarget {
    return ExerciseItemTarget.reconstitute(raw.id, {
      exerciseId: raw.exerciseId,
      itemKey: raw.itemKey,
      atomType: PRISMA_TO_DOMAIN_ATOM_TYPE[raw.atomType],
      atomId: raw.atomId,
      role: PRISMA_TO_DOMAIN_ROLE[raw.role],
      createdAt: raw.createdAt,
      createdByUserId: raw.createdByUserId,
    });
  }

  static toCreateData(target: ExerciseItemTarget): ExerciseItemTargetCreateData {
    return {
      id: target.id,
      exerciseId: target.exerciseId,
      itemKey: target.itemKey,
      atomType: DOMAIN_TO_PRISMA_ATOM_TYPE[target.atomType],
      atomId: target.atomId,
      role: DOMAIN_TO_PRISMA_ROLE[target.role],
      createdAt: target.createdAt,
      createdByUserId: target.createdByUserId,
    };
  }

  static domainAtomType(value: AtomType): $Enums.AtomType {
    return DOMAIN_TO_PRISMA_ATOM_TYPE[value];
  }
}
