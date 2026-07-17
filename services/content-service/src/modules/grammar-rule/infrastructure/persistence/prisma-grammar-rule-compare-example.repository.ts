import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { IGrammarRuleCompareExampleRepository } from '../../domain/repositories/grammar-rule-compare-example.repository.interface.js';
import { GrammarRuleCompareExampleEntity } from '../../domain/entities/grammar-rule-compare-example.entity.js';
import { GrammarRuleCompareExampleMapper } from './mappers/grammar-rule-compare-example.mapper.js';

@Injectable()
export class PrismaGrammarRuleCompareExampleRepository
  implements IGrammarRuleCompareExampleRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async findByExplanationId(explanationId: string): Promise<GrammarRuleCompareExampleEntity[]> {
    const rows = await this.prisma.grammarRuleCompareExample.findMany({
      where: { explanationId },
      orderBy: { position: 'asc' },
    });
    return rows.map((row) => GrammarRuleCompareExampleMapper.toDomain(row));
  }

  async replaceForExplanation(
    explanationId: string,
    examples: GrammarRuleCompareExampleEntity[],
  ): Promise<void> {
    const createData = GrammarRuleCompareExampleMapper.toCreateManyData(examples);

    await this.prisma.$transaction([
      this.prisma.grammarRuleCompareExample.deleteMany({
        where: { explanationId },
      }),
      ...(createData.length > 0
        ? [this.prisma.grammarRuleCompareExample.createMany({ data: createData })]
        : []),
    ]);
  }
}
