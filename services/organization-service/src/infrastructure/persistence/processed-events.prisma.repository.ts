import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { IProcessedEventsRepository } from '../../shared/application/ports/processed-events.repository.interface.js';

@Injectable()
export class ProcessedEventsPrismaRepository implements IProcessedEventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async isProcessed(eventId: string): Promise<boolean> {
    const row = await (this.prisma as any).processedEvent.findUnique({
      where: { eventId },
    });
    return row !== null;
  }

  async markProcessed(eventId: string, eventType: string): Promise<void> {
    await (this.prisma as any).processedEvent.create({
      data: { eventId, eventType },
    });
  }
}
