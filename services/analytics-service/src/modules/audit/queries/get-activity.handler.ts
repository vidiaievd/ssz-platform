import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { GetActivityQuery } from './get-activity.query.js';
import type { GetActivityResponseDto, ActivityItemDto } from '../dto/activity-response.dto.js';

const ALLOWED_ROLES = new Set(['OWNER', 'ADMIN', 'TEACHER', 'CONTENT_ADMIN']);

@QueryHandler(GetActivityQuery)
@Injectable()
export class GetActivityHandler implements IQueryHandler<GetActivityQuery, GetActivityResponseDto> {
  constructor(private readonly prisma: PrismaService) {}

  async execute(query: GetActivityQuery): Promise<GetActivityResponseDto> {
    const { schoolId, viewerUserId, limit, cursor } = query;

    const membership = await this.prisma.schoolMembership.findUnique({
      where: { schoolId_userId: { schoolId, userId: viewerUserId } },
    });
    if (!membership) throw new NotFoundException('School not found or access denied');
    if (!ALLOWED_ROLES.has(membership.role)) throw new ForbiddenException('Insufficient role');

    const rows = await this.prisma.schoolActivity.findMany({
      where: {
        schoolId,
        ...(cursor ? { occurredAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { occurredAt: 'desc' },
      take: limit + 1, // fetch one extra to determine nextCursor
      select: {
        id: true,
        actorName: true,
        what: true,
        target: true,
        tag: true,
        occurredAt: true,
      },
    });

    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(
      (r): ActivityItemDto => ({
        id: r.id,
        who: r.actorName ?? null,
        what: r.what,
        target: r.target ?? null,
        occurredAt: r.occurredAt.toISOString(),
        tag: r.tag,
      }),
    );

    const nextCursor = hasMore ? items[items.length - 1].occurredAt : null;

    return { items, nextCursor };
  }
}
