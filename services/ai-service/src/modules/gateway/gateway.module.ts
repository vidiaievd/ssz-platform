import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { ProvidersModule } from '../providers/providers.module.js';
import { RegistryModule } from '../registry/registry.module.js';
import { AiGateway } from './application/ai-gateway.js';
import { ModelCaller } from './application/model-caller.js';
import { ModelRouter } from './application/model-router.js';
import { CIRCUIT_BREAKER } from './application/ports/circuit-breaker.port.js';
import { RedisCircuitBreaker } from './infrastructure/redis-circuit-breaker.js';

/**
 * The one path from an agent to a model: `AiGateway` — gate, router, ledger. `ModelCaller`
 * is the admin's side door to one named model, for measuring a candidate (plan 79, 1.6).
 */
@Module({
  imports: [ProvidersModule, RegistryModule, LedgerModule, AccessModule],
  providers: [AiGateway, ModelRouter, ModelCaller, { provide: CIRCUIT_BREAKER, useClass: RedisCircuitBreaker }],
  exports: [AiGateway, ModelCaller],
})
export class GatewayModule {}
