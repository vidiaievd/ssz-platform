import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  AtomDescriptor,
  IExerciseItemTargetRepository,
  EXERCISE_ITEM_TARGET_REPOSITORY,
} from '../../domain/repositories/exercise-item-target.repository.interface.js';
import { ExerciseItemTarget } from '../../domain/entities/exercise-item-target.entity.js';
import { AtomType } from '../../domain/value-objects/atom-type.vo.js';
import { ExerciseItemTargetMapper } from './mappers/exercise-item-target.mapper.js';

export { EXERCISE_ITEM_TARGET_REPOSITORY };

@Injectable()
export class PrismaExerciseItemTargetRepository implements IExerciseItemTargetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByExerciseId(exerciseId: string): Promise<ExerciseItemTarget[]> {
    const rows = await this.prisma.exerciseItemTarget.findMany({
      where: { exerciseId },
      orderBy: [{ itemKey: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => ExerciseItemTargetMapper.toDomain(row));
  }

  async replaceForItem(
    exerciseId: string,
    itemKey: string | null,
    targets: ExerciseItemTarget[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.exerciseItemTarget.deleteMany({ where: { exerciseId, itemKey } });
      if (targets.length > 0) {
        await tx.exerciseItemTarget.createMany({
          data: targets.map((target) => ExerciseItemTargetMapper.toCreateData(target)),
        });
      }
    });
  }

  /**
   * Two lookups rather than one join: the atom id is polymorphic and carries no foreign key,
   * so there is nothing to join on. Retired atoms and soft-deleted words are left out, which
   * is what makes a target pointing at one report as broken.
   */
  async describeAtoms(
    refs: Array<{ atomType: string; atomId: string }>,
  ): Promise<AtomDescriptor[]> {
    // The refs arrive as plain strings — they come off the wire and out of the target rows —
    // so the comparison is against the enum's values rather than its members.
    const GRAMMAR: string = AtomType.GRAMMAR_RULE_ATOM;
    const VOCABULARY: string = AtomType.VOCABULARY_ITEM;

    const grammarIds = refs.filter((ref) => ref.atomType === GRAMMAR).map((ref) => ref.atomId);
    const vocabularyIds = refs
      .filter((ref) => ref.atomType === VOCABULARY)
      .map((ref) => ref.atomId);

    const [grammarAtoms, vocabularyItems] = await Promise.all([
      grammarIds.length === 0
        ? Promise.resolve([])
        : this.prisma.grammarRuleAtom.findMany({
            where: { id: { in: grammarIds }, deletedAt: null },
            select: { id: true, title: true, track: true, grammarRuleId: true },
          }),
      vocabularyIds.length === 0
        ? Promise.resolve([])
        : this.prisma.vocabularyItem.findMany({
            where: { id: { in: vocabularyIds }, deletedAt: null },
            select: { id: true, word: true },
          }),
    ]);

    return [
      ...grammarAtoms.map((atom) => ({
        atomType: GRAMMAR,
        atomId: atom.id,
        title: atom.title,
        track: atom.track === 'LEXIS' ? 'lexis' : 'grammar',
        parentId: atom.grammarRuleId,
      })),
      ...vocabularyItems.map((item) => ({
        atomType: VOCABULARY,
        atomId: item.id,
        title: item.word,
        // A word is lexis by definition — there is no column to read, and no case where it
        // would say otherwise.
        track: 'lexis',
        parentId: null,
      })),
    ];
  }
}
