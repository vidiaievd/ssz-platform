import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { IGrammarRuleQuickCheckRepository } from '../../domain/repositories/grammar-rule-quick-check.repository.interface.js';
import { GrammarRuleQuickCheckEntity } from '../../domain/entities/grammar-rule-quick-check.entity.js';
import { GrammarRuleQuickCheckMapper } from './mappers/grammar-rule-quick-check.mapper.js';

@Injectable()
export class PrismaGrammarRuleQuickCheckRepository implements IGrammarRuleQuickCheckRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByExplanationId(explanationId: string): Promise<GrammarRuleQuickCheckEntity | null> {
    const raw = await this.prisma.grammarRuleQuickCheck.findUnique({
      where: { explanationId },
    });
    return raw ? GrammarRuleQuickCheckMapper.toDomain(raw) : null;
  }

  async upsertForExplanation(
    explanationId: string,
    entity: GrammarRuleQuickCheckEntity | null,
  ): Promise<GrammarRuleQuickCheckEntity | null> {
    if (entity === null) {
      await this.prisma.grammarRuleQuickCheck.deleteMany({ where: { explanationId } });
      return null;
    }

    const data = GrammarRuleQuickCheckMapper.toData(entity);
    const raw = await this.prisma.grammarRuleQuickCheck.upsert({
      where: { explanationId },
      create: data,
      update: {
        question: data.question,
        options: data.options,
        correctOptionIndex: data.correctOptionIndex,
        explanation: data.explanation,
        updatedAt: data.updatedAt,
      },
    });

    return GrammarRuleQuickCheckMapper.toDomain(raw);
  }
}
