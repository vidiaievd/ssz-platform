import { Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { AppConfig } from '../../../config/configuration.js';
import { GetStudentDetailQuery } from './get-student-detail.query.js';
import type { StudentDetailResponseDto, StudentDetailGroupDto } from '../dto/student-detail-response.dto.js';

const NEW_STUDENT_DAYS = 14;

@QueryHandler(GetStudentDetailQuery)
@Injectable()
export class GetStudentDetailHandler implements IQueryHandler<GetStudentDetailQuery, StudentDetailResponseDto> {
  private readonly atRiskDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig>,
  ) {
    this.atRiskDays = this.config.get<AppConfig['metrics']>('metrics')?.atRiskThresholdDays ?? 7;
  }

  async execute(query: GetStudentDetailQuery): Promise<StudentDetailResponseDto> {
    const { schoolId, viewerUserId, studentUserId } = query;

    // ── 1. Authorization — viewer must be a school member ───────────────────
    const viewerMembership = await this.prisma.schoolMembership.findUnique({
      where: { schoolId_userId: { schoolId, userId: viewerUserId } },
    });
    if (!viewerMembership) throw new NotFoundException('School not found or access denied');

    // ── 2. Student must be a STUDENT member ─────────────────────────────────
    const studentMembership = await this.prisma.schoolMembership.findUnique({
      where: { schoolId_userId: { schoolId, userId: studentUserId } },
    });
    if (!studentMembership || studentMembership.role !== 'STUDENT') {
      throw new NotFoundException('Student not found in this school');
    }

    const userId = studentUserId;

    // ── 3. Batch-fetch data ─────────────────────────────────────────────────
    const [groupMemberships, userDir, enrollment, lastActivity] = await Promise.all([
      (this.prisma as any).groupMembership.findMany({
        where: { schoolId, userId },
        include: { group: true },
      }),
      this.prisma.userDirectory.findUnique({ where: { userId } }),
      this.prisma.enrollmentProjection.findFirst({
        where: { schoolId, userId },
        orderBy: { enrolledAt: 'desc' },
      }),
      this.prisma.progressActivity.findFirst({
        where: { userId },
        orderBy: { occurredAt: 'desc' },
      }),
    ]);

    // ── 4. Derive status ────────────────────────────────────────────────────
    const now = new Date();
    const atRiskCutoff = new Date(now.getTime() - this.atRiskDays * 86400_000);
    const newCutoff = new Date(now.getTime() - NEW_STUDENT_DAYS * 86400_000);

    const lastSeen = lastActivity?.occurredAt ?? null;
    const enrolledAt: Date = enrollment?.enrolledAt ?? studentMembership.joinedAt;
    const progress = enrollment?.status === 'COMPLETED' ? 1.0 : 0.0;

    let status: string;
    if (enrollment?.status === 'COMPLETED') {
      status = 'finished';
    } else if (groupMemberships.length === 0) {
      status = 'unassigned';
    } else if (lastSeen && lastSeen >= atRiskCutoff) {
      status = 'active';
    } else if (enrolledAt >= newCutoff && !lastSeen) {
      status = 'new';
    } else {
      status = 'at-risk';
    }

    // ── 5. Build groups ─────────────────────────────────────────────────────
    const groups: StudentDetailGroupDto[] = groupMemberships.map((gm: any) => ({
      id: gm.groupId,
      name: gm.group?.name ?? gm.groupId,
      lang: gm.group?.lang ?? null,
      level: gm.group?.level ?? null,
      courseId: gm.group?.courseId ?? null,
    }));

    return {
      userId,
      name: userDir?.displayName ?? userId,
      status,
      progress,
      lastSeen: lastSeen?.toISOString() ?? null,
      enrolledAt: enrolledAt.toISOString(),
      completedAt: enrollment?.completedAt?.toISOString() ?? null,
      groups,
    };
  }
}
