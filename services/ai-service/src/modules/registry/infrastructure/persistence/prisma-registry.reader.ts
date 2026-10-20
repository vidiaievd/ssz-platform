import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  IRegistryReader,
  ModelWithCurrentPrice,
  ProviderWithModelCount,
} from '../../application/ports/registry.reader.js';
import type { AiModelPrice } from '../../domain/registry.types.js';
import { toModel, toPrice, toProvider } from './registry.mapper.js';

@Injectable()
export class PrismaRegistryReader implements IRegistryReader {
  constructor(private readonly prisma: PrismaService) {}

  async listProviders(): Promise<ProviderWithModelCount[]> {
    const rows = await this.prisma.aiProvider.findMany({
      orderBy: { code: 'asc' },
      include: { _count: { select: { models: true } } },
    });
    return rows.map((row) => ({ ...toProvider(row), modelCount: row._count.models }));
  }

  async listModels(filter: { providerId?: string }, at: Date): Promise<ModelWithCurrentPrice[]> {
    const rows = await this.prisma.aiModel.findMany({
      where: filter.providerId ? { providerId: filter.providerId } : undefined,
      orderBy: [{ provider: { code: 'asc' } }, { providerModelId: 'asc' }],
      include: {
        provider: { select: { code: true } },
        prices: { where: { effectiveFrom: { lte: at } }, orderBy: { effectiveFrom: 'desc' }, take: 1 },
      },
    });
    return rows.map((row) => ({
      ...toModel(row),
      currentPrice: row.prices[0] ? toPrice(row.prices[0]) : null,
    }));
  }

  async listPrices(modelId: string): Promise<AiModelPrice[] | null> {
    const model = await this.prisma.aiModel.findUnique({
      where: { id: modelId },
      include: { prices: { orderBy: { effectiveFrom: 'desc' } } },
    });
    return model ? model.prices.map(toPrice) : null;
  }
}
