import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { randomUUID } from 'crypto';
import type { AppConfig } from '../../config/configuration.js';
import { PrismaService } from '../database/prisma.service.js';
import { CONTENT_ENTITLEMENT_REPOSITORY } from '../../modules/entitlement/domain/repositories/content-entitlement.repository.interface.js';
import type { IContentEntitlementRepository } from '../../modules/entitlement/domain/repositories/content-entitlement.repository.interface.js';
import { ContentEntitlementEntity } from '../../modules/entitlement/domain/entities/content-entitlement.entity.js';
import { EntitlementType } from '../../modules/entitlement/domain/value-objects/entitlement-type.vo.js';

const PROCESSOR_ID = 'group-entitlement';
const QUEUE = 'content-service.group-entitlements';
const EXCHANGE = 'organization.events';

const BINDING_KEYS = [
  'school.group.member.added',
  'school.group.member.removed',
  'school.group.archived',
  'school.group.material.added',
  'school.group.material.removed',
] as const;

interface GroupMemberAddedPayload {
  schoolId: string;
  groupId: string;
  userId: string;
  courseId: string | null;
  groupStatus: string;
}

interface GroupMemberRemovedPayload {
  schoolId: string;
  groupId: string;
  userId: string;
  courseId: string | null;
}

interface GroupMaterialAddedPayload {
  schoolId: string;
  groupId: string;
  userId: string;
  courseId: string;
  groupStatus: string;
}

interface GroupMaterialRemovedPayload {
  schoolId: string;
  groupId: string;
  userId: string;
  courseId: string;
}

interface GroupArchivedPayload {
  schoolId: string;
  groupId: string;
}

interface EventEnvelope {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class GroupEntitlementConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GroupEntitlementConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
    @Inject(CONTENT_ENTITLEMENT_REPOSITORY)
    private readonly entitlementRepo: IContentEntitlementRepository,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — GroupEntitlementConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('GroupEntitlementConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`GroupEntitlementConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        for (const key of BINDING_KEYS) {
          await channel.bindQueue(QUEUE, EXCHANGE, key);
        }
        await channel.consume(QUEUE, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`GroupEntitlementConsumer listening on queue "${QUEUE}"`);
      },
    });
  }

  private async handleMessage(channel: ConfirmChannel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    let envelope: EventEnvelope;
    try {
      envelope = JSON.parse(msg.content.toString()) as EventEnvelope;
    } catch {
      this.logger.error('GroupEntitlementConsumer: non-JSON — discarding');
      channel.nack(msg, false, false);
      return;
    }

    const { eventId, eventType } = envelope;
    if (!eventId || !eventType) {
      channel.nack(msg, false, false);
      return;
    }

    try {
      const alreadyProcessed = await (this.prisma as any).processedEvent.findUnique({
        where: { eventId_processorId: { eventId, processorId: PROCESSOR_ID } },
      });
      if (alreadyProcessed) {
        channel.ack(msg);
        return;
      }

      // The outbox wraps the domain event as the payload
      const p = (envelope.payload ?? envelope) as Record<string, unknown>;
      await this.applyEvent(eventType, p);

      await (this.prisma as any).processedEvent.create({
        data: { eventId, processorId: PROCESSOR_ID, eventType },
      });

      channel.ack(msg);
      this.logger.debug(`GroupEntitlementConsumer: processed "${eventType}" [${eventId}]`);
    } catch (err) {
      const redelivered = msg.fields.redelivered;
      this.logger.error(
        `GroupEntitlementConsumer: failed "${eventType}" [${eventId}]: ${err instanceof Error ? err.message : String(err)} — ${redelivered ? 'discarding' : 'requeueing'}`,
      );
      channel.nack(msg, false, !redelivered);
    }
  }

  private async applyEvent(eventType: string, payload: Record<string, unknown>): Promise<void> {
    switch (eventType) {
      case 'school.group.member.added': {
        const p = payload as unknown as GroupMemberAddedPayload;
        if (!p.courseId || p.groupStatus !== 'active') return;
        await this.grantIfNeeded(p.userId, p.courseId, p.groupId);
        break;
      }

      case 'school.group.member.removed': {
        const p = payload as unknown as GroupMemberRemovedPayload;
        if (!p.courseId) return;
        await this.revokeIfOrphaned(p.userId, p.courseId, p.groupId);
        break;
      }

      case 'school.group.material.added': {
        const p = payload as unknown as GroupMaterialAddedPayload;
        if (p.groupStatus !== 'active') return;
        await this.grantIfNeeded(p.userId, p.courseId, p.groupId);
        break;
      }

      case 'school.group.material.removed': {
        const p = payload as unknown as GroupMaterialRemovedPayload;
        await this.revokeIfOrphaned(p.userId, p.courseId, p.groupId);
        break;
      }

      case 'school.group.archived': {
        const p = payload as unknown as GroupArchivedPayload;
        // Revoke entitlements for all members of this group's course
        // We only know groupId here; we need to look up affected users from GroupMembership
        // (Not available in content-service — we rely on member.removed events fired per-student)
        // This is a best-effort signal; group members should have received removed events already.
        this.logger.debug(`GroupEntitlementConsumer: group.archived ${p.groupId} — entitlements handled per-member`);
        break;
      }

      default:
        break;
    }
  }

  private async grantIfNeeded(userId: string, containerId: string, sourceGroupId: string): Promise<void> {
    const hasActive = await this.entitlementRepo.hasActiveEntitlement(userId, containerId);
    if (hasActive) return;

    const entity = ContentEntitlementEntity.create({
      userId,
      containerId,
      entitlementType: EntitlementType.FREE_GRANTED,
      sourceReference: `group:${sourceGroupId}`,
    });

    await this.entitlementRepo.save(entity);
    this.logger.log(`GroupEntitlementConsumer: granted ${userId} → ${containerId} (group ${sourceGroupId})`);
  }

  private async revokeIfOrphaned(
    userId: string,
    containerId: string,
    removedGroupId: string,
  ): Promise<void> {
    // Only revoke if there's no other group still granting this course
    // We check via sourceReference — if another group:* grant exists, keep active
    const otherGrant = await this.prisma.contentEntitlement.findFirst({
      where: {
        userId,
        containerId,
        revokedAt: null,
        sourceReference: { startsWith: 'group:', not: `group:${removedGroupId}` },
      },
    });
    if (otherGrant) return;

    const activeGrant = await this.prisma.contentEntitlement.findFirst({
      where: { userId, containerId, revokedAt: null, sourceReference: `group:${removedGroupId}` },
    });
    if (!activeGrant) return;

    await this.prisma.contentEntitlement.update({
      where: { id: activeGrant.id },
      data: { revokedAt: new Date() },
    });
    this.logger.log(`GroupEntitlementConsumer: revoked ${userId} → ${containerId} (group ${removedGroupId})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}
