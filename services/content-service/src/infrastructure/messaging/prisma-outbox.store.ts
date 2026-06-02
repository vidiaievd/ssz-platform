import { Injectable } from '@nestjs/common';
import type { IOutboxStore, OutboxRow } from '@ssz/messaging';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class PrismaOutboxStore implements IOutboxStore {
  constructor(private readonly prisma: PrismaService) {}

  async insertPending(row: Omit<OutboxRow, 'attempts'>): Promise<void> {
    await this.prisma.outbox.create({
      data: {
        id: row.id,
        eventId: row.eventId,
        eventType: row.eventType,
        exchange: row.exchange,
        routingKey: row.routingKey,
        payload: row.payload,
        correlationId: row.correlationId,
        occurredAt: row.occurredAt,
      },
    });
  }

  async fetchPending(limit: number): Promise<OutboxRow[]> {
    const rows = await this.prisma.outbox.findMany({
      where: { publishedAt: null },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      eventId: r.eventId,
      eventType: r.eventType,
      exchange: r.exchange,
      routingKey: r.routingKey,
      payload: r.payload,
      correlationId: r.correlationId,
      occurredAt: r.occurredAt,
      attempts: r.attempts,
    }));
  }

  async markPublished(id: string): Promise<void> {
    await this.prisma.outbox.update({ where: { id }, data: { publishedAt: new Date() } });
  }

  async incrementAttempts(id: string): Promise<void> {
    await this.prisma.outbox.update({ where: { id }, data: { attempts: { increment: 1 } } });
  }
}
