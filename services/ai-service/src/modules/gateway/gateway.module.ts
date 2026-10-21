import { Module } from '@nestjs/common';
import { ProvidersModule } from '../providers/providers.module.js';
import { RegistryModule } from '../registry/registry.module.js';
import { ModelRouter } from './application/model-router.js';
import { CIRCUIT_BREAKER } from './application/ports/circuit-breaker.port.js';
import { RedisCircuitBreaker } from './infrastructure/redis-circuit-breaker.js';

/** The one path from an agent to a model. Gate (step 9) and ledger (step 8) join it here. */
@Module({
  imports: [ProvidersModule, RegistryModule],
  providers: [ModelRouter, { provide: CIRCUIT_BREAKER, useClass: RedisCircuitBreaker }],
  exports: [ModelRouter],
})
export class GatewayModule {}
