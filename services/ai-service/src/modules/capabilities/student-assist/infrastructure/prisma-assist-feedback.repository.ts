import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AI_EVENT_TYPES, EXCHANGES, type AiAssistFeedbackEvent } from '@ssz/contracts';
import { Prisma } from '../../../../../generated/prisma/client.js';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { AnsweredCall, AssistFeedbackToSave, IAssistFeedbackRepository } from '../application/ports/assist-feedback.repository.js';

/** The mark and its `ai.assist.feedback` outbox row, in one transaction. */
@Injectable()
export class PrismaAssistFeedbackRepository implements IAssistFeedbackRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCall(callId: string): Promise<AnsweredCall | null> {
    const row = await this.prisma.aiCall.findUnique({
      where: { id: callId },
      select: { id: true, capability: true, actorUserId: true, outcome: true, modelId: true, promptVersion: true, createdAt: true },
    });
    if (!row) return null;
    return {
      callId: row.id,
      capability: row.capability,
      actorUserId: row.actorUserId,
      outcome: row.outcome,
      modelId: row.modelId,
      promptVersion: row.promptVersion,
      createdAt: row.createdAt,
    };
  }

  async save(feedback: AssistFeedbackToSave): Promise<'saved' | 'duplicate'> {
    const event = toEvent(feedback);
    try {
      await this.prisma.$transaction([
        this.prisma.assistFeedback.create({
          data: {
            callId: feedback.call.callId,
            userId: feedback.userId,
            helpful: feedback.helpful,
            reason: feedback.reason,
            createdAt: feedback.at,
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
            occurredAt: feedback.at,
          },
        }),
      ]);
      return 'saved';
    } catch (err) {
      // The only unique key a fresh outbox id leaves is the mark's own `call_id`.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return 'duplicate';
      throw err;
    }
  }
}

function toEvent(feedback: AssistFeedbackToSave): AiAssistFeedbackEvent {
  return {
    eventId: randomUUID(),
    eventType: AI_EVENT_TYPES.ASSIST_FEEDBACK,
    eventVersion: '1.0',
    occurredAt: feedback.at.toISOString(),
    source: 'ai-service',
    payload: {
      capability: feedback.call.capability,
      modelId: feedback.call.modelId,
      promptVersion: feedback.call.promptVersion,
      helpful: feedback.helpful,
      reasonGiven: feedback.reason !== null,
      answeredAt: feedback.call.createdAt.toISOString(),
    },
  };
}
