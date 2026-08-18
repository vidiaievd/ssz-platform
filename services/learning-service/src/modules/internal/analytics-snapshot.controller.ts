import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InternalAuthGuard } from './internal-auth.guard.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

@ApiExcludeController()
@UseGuards(InternalAuthGuard)
@Controller('internal/analytics/snapshot')
export class AnalyticsSnapshotController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('enrollments')
  async enrollments(
    @Query('cursor') cursor?: string,
    @Query('limit') limitStr?: string,
  ) {
    const limit = Math.min(parseInt(limitStr ?? '500', 10) || 500, 1000);
    const rows = await this.prisma.enrollment.findMany({
      where: {
        deletedAt: null,
        ...(cursor ? { enrolledAt: { gt: new Date(cursor) } } : {}),
      },
      orderBy: { enrolledAt: 'asc' },
      take: limit,
      select: {
        id: true,
        userId: true,
        containerId: true,
        schoolId: true,
        status: true,
        enrolledAt: true,
        completedAt: true,
        unenrolledAt: true,
      },
    });

    return {
      data: rows,
      nextCursor: rows.length === limit
        ? rows[rows.length - 1].enrolledAt.toISOString()
        : null,
    };
  }

  @Get('progress')
  async progress(
    @Query('cursor') cursor?: string,
    @Query('limit') limitStr?: string,
  ) {
    const limit = Math.min(parseInt(limitStr ?? '500', 10) || 500, 1000);
    const rows = await this.prisma.userProgress.findMany({
      where: {
        status: { in: ['IN_PROGRESS', 'COMPLETED', 'NEEDS_REVIEW'] },
        ...(cursor ? { createdAt: { gt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        userId: true,
        contentType: true,
        contentId: true,
        status: true,
        lastAttemptAt: true,
        completedAt: true,
        createdAt: true,
      },
    });

    return {
      data: rows,
      nextCursor: rows.length === limit
        ? rows[rows.length - 1].createdAt.toISOString()
        : null,
    };
  }
}
