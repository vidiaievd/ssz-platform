import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { InternalController } from './presentation/controllers/internal.controller.js';

// Aggregates service-to-service-only routes (GET /internal/*) behind
// InternalAuthGuard. Query handlers it depends on are registered by their
// owning feature modules (ContentRelationModule, GrammarRuleModule); this
// module only needs CqrsModule for an injectable QueryBus and the controller.
@Module({
  imports: [CqrsModule],
  controllers: [InternalController],
})
export class InternalModule {}
