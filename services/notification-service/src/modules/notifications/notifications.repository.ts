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

  /**
   * One page of the feed, newest first. The cursor is the last row's id, as before; the page
   * after it is read by (createdAt, id), the order the feed is in. Paging by `id < cursor`
   * alone (until VoxOrd plan 06, step 6e) compared random uuids and skipped or repeated rows.
   * A cursor that is not one of the reader's rows — deleted since, or someone else's — ends
   * the feed rather than restarting it.
   */
  async listInApp(opts: InAppFeedOptions) {
    const filter = opts.filter ?? 'all';
    let after = {};
    if (opts.cursor) {
      const last = await this.prisma.notification.findFirst({
        where: { id: opts.cursor, recipientId: opts.recipientId },
        select: { id: true, createdAt: true },
      });
      if (!last) return [];
      after = {
        OR: [
          { createdAt: { lt: last.createdAt } },
          { createdAt: last.createdAt, id: { lt: last.id } },
        ],
      };
    }
    return this.prisma.notification.findMany({
      where: {
        recipientId: opts.recipientId,
        channel: 'IN_APP',
        ...(filter === 'archived' ? { archivedAt: { not: null } } : { archivedAt: null }),
        ...(filter === 'unread' ? { isRead: false } : {}),
        ...(opts.type ? { type: opts.type } : {}),
        ...after,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

  /** `before`: only what was created at or before it, so a later arrival stays unread. */
  async markAllRead(recipientId: string, before?: Date): Promise<void> {
    await this.prisma.notification.updateMany({
      where: {
        recipientId,
        channel: 'IN_APP',
        isRead: false,
        archivedAt: null,
        ...(before ? { createdAt: { lte: before } } : {}),
      },
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

  /** Archives every ENROLLMENT_REQUEST notification for a membership, regardless of recipient — a request handled in one surface must clear its badge everywhere. */
  async archiveByMembershipId(membershipId: string): Promise<void> {
    const now = new Date();
    await this.prisma.notification.updateMany({
      where: {
        type: 'ENROLLMENT_REQUEST',
        archivedAt: null,
        templateData: { path: ['membershipId'], equals: membershipId },
      },
      data: { archivedAt: now, isRead: true, readAt: now, updatedAt: now },
    });
  }

  /**
   * Everything kept about a deleted account (VoxOrd plan 07, step 3c): its feed and e-mail log —
   * also mail sent to the address before it had an account, e.g. an invitation — and the
   * bookkeeping rows of the reminder, digest and term-warning jobs. One transaction.
   */
  async eraseUser(userId: string, email: string | null): Promise<{ notifications: number }> {
    const recipient = email
      ? { OR: [{ recipientId: userId }, { recipientEmail: { equals: email, mode: 'insensitive' as const } }] }
      : { recipientId: userId };
    const [notifications] = await this.prisma.$transaction([
      this.prisma.notification.deleteMany({ where: recipient }),
      this.prisma.reviewDigestState.deleteMany({ where: { userId } }),
      this.prisma.lessonReminder.deleteMany({ where: { userId } }),
      this.prisma.reviewTermWarning.deleteMany({ where: { userId } }),
    ]);
    return { notifications: notifications.count };
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
