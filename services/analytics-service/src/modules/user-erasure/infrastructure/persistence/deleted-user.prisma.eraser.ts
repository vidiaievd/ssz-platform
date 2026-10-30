import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  ErasedLearnerData,
  IDeletedUserEraser,
} from '../../application/ports/deleted-user-eraser.port.js';

/** Archived events that are money records: kept whoever they name (ai.call.completed is unlinked). */
export const KEPT_ARCHIVE_ROUTING_KEYS = ['ai.call.completed', 'subscription.entitlements.changed'];

@Injectable()
export class DeletedUserPrismaEraser implements IDeletedUserEraser {
  constructor(private readonly prisma: PrismaService) {}

  async erase(userId: string): Promise<ErasedLearnerData> {
    return this.prisma.$transaction(async (tx) => {
      const directory =
        (await tx.userDirectory.deleteMany({ where: { userId } })).count +
        (await tx.schoolMembership.deleteMany({ where: { userId } })).count +
        (await tx.groupMembership.deleteMany({ where: { userId } })).count;
      const learning =
        (await tx.enrollmentProjection.deleteMany({ where: { userId } })).count +
        (await tx.progressActivity.deleteMany({ where: { userId } })).count +
        (await tx.attemptEvidence.deleteMany({ where: { userId } })).count +
        (await tx.atomEvidence.deleteMany({ where: { userId } })).count +
        (await tx.skillMastery.deleteMany({ where: { userId } })).count +
        (await tx.srsLimitRefusal.deleteMany({ where: { userId } })).count +
        (await tx.itemProgress.deleteMany({ where: { userId } })).count;
      // A teacher's «reviewed submission» row stays: its actor is the teacher, and the
      // attempt it points at is gone from exercise-engine.
      const schoolRecords =
        (await tx.schoolActivity.deleteMany({ where: { actorId: userId } })).count +
        (await tx.reviewTermAcceptance.deleteMany({ where: { userId } })).count;

      // The archive is what projections are replayed from: a row left here would bring the
      // user back on the next replay. Matched anywhere in the payload — a student-only
      // account appears only in events about itself (the one list of users in a payload,
      // `adminIds`, never holds a student). `position`, not LIKE: no wildcard to escape.
      const archivedEvents = await tx.$executeRaw`
        DELETE FROM event_archive
        WHERE position(${userId} in payload::text) > 0
          AND routing_key <> ALL(${KEPT_ARCHIVE_ROUTING_KEYS})`;
      const archivedCallsUnlinked = await tx.$executeRaw`
        UPDATE event_archive
        SET payload = payload || '{"actorUserId": null, "actorRole": null}'::jsonb
        WHERE routing_key = 'ai.call.completed' AND payload->>'actorUserId' = ${userId}`;

      return { directory, learning, schoolRecords, archivedEvents, archivedCallsUnlinked };
    });
  }
}

