import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  AtomDescriptor,
  CandidateAtoms,
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
   * Everything already known about what this exercise practises, from three places that were
   * filled long before targets existed: the two `PRACTICED_BY` relation kinds and the rule's
   * exercise pool. Roughly half the seeded catalogue answers something here, which is what
   * makes addressing it a matter of confirming suggestions rather than typing.
   */
  async findCandidateAtoms(exerciseId: string): Promise<CandidateAtoms> {
    const relations = await this.prisma.contentRelation.findMany({
      where: {
        targetType: 'EXERCISE',
        targetId: exerciseId,
        relationKind: 'PRACTICED_BY',
        sourceType: { in: ['VOCABULARY_ITEM', 'GRAMMAR_RULE'] },
      },
      select: { sourceType: true, sourceId: true },
    });

    const wordIds = relations
      .filter((relation) => relation.sourceType === 'VOCABULARY_ITEM')
      .map((relation) => relation.sourceId);
    const ruleIdsFromRelations = relations
      .filter((relation) => relation.sourceType === 'GRAMMAR_RULE')
      .map((relation) => relation.sourceId);

    // The pool says the same thing in a second vocabulary, and a rule can be in one without
    // the relation having been written. Both are read, and the union is what counts.
    const poolEntries = await this.prisma.grammarRuleExercisePool.findMany({
      where: { exerciseId },
      select: { grammarRuleId: true },
    });
    const ruleIds = [
      ...new Set([...ruleIdsFromRelations, ...poolEntries.map((entry) => entry.grammarRuleId)]),
    ];

    type RuleWithAtoms = {
      id: string;
      title: string;
      atoms: Array<{ id: string; title: string; track: string }>;
    };

    const [words, rules] = await Promise.all([
      wordIds.length === 0
        ? Promise.resolve([] as Array<{ id: string; word: string }>)
        : this.prisma.vocabularyItem.findMany({
            where: { id: { in: wordIds }, deletedAt: null },
            select: { id: true, word: true },
          }),
      ruleIds.length === 0
        ? Promise.resolve([] as RuleWithAtoms[])
        : this.prisma.grammarRule.findMany({
            where: { id: { in: ruleIds }, deletedAt: null },
            select: {
              id: true,
              title: true,
              atoms: {
                where: { deletedAt: null },
                orderBy: { position: 'asc' },
                select: { id: true, title: true, track: true },
              },
            },
          }),
    ]);

    return {
      words: words.map((item) => ({ atomId: item.id, word: item.word })),
      grammarAtoms: rules.flatMap((rule) =>
        rule.atoms.map((atom) => ({
          atomId: atom.id,
          title: atom.title,
          ruleId: rule.id,
          track: atom.track === 'LEXIS' ? 'lexis' : 'grammar',
        })),
      ),
      // Named rather than dropped: "this exercise practises a rule nobody has cut into atoms"
      // is the one thing an author can act on, and an empty suggestion list would hide it.
      rulesWithoutAtoms: rules
        .filter((rule) => rule.atoms.length === 0)
        .map((rule) => ({ ruleId: rule.id, title: rule.title })),
    };
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
