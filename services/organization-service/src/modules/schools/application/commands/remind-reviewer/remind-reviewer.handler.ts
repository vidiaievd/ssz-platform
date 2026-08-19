import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { HttpException, HttpStatus, Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RemindReviewerCommand } from './remind-reviewer.command.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { MemberNotFoundException } from '../../../domain/exceptions/member-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { ReviewerRemindedEvent } from '../../../domain/events/reviewer-reminded.event.js';

/**
 * One reminder per reviewer per day, exactly as the learner nudge is limited.
 *
 * The number matters more here than it looks: an administrator working through the "stuck"
 * list would otherwise send the same teacher a message per submission, which is the very
 * thing the single counted message exists to avoid (`BEHAVIOR.md` §C).
 */
const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Who may ask a colleague to catch up: the people who run the school's review. */
const OVERSIGHT_ROLES = new Set<MemberRole>([MemberRole.ADMIN, MemberRole.MANAGER]);

@CommandHandler(RemindReviewerCommand)
export class RemindReviewerHandler
  implements ICommandHandler<RemindReviewerCommand, { sent: true }>
{
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: RemindReviewerCommand): Promise<{ sent: true }> {
    const { actorId, schoolId, teacherId, pending } = command;

    const school = await this.schoolRepository.findById(schoolId);
    if (!school) throw new SchoolNotFoundException(schoolId);

    const actorRole = school.getMemberRole(actorId);
    const isOwner = actorId === school.ownerId;
    if (!isOwner && (!actorRole || !OVERSIGHT_ROLES.has(actorRole))) {
      throw new ForbiddenOperationException('Not authorized to remind a reviewer');
    }

    // A member of this school, whatever their role: reviewing follows group assignments
    // rather than a job title, and a MANAGER holding a group is a reviewer like any other.
    if (!school.getMemberRole(teacherId)) {
      throw new MemberNotFoundException(teacherId);
    }

    const existing = await (this.prisma as any).reviewerReminder.findUnique({
      where: { schoolId_teacherId: { schoolId, teacherId } },
    });
    const now = new Date();
    if (existing) {
      const nextAllowedAt = new Date(existing.lastRemindedAt.getTime() + REMINDER_COOLDOWN_MS);
      if (now < nextAllowedAt) {
        throw new HttpException(
          { error: 'too-soon', nextAllowedAt: nextAllowedAt.toISOString() },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    await (this.prisma as any).reviewerReminder.upsert({
      where: { schoolId_teacherId: { schoolId, teacherId } },
      create: { schoolId, teacherId, lastRemindedAt: now },
      update: { lastRemindedAt: now },
    });

    await this.eventPublisher.publish(
      new ReviewerRemindedEvent(randomUUID(), schoolId, teacherId, pending, actorId),
    );

    return { sent: true };
  }
}
