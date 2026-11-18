import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { ProvidersModule } from '../providers/providers.module.js';
import { RegistryModule } from '../registry/registry.module.js';
import { AiGateway } from './application/ai-gateway.js';
import { ModelCaller } from './application/model-caller.js';
import { ModelRouter } from './application/model-router.js';
import { BreakerBoard } from './application/breaker-board.js';
import { ResetBreakerHandler } from './application/commands/reset-breaker/reset-breaker.handler.js';
import { BREAKER_INSPECTOR } from './application/ports/breaker-inspector.port.js';
import { CIRCUIT_BREAKER } from './application/ports/circuit-breaker.port.js';
import { ListBreakersHandler } from './application/queries/list-breakers/list-breakers.handler.js';
import { RedisCircuitBreaker } from './infrastructure/redis-circuit-breaker.js';
import { PrismaAdminAuditRecorder } from '../../infrastructure/audit/prisma-admin-audit.recorder.js';
import { ADMIN_AUDIT_RECORDER } from '../../shared/application/admin-audit.js';
import { AdminBreakersController } from './presentation/controllers/admin-breakers.controller.js';

/**
 * The one path from an agent to a model: `AiGateway` — gate, router, ledger. `ModelCaller`
 * is the admin's side door to one named model, for measuring a candidate (plan 79, 1.6).
 * The admin's breaker board (plan 90, phase 7, step 8) reads the same breaker the router uses.
 */
@Module({
  imports: [ProvidersModule, RegistryModule, LedgerModule, AccessModule],
  controllers: [AdminBreakersController],
  providers: [
    AiGateway,
    ModelRouter,
    ModelCaller,
    RedisCircuitBreaker,
    { provide: CIRCUIT_BREAKER, useExisting: RedisCircuitBreaker },
    { provide: BREAKER_INSPECTOR, useExisting: RedisCircuitBreaker },
    { provide: ADMIN_AUDIT_RECORDER, useClass: PrismaAdminAuditRecorder },
    BreakerBoard,
    ListBreakersHandler,
    ResetBreakerHandler,
  ],
  exports: [AiGateway, ModelCaller],
})
export class GatewayModule {}
