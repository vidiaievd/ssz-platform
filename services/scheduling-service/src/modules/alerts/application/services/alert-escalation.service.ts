import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { SchedulingEventPublisherService } from '../../../../infrastructure/messaging/scheduling-event-publisher.service.js';
import { SCHEDULING_EVENT_TYPES } from '@ssz/contracts';

@Injectable()
export class AlertEscalationService {
  private readonly logger = new Logger(AlertEscalationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: SchedulingEventPublisherService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkOverloadEscalation(): Promise<void> {
    const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const alerts = await this.prisma.alert.findMany({
      where: {
        kind: 'overload',
        status: 'raised',
        occurredAt: { lt: threshold },
      },
    });

    for (const alert of alerts) {
      try {
        await this.publisher.publish(SCHEDULING_EVENT_TYPES.ALERT_RAISED, {
          alertId: alert.id,
          schoolId: alert.schoolId,
          kind: alert.kind,
          severity: 'danger',
          entityType: alert.entityType,
          entityId: alert.entityId,
          escalated: true,
          occurredAt: alert.occurredAt.toISOString(),
        });
        this.logger.log(`Escalated overload alert ${alert.id}`);
      } catch (err) {
        this.logger.error(`Failed to escalate alert ${alert.id}: ${String(err)}`);
      }
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async checkVacancyEscalation(): Promise<void> {
    const threshold = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const alerts = await this.prisma.alert.findMany({
      where: {
        kind: 'vacancy',
        status: 'raised',
        occurredAt: { lt: threshold },
      },
    });

    for (const alert of alerts) {
      try {
        await this.publisher.publish(SCHEDULING_EVENT_TYPES.ALERT_RAISED, {
          alertId: alert.id,
          schoolId: alert.schoolId,
          kind: alert.kind,
          severity: 'danger',
          entityType: alert.entityType,
          entityId: alert.entityId,
          escalated: true,
          occurredAt: alert.occurredAt.toISOString(),
        });
        this.logger.log(`Escalated vacancy alert ${alert.id}`);
      } catch (err) {
        this.logger.error(`Failed to escalate alert ${alert.id}: ${String(err)}`);
      }
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async checkUncoveredLessons(): Promise<void> {
    const now = new Date();
    const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Find lessons within next 24h that still have open substitute requests
    const requests = await this.prisma.substituteRequest.findMany({
      where: {
        status: 'open',
        lesson: { date: { gte: now, lte: horizon } },
      },
      include: { lesson: true },
    });

    for (const req of requests) {
      try {
        const existingAlert = await this.prisma.alert.findFirst({
          where: {
            schoolId: req.schoolId,
            kind: 'uncovered',
            entityType: 'lesson',
            entityId: req.lessonId,
            status: { not: 'resolved' },
          },
        });

        if (!existingAlert) {
          const alert = await this.prisma.alert.create({
            data: {
              schoolId: req.schoolId,
              kind: 'uncovered',
              severity: 'danger',
              entityType: 'lesson',
              entityId: req.lessonId,
              payload: { requestId: req.id, lessonDate: req.lesson.date.toISOString() },
              status: 'raised',
              occurredAt: now,
            },
          });

          await this.publisher.publish(SCHEDULING_EVENT_TYPES.ALERT_RAISED, {
            alertId: alert.id,
            schoolId: alert.schoolId,
            kind: alert.kind,
            severity: 'danger',
            entityType: 'lesson',
            entityId: req.lessonId,
            occurredAt: now.toISOString(),
          });
        }
      } catch (err) {
        this.logger.error(`Uncovered-lesson check failed for request ${req.id}: ${String(err)}`);
      }
    }
  }
}
