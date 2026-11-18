import { Inject, Logger } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import type { Payer } from '../../../domain/payer.js';
import { FeatureUsage, type AiUsage } from '../../feature-usage.js';
import { ENTITLEMENT_READER, type IEntitlementReader } from '../../ports/entitlement.reader.js';
import { GetMyUsageQuery } from './get-my-usage.query.js';

export type { AiUsage } from '../../feature-usage.js';

export type MyUsage =
  | { kind: 'usage'; usage: AiUsage }
  /** The learner's plan does not carry the key, or carries it switched off. */
  | { kind: 'not_entitled' }
  /** The tariff or the ledger could not be read. */
  | { kind: 'unavailable' };

/**
 * The learner's own account only (payer `user`) — what a school pays for is the school's to
 * read. How `used` is counted: `FeatureUsage`.
 */
@QueryHandler(GetMyUsageQuery)
export class GetMyUsageHandler implements IQueryHandler<GetMyUsageQuery, MyUsage> {
  private readonly logger = new Logger(GetMyUsageHandler.name);

  constructor(
    @Inject(ENTITLEMENT_READER) private readonly entitlements: IEntitlementReader,
    private readonly usage: FeatureUsage,
  ) {}

  async execute({ userId, featureKey }: GetMyUsageQuery): Promise<MyUsage> {
    const payer: Payer = { type: 'user', id: userId };
    try {
      const feature = await this.entitlements.getFeature(payer, featureKey);
      if (!feature?.enabled) return { kind: 'not_entitled' };
      return { kind: 'usage', usage: await this.usage.read(payer, featureKey, feature) };
    } catch (err) {
      this.logger.warn({ err, featureKey, userId }, 'Usage of the learner unreadable');
      return { kind: 'unavailable' };
    }
  }
}
