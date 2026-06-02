import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { ArchivedEventDto, ReplayEventsResponseDto } from '../dto/replay-events.dto.js';
import { ReplayEventsQuery } from './replay-events.query.js';

@QueryHandler(ReplayEventsQuery)
export class ReplayEventsHandler implements IQueryHandler<ReplayEventsQuery, ReplayEventsResponseDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: ReplayEventsQuery): Promise<ReplayEventsResponseDto> {
    const { fromSeq, types, limit } = query;

    const events = await this.prisma.eventArchive.findMany({
      where: {
        sequence: { gt: fromSeq },
        ...(types.length > 0 ? { eventType: { in: types } } : {}),
      },
      orderBy: { sequence: 'asc' },
      take: limit,
    });

    const dtos: ArchivedEventDto[] = events.map((e) => ({
      id: e.id,
      sequence: e.sequence.toString(),
      eventId: e.eventId,
      eventType: e.eventType,
      exchange: e.exchange,
      routingKey: e.routingKey,
      source: e.source,
      payload: e.payload,
      occurredAt: e.occurredAt.toISOString(),
      archivedAt: e.archivedAt.toISOString(),
    }));

    const lastSeq = events.length > 0 ? events[events.length - 1].sequence.toString() : null;
    const hasMore = events.length === limit;

    return {
      events: dtos,
      nextSeq: hasMore ? lastSeq : null,
      total: events.length,
    };
  }
}
