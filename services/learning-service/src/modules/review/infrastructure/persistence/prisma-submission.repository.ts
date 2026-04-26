import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type {
  ISubmissionRepository,
  FindByUserOptions,
  FindPendingOptions,
} from '../../domain/repositories/submission.repository.interface.js';
import { Submission } from '../../domain/entities/submission.entity.js';
import { SubmissionMapper } from './submission.mapper.js';

const REVISIONS_INCLUDE = { revisions: { orderBy: { revisionNumber: 'asc' as const } } };

const PENDING_STATUSES = ['PENDING_REVIEW', 'RESUBMITTED'] as const;

@Injectable()
export class PrismaSubmissionRepository implements ISubmissionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Submission | null> {
    const row = await this.prisma.submission.findFirst({
      where: { id, deletedAt: null },
      include: REVISIONS_INCLUDE,
    });
    return row ? SubmissionMapper.toDomain(row) : null;
  }

  async findByUser(userId: string, options: FindByUserOptions = {}): Promise<Submission[]> {
    const rows = await this.prisma.submission.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(options.status?.length ? { status: { in: options.status as any } } : {}),
      },
      include: REVISIONS_INCLUDE,
      orderBy: { submittedAt: 'desc' },
      skip: options.offset,
      take: options.limit,
    });
    return rows.map(SubmissionMapper.toDomain);
  }

  async findPendingBySchool(schoolId: string, options: FindPendingOptions = {}): Promise<Submission[]> {
    const rows = await this.prisma.submission.findMany({
      where: {
        schoolId,
        deletedAt: null,
        status: { in: PENDING_STATUSES as any },
      },
      include: REVISIONS_INCLUDE,
      orderBy: { submittedAt: 'asc' },
      skip: options.offset,
      take: options.limit,
    });
    return rows.map(SubmissionMapper.toDomain);
  }

  async save(submission: Submission): Promise<void> {
    const data = SubmissionMapper.toPersistence(submission);
    await this.prisma.$transaction(async (tx) => {
      await tx.submission.upsert({
        where: { id: data.id },
        create: { ...data, status: data.status as any },
        update: {
          status: data.status as any,
          currentRevisionNumber: data.currentRevisionNumber,
          deletedAt: data.deletedAt,
        },
      });

      for (const rev of submission.revisions) {
        const r = SubmissionMapper.revisionToPersistence(rev);
        await tx.submissionRevision.upsert({
          where: { submissionId_revisionNumber: { submissionId: r.submissionId, revisionNumber: r.revisionNumber } },
          create: { ...r, content: r.content as any, decision: r.decision as any },
          update: {
            reviewedBy: r.reviewedBy,
            reviewedAt: r.reviewedAt,
            feedback: r.feedback,
            score: r.score,
            decision: r.decision as any,
          },
        });
      }
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.submission.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
