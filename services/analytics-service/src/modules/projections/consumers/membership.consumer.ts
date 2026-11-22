import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { EXCHANGES } from '@ssz/contracts';
import type { BaseEvent } from '@ssz/contracts';
import type { AppConfig } from '../../../config/configuration.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';

const PROCESSOR_ID = 'membership';
const QUEUE = 'analytics-service.projections.membership';
const EXCHANGE = EXCHANGES.ORGANIZATION;

const BINDING_KEYS = [
  'school.created',
  'school.member.added',
  'school.member.removed',
  // Plan 90, phase 5 (Q13): the roster follows the school's lifecycle. On this queue, so a
  // lifecycle event is never applied beside a member event of the same school.
  'school.closed',
  'school.restored',
  'school.purged',
] as const;

interface SchoolLifecyclePayload {
  schoolId: string;
}

interface SchoolCreatedPayload {
  eventId: string;
  schoolId: string;
  ownerId: string;
  occurredAt: string;
}

interface SchoolMemberAddedPayload {
  eventId: string;
  schoolId: string;
  userId: string;
  role: string;
  occurredAt: string;
}

interface SchoolMemberRemovedPayload {
  eventId: string;
  schoolId: string;
  userId: string;
}

@Injectable()
export class MembershipConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MembershipConsumer.name);
  private connection: ReturnType<typeof amqp.connect> | null = null;
  private channelWrapper: ReturnType<ReturnType<typeof amqp.connect>['createChannel']> | null = null;

  constructor(
    private readonly config: ConfigService<AppConfig>,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.config.get<AppConfig['rabbitmq']>('rabbitmq')?.url;
    if (!url) {
      this.logger.warn('RABBITMQ_URL not configured — MembershipConsumer disabled');
      return;
    }

    this.connection = amqp.connect([url]);
    this.connection.on('connect', () => this.logger.log('MembershipConsumer connected'));
    this.connection.on('disconnect', ({ err }: { err?: Error }) =>
      this.logger.warn(`MembershipConsumer disconnected: ${err?.message ?? 'unknown'}`),
    );

    this.channelWrapper = this.connection.createChannel({
      setup: async (channel: ConfirmChannel) => {
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
        await channel.assertQueue(QUEUE, { durable: true });
        for (const key of BINDING_KEYS) {
          await channel.bindQueue(QUEUE, EXCHANGE, key);
        }
        // One at a time: a school's closing must not overtake its last member event.
        await channel.prefetch(1);
        await channel.consume(QUEUE, (msg) => this.handleMessage(channel, msg));
        this.logger.log(`MembershipConsumer listening on queue "${QUEUE}"`);
      },
    });
    // Without a listener an 'error' from the channel (a setup failing while the broker
    // restarts) is an unhandled event and takes the whole process down.
    this.channelWrapper.on('error', (err: unknown) =>
      this.logger.error(`RabbitMQ channel error: ${err instanceof Error ? err.message : String(err)}`),
    );
  }

  async handleMessage(
    channel: Pick<ConfirmChannel, 'ack' | 'nack'>,
    msg: ConsumeMessage | null,
  ): Promise<void> {
    if (!msg) return;

    let envelope: BaseEvent<unknown>;
    try {
      envelope = JSON.parse(msg.content.toString()) as BaseEvent<unknown>;
    } catch {
      this.logger.error('MembershipConsumer: non-JSON message — discarding');
      channel.nack(msg, false, false);
      return;
    }

    const { eventId, eventType } = envelope;
    if (!eventId || !eventType) {
      this.logger.warn('MembershipConsumer: missing eventId/eventType — discarding');
      channel.nack(msg, false, false);
      return;
    }

    try {
      const alreadyProcessed = await this.prisma.processedEvent.findUnique({
        where: { eventId_processorId: { eventId, processorId: PROCESSOR_ID } },
      });
      if (alreadyProcessed) {
        channel.ack(msg);
        return;
      }

      await this.applyEvent(eventType, envelope.payload as Record<string, unknown>, envelope.occurredAt);

      await this.prisma.processedEvent.create({
        data: { eventId, processorId: PROCESSOR_ID, eventType },
      });

      channel.ack(msg);
      this.logger.debug(`MembershipConsumer: processed "${eventType}" [${eventId}]`);
    } catch (err) {
      if (err instanceof MalformedEventError) {
        this.logger.error(`MembershipConsumer: ${err.message} [${eventId}] — discarding`);
        channel.nack(msg, false, false);
        return;
      }
      const redelivered = msg.fields.redelivered;
      this.logger.error(
        `MembershipConsumer: failed "${eventType}" [${eventId}]: ${err instanceof Error ? err.message : String(err)} — ${redelivered ? 'discarding' : 'requeueing'}`,
      );
      channel.nack(msg, false, !redelivered);
    }
  }

  private async applyEvent(
    eventType: string,
    payload: Record<string, unknown>,
    occurredAt: string,
  ): Promise<void> {
    switch (eventType) {
      case 'school.created': {
        const p = payload as unknown as SchoolCreatedPayload;
        await this.prisma.schoolMembership.upsert({
          where: { schoolId_userId: { schoolId: p.schoolId, userId: p.ownerId } },
          create: {
            schoolId: p.schoolId,
            userId: p.ownerId,
            role: 'OWNER',
            joinedAt: new Date(p.occurredAt ?? occurredAt),
          },
          update: { role: 'OWNER' },
        });
        break;
      }

      case 'school.member.added': {
        const p = payload as unknown as SchoolMemberAddedPayload;
        await this.prisma.schoolMembership.upsert({
          where: { schoolId_userId: { schoolId: p.schoolId, userId: p.userId } },
          create: {
            schoolId: p.schoolId,
            userId: p.userId,
            role: p.role,
            joinedAt: new Date(p.occurredAt ?? occurredAt),
          },
          update: { role: p.role },
        });
        break;
      }

      case 'school.member.removed': {
        const p = payload as unknown as SchoolMemberRemovedPayload;
        await this.prisma.schoolMembership.deleteMany({
          where: { schoolId: p.schoolId, userId: p.userId },
        });
        break;
      }

      case 'school.closed':
        await this.closeSchool(requireSchoolId(payload, eventType));
        break;

      case 'school.restored':
        await this.restoreSchool(requireSchoolId(payload, eventType));
        break;

      case 'school.purged':
        await this.purgeSchool(requireSchoolId(payload, eventType));
        break;

      default:
        this.logger.warn(`MembershipConsumer: unhandled event type "${eventType}"`);
    }
  }

  /**
   * `closed`: nobody has a role in the school (as in organization), so its roster is set aside and
   * every school screen answers 404. `suspended` changes nothing — the school is still read.
   */
  private async closeSchool(schoolId: string): Promise<void> {
    const moved = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.schoolMembership.findMany({ where: { schoolId } });
      if (rows.length > 0) await tx.closedSchoolMembership.createMany({ data: rows, skipDuplicates: true });
      await tx.schoolMembership.deleteMany({ where: { schoolId } });
      return rows.length;
    });
    this.logger.log(`School ${schoolId} closed: ${moved} roster row(s) set aside`);
  }

  /** `restored`: the roster set aside on closing comes back; a row written since is kept. */
  private async restoreSchool(schoolId: string): Promise<void> {
    const moved = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.closedSchoolMembership.findMany({ where: { schoolId } });
      if (rows.length > 0) await tx.schoolMembership.createMany({ data: rows, skipDuplicates: true });
      await tx.closedSchoolMembership.deleteMany({ where: { schoolId } });
      return rows.length;
    });
    this.logger.log(`School ${schoolId} restored: ${moved} roster row(s) back`);
  }

  /**
   * `purged`: the school's own projections go — roster (both tables), groups and their members,
   * the activity feed, the review-term journal. What is the learner's stays, as in learning:
   * enrolments, evidence, mastery, weak-rule facts; no school screen reaches them any more.
   */
  private async purgeSchool(schoolId: string): Promise<void> {
    const counts = await this.prisma.$transaction([
      this.prisma.schoolMembership.deleteMany({ where: { schoolId } }),
      this.prisma.closedSchoolMembership.deleteMany({ where: { schoolId } }),
      this.prisma.groupMembership.deleteMany({ where: { schoolId } }),
      this.prisma.groupDirectory.deleteMany({ where: { schoolId } }),
      this.prisma.schoolActivity.deleteMany({ where: { schoolId } }),
      this.prisma.reviewTermAcceptance.deleteMany({ where: { schoolId } }),
    ]);
    this.logger.log(
      `School ${schoolId} purged: ${counts.map((c) => c.count).join(' / ')} row(s) deleted ` +
        '(roster / set-aside roster / group members / groups / activity / review terms)',
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.channelWrapper?.close();
    await this.connection?.close();
  }
}

/** A lifecycle event without a school would drop the filter and hit every school. */
function requireSchoolId(payload: Record<string, unknown> | undefined, eventType: string): string {
  const schoolId = payload?.schoolId;
  if (typeof schoolId !== 'string' || schoolId.length === 0) {
    throw new MalformedEventError(`${eventType} carries no schoolId`);
  }
  return schoolId;
}

class MalformedEventError extends Error {}
