import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import {
  IGrammarRuleAtomRepository,
  GRAMMAR_RULE_ATOM_REPOSITORY,
} from '../../domain/repositories/grammar-rule-atom.repository.interface.js';
import { GrammarRuleAtom } from '../../domain/entities/grammar-rule-atom.entity.js';
import { GrammarRuleAtomMapper } from './mappers/grammar-rule-atom.mapper.js';

export { GRAMMAR_RULE_ATOM_REPOSITORY };

// Reorder moves every row this far out of the way before placing it, so a swap cannot
// collide with the partial unique index on (rule, position) mid-transaction. Same strategy
// and same constant as the exercise pool.
const REORDER_OFFSET = 10000;

@Injectable()
export class PrismaGrammarRuleAtomRepository implements IGrammarRuleAtomRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByRuleId(ruleId: string): Promise<GrammarRuleAtom[]> {
    const rows = await this.prisma.grammarRuleAtom.findMany({
      where: { grammarRuleId: ruleId, deletedAt: null },
      orderBy: { position: 'asc' },
    });
    return rows.map((row) => GrammarRuleAtomMapper.toDomain(row));
  }

  async findById(atomId: string): Promise<GrammarRuleAtom | null> {
    const raw = await this.prisma.grammarRuleAtom.findUnique({ where: { id: atomId } });
    return raw ? GrammarRuleAtomMapper.toDomain(raw) : null;
  }

  async findByKey(ruleId: string, key: string): Promise<GrammarRuleAtom | null> {
    const raw = await this.prisma.grammarRuleAtom.findFirst({
      where: { grammarRuleId: ruleId, key, deletedAt: null },
    });
    return raw ? GrammarRuleAtomMapper.toDomain(raw) : null;
  }

  async save(atom: GrammarRuleAtom): Promise<GrammarRuleAtom> {
    const exists = await this.prisma.grammarRuleAtom.findUnique({
      where: { id: atom.id },
      select: { id: true },
    });

    const raw = exists
      ? await this.prisma.grammarRuleAtom.update({
          where: { id: atom.id },
          data: GrammarRuleAtomMapper.toUpdateData(atom),
        })
      : await this.prisma.grammarRuleAtom.create({
          data: GrammarRuleAtomMapper.toCreateData(atom),
        });

    return GrammarRuleAtomMapper.toDomain(raw);
  }

  async softDeleteByRuleId(ruleId: string): Promise<number> {
    const result = await this.prisma.grammarRuleAtom.updateMany({
      where: { grammarRuleId: ruleId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count;
  }

  /** -1 when the rule has no living atoms, so the first one lands at position 0. */
  async getMaxPosition(ruleId: string): Promise<number> {
    const result = await this.prisma.grammarRuleAtom.aggregate({
      where: { grammarRuleId: ruleId, deletedAt: null },
      _max: { position: true },
    });
    return result._max.position ?? -1;
  }

  async reorder(ruleId: string, items: Array<{ atomId: string; position: number }>): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        await tx.grammarRuleAtom.update({
          where: { id: item.atomId, grammarRuleId: ruleId },
          data: { position: item.position + REORDER_OFFSET },
        });
      }
      for (const item of items) {
        await tx.grammarRuleAtom.update({
          where: { id: item.atomId, grammarRuleId: ruleId },
          data: { position: item.position },
        });
      }
    });
  }
}
