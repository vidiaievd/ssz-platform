import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AI_EVENT_TYPES, EXCHANGES, type AiCallCompletedEvent } from '@ssz/contracts';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { IAiCallLedger } from '../application/ports/ai-call.ledger.js';
import type { AiCallRecord } from '../domain/ai-call.js';

/** The ledger row and its `ai.call.completed` outbox row, in one transaction. */
@Injectable()
export class PrismaAiCallLedger implements IAiCallLedger {
  constructor(private readonly prisma: PrismaService) {}

  async record(call: AiCallRecord): Promise<void> {
    const event = toEvent(call);
    await this.prisma.$transaction([
      this.prisma.aiCall.create({
        data: {
          id: call.id,
          capability: call.capability,
          payerType: call.context.payer.type,
          payerId: call.context.payer.id,
          actorUserId: call.context.actor?.userId ?? null,
          actorRole: call.context.actor?.role ?? null,
          surface: call.context.surface,
          providerId: call.model?.providerId ?? null,
          modelId: call.model?.modelId ?? null,
          promptVersion: call.promptVersion,
          inputTokens: call.usage?.input ?? null,
          outputTokens: call.usage?.output ?? null,
          cacheReadTokens: call.usage?.cacheRead ?? null,
          cacheWriteTokens: call.usage?.cacheWrite ?? null,
          costMicros: call.cost ? BigInt(call.cost.micros) : null,
          currency: call.cost?.currency ?? null,
          credits: call.credits,
          latencyMs: call.latencyMs,
          outcome: call.outcome,
          errorCode: call.errorCode,
          fallbackUsed: call.fallbackUsed,
          attempts: call.attempts as object[],
          createdAt: call.createdAt,
        },
      }),
      this.prisma.outbox.create({
        data: {
          id: randomUUID(),
          eventId: event.eventId,
          eventType: event.eventType,
          exchange: EXCHANGES.AI!,
          routingKey: event.eventType,
          payload: JSON.stringify(event),
          correlationId: null,
          occurredAt: new Date(event.occurredAt),
        },
      }),
    ]);
  }
}

function toEvent(call: AiCallRecord): AiCallCompletedEvent {
  return {
    eventId: randomUUID(),
    eventType: AI_EVENT_TYPES.CALL_COMPLETED,
    eventVersion: '1.0',
    occurredAt: new Date().toISOString(),
    source: 'ai-service',
    payload: {
      callId: call.id,
      capability: call.capability,
      payerType: call.context.payer.type,
      payerId: call.context.payer.id,
      actorUserId: call.context.actor?.userId ?? null,
      actorRole: call.context.actor?.role ?? null,
      surface: call.context.surface,
      providerId: call.model?.providerId ?? null,
      providerCode: call.model?.providerCode ?? null,
      modelId: call.model?.modelId ?? null,
      providerModelId: call.model?.providerModelId ?? null,
      promptVersion: call.promptVersion,
      usage: call.usage,
      costMicros: call.cost?.micros ?? null,
      currency: call.cost?.currency ?? null,
      credits: call.credits,
      latencyMs: call.latencyMs,
      outcome: call.outcome,
      errorCode: call.errorCode,
      fallbackUsed: call.fallbackUsed,
      createdAt: call.createdAt.toISOString(),
    },
  };
}
