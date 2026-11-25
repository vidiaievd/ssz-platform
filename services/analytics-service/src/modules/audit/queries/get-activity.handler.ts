import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { GetActivityQuery } from './get-activity.query.js';
import { shownTarget, unnamedActorIds, unresolvedTargetIds } from './activity-targets.js';
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
        actorId: true,
        what: true,
        eventType: true,
        target: true,
        targetId: true,
        tag: true,
        occurredAt: true,
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // Rows written before their course had a directory row carry its id as the target.
    // Likewise an actor whose profile reached the directory after the row was written.
    const unresolved = unresolvedTargetIds(page);
    const unnamed = unnamedActorIds(page);
    const [known, people] = await Promise.all([
      unresolved.length
        ? this.prisma.containerDirectory.findMany({
            where: { containerId: { in: unresolved } },
            select: { containerId: true, title: true },
          })
        : Promise.resolve([] as Array<{ containerId: string; title: string }>),
      unnamed.length
        ? this.prisma.userDirectory.findMany({
            where: { userId: { in: unnamed } },
            select: { userId: true, displayName: true },
          })
        : Promise.resolve([] as Array<{ userId: string; displayName: string }>),
    ]);
    const titles = new Map<string, string>(known.map((c) => [c.containerId, c.title]));
    const names = new Map<string, string>(people.map((u) => [u.userId, u.displayName]));

    const items = page.map(
      (r): ActivityItemDto => ({
        id: r.id,
        who: r.actorName ?? (r.actorId ? (names.get(r.actorId) ?? null) : null),
        what: r.what,
        eventType: r.eventType,
        target: shownTarget(r, titles),
        occurredAt: r.occurredAt.toISOString(),
        tag: r.tag,
      }),
    );

    const nextCursor = hasMore ? items[items.length - 1].occurredAt : null;

    return { items, nextCursor };
  }
}
