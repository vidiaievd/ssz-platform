import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { NotificationStatus, NotificationType, NotificationChannel } from '../../../generated/prisma/enums.js';

export type InAppFeedFilter = 'all' | 'unread' | 'archived';

export interface InAppFeedOptions {
  recipientId: string;
  cursor?: string;
  limit: number;
  filter?: InAppFeedFilter;
  type?: NotificationType;
}

export type BulkNotificationAction = 'read' | 'unread' | 'archive' | 'unarchive' | 'delete';

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
    const filter = opts.filter ?? 'all';
    return this.prisma.notification.findMany({
      where: {
        recipientId: opts.recipientId,
        channel: 'IN_APP',
        ...(filter === 'archived' ? { archivedAt: { not: null } } : { archivedAt: null }),
        ...(filter === 'unread' ? { isRead: false } : {}),
        ...(opts.type ? { type: opts.type } : {}),
        ...(opts.cursor ? { id: { lt: opts.cursor } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: opts.limit,
      select: {
        id: true,
        type: true,
        templateData: true,
        isRead: true,
        archivedAt: true,
        createdAt: true,
      },
    });
  }

  async countUnread(recipientId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { recipientId, channel: 'IN_APP', isRead: false, archivedAt: null },
    });
  }

  async markRead(id: string, recipientId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, recipientId, isRead: false },
      data: { isRead: true, readAt: new Date(), updatedAt: new Date() },
    });
  }

  async markAllRead(recipientId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { recipientId, channel: 'IN_APP', isRead: false, archivedAt: null },
      data: { isRead: true, readAt: new Date(), updatedAt: new Date() },
    });
  }

  async markUnread(id: string, recipientId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, recipientId, isRead: true },
      data: { isRead: false, readAt: null, updatedAt: new Date() },
    });
  }

  async archive(id: string, recipientId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, recipientId, archivedAt: null },
      data: { archivedAt: new Date(), updatedAt: new Date() },
    });
  }

  async unarchive(id: string, recipientId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id, recipientId, archivedAt: { not: null } },
      data: { archivedAt: null, updatedAt: new Date() },
    });
  }

  async delete(id: string, recipientId: string): Promise<void> {
    await this.prisma.notification.deleteMany({
      where: { id, recipientId },
    });
  }

  async bulk(ids: string[], recipientId: string, action: BulkNotificationAction): Promise<void> {
    const where = { id: { in: ids }, recipientId };
    const now = new Date();
    switch (action) {
      case 'read':
        await this.prisma.notification.updateMany({
          where: { ...where, isRead: false },
          data: { isRead: true, readAt: now, updatedAt: now },
        });
        return;
      case 'unread':
        await this.prisma.notification.updateMany({
          where: { ...where, isRead: true },
          data: { isRead: false, readAt: null, updatedAt: now },
        });
        return;
      case 'archive':
        await this.prisma.notification.updateMany({
          where: { ...where, archivedAt: null },
          data: { archivedAt: now, updatedAt: now },
        });
        return;
      case 'unarchive':
        await this.prisma.notification.updateMany({
          where: { ...where, archivedAt: { not: null } },
          data: { archivedAt: null, updatedAt: now },
        });
        return;
      case 'delete':
        await this.prisma.notification.deleteMany({ where });
        return;
    }
  }
}
