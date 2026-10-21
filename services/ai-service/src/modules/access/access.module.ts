import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';
import { AccessGate } from './application/access-gate.js';
import { PutPayerPolicyHandler } from './application/commands/put-payer-policy/put-payer-policy.handler.js';
import { ENTITLEMENT_READER } from './application/ports/entitlement.reader.js';
import { PAYER_POLICY_REPOSITORY } from './application/ports/payer-policy.repository.js';
import { GetPayerPolicyHandler } from './application/queries/get-payer-policy/get-payer-policy.handler.js';
import { PrismaPayerPolicyRepository } from './infrastructure/prisma-payer-policy.repository.js';
import { AllEnabledEntitlementReader, NoEntitlementReader } from './infrastructure/stub-entitlement.readers.js';
import { AdminPayerPoliciesController } from './presentation/admin-payer-policies.controller.js';

/**
 * Who may call which agent, and where the data may go: payer policies (here) and the
 * tariff (plan 78; until then a stub picked by AI_ENTITLEMENTS_STUB). The gateway asks
 * `AccessGate` before the router.
 */
@Module({
  controllers: [AdminPayerPoliciesController],
  providers: [
    AccessGate,
    GetPayerPolicyHandler,
    PutPayerPolicyHandler,
    { provide: PAYER_POLICY_REPOSITORY, useClass: PrismaPayerPolicyRepository },
    {
      provide: ENTITLEMENT_READER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => {
        if (config.get<boolean>('entitlementsStub')) {
          new Logger('AccessModule').warn('AI_ENTITLEMENTS_STUB is on: every payer is entitled to every agent, no quotas');
          return new AllEnabledEntitlementReader();
        }
        return new NoEntitlementReader();
      },
    },
  ],
  exports: [AccessGate],
})
export class AccessModule {}
