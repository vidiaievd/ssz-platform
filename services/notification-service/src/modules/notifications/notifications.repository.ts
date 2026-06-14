import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { NotificationStatus, NotificationType, NotificationChannel } from '../../../generated/prisma/enums.js';

export interface InAppFeedOptions {
  recipientId: string;
  cursor?: string;
  limit: number;
}

export interface CreateNotificationData {
  type: NotificationType;
  channel: NotificationChannel;
  recipientId: string;
  recipientEmail?: string;
  subject?: string;
  templateKey: string;
  templateData?: Record<string, unknown>;
}

export interface UpdateNotificationData {
  status?: NotificationStatus;
  attempts?: number;
  lastError?: string | null;
  sentAt?: Date | null;
}

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateNotificationData) {
    return this.prisma.notification.create({
      data: {
        type: data.type,
        channel: data.channel,
        recipientId: data.recipientId,
        recipientEmail: data.recipientEmail,
        subject: data.subject,
        templateKey: data.templateKey,
        templateData: (data.templateData ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.notification.findUnique({ where: { id } });
  }

  async update(id: string, data: UpdateNotificationData) {
    return this.prisma.notification.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  async incrementAttempts(id: string) {
    return this.prisma.notification.update({
      where: { id },
      data: { attempts: { increment: 1 }, updatedAt: new Date() },
    });
  }

  async listInApp(opts: InAppFeedOptions) {
    // Cast to any: isRead/readAt exist after migration but Prisma client needs regeneration.
    const prismaAny = this.prisma;
    return prismaAny.notification.findMany({
      where: {
        recipientId: opts.recipientId,
        channel: 'IN_APP',
        ...(opts.cursor ? { id: { lt: opts.cursor } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: opts.limit,
      select: {
        id: true,
        type: true,
        templateData: true,
        isRead: true,
        createdAt: true,
      },
    });
  }

  async countUnread(recipientId: string): Promise<number> {
    const prismaAny = this.prisma;
    return prismaAny.notification.count({
      where: { recipientId, channel: 'IN_APP', isRead: false },
    });
  }

  async markRead(id: string, recipientId: string): Promise<void> {
    const prismaAny = this.prisma;
    await prismaAny.notification.updateMany({
      where: { id, recipientId, isRead: false },
      data: { isRead: true, readAt: new Date(), updatedAt: new Date() },
    });
  }

  async markAllRead(recipientId: string): Promise<void> {
    const prismaAny = this.prisma;
    await prismaAny.notification.updateMany({
      where: { recipientId, channel: 'IN_APP', isRead: false },
      data: { isRead: true, readAt: new Date(), updatedAt: new Date() },
    });
  }
}
