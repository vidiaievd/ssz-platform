import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { ProvidersModule } from '../providers/providers.module.js';
import { RegistryModule } from '../registry/registry.module.js';
import { AiGateway } from './application/ai-gateway.js';
import { ModelRouter } from './application/model-router.js';
import { CIRCUIT_BREAKER } from './application/ports/circuit-breaker.port.js';
import { RedisCircuitBreaker } from './infrastructure/redis-circuit-breaker.js';

/** The one path from an agent to a model: `AiGateway` — gate, router, ledger. */
@Module({
  imports: [ProvidersModule, RegistryModule, LedgerModule, AccessModule],
  providers: [AiGateway, ModelRouter, { provide: CIRCUIT_BREAKER, useClass: RedisCircuitBreaker }],
  exports: [AiGateway],
})
export class GatewayModule {}
