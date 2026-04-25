import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { NotificationStatus, NotificationType, NotificationChannel } from '../../../generated/prisma/enums.js';

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
}
