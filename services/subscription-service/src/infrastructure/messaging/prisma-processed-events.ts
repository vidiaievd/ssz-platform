import { Injectable } from '@nestjs/common';
import type { IProcessedEvents } from '../../shared/application/ports/processed-events.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class PrismaProcessedEvents implements IProcessedEvents {
  constructor(private readonly prisma: PrismaService) {}

  async isProcessed(eventId: string): Promise<boolean> {
    return (await this.prisma.processedEvent.findUnique({ where: { eventId } })) !== null;
  }

  async markProcessed(eventId: string, eventType: string): Promise<void> {
    await this.prisma.processedEvent.createMany({ data: [{ eventId, eventType }], skipDuplicates: true });
  }
}
