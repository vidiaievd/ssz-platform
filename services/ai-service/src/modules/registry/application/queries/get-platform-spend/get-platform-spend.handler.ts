import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { buildPlatformSpend, type PlatformSpend } from '../../../domain/platform-spend.js';
import { BINDING_REPOSITORY, type IBindingRepository } from '../../ports/binding.repository.js';
import { REGISTRY_READER, type IRegistryReader } from '../../ports/registry.reader.js';
import { SPEND_READER, type ISpendReader } from '../../ports/spend.reader.js';
import { GetPlatformSpendQuery } from './get-platform-spend.query.js';

/**
 * The platform's AI spend per model for a period (plan 90, phase 7, step 2): the ledger grouped by
 * day, model and capability, named from the registry, with the models bound now listed even when idle.
 */
@QueryHandler(GetPlatformSpendQuery)
export class GetPlatformSpendHandler implements IQueryHandler<GetPlatformSpendQuery, PlatformSpend> {
  constructor(
    @Inject(SPEND_READER) private readonly spend: ISpendReader,
    @Inject(REGISTRY_READER) private readonly registry: IRegistryReader,
    @Inject(BINDING_REPOSITORY) private readonly bindings: IBindingRepository,
  ) {}

  async execute({ period }: GetPlatformSpendQuery): Promise<PlatformSpend> {
    const [rows, models, providers, bindings] = await Promise.all([
      this.spend.rows(period.start, period.end),
      this.registry.listModels({}, new Date()),
      this.registry.listProviders(),
      this.bindings.list(),
    ]);
    return buildPlatformSpend(period, rows, { models, providers, bindings });
  }
}
