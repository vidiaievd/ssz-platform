import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InternalAuthGuard } from './internal-auth.guard.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import {
  countActiveLearners,
  parseActiveLearnersBody,
  type ActiveLearnerContentType,
  type ActiveLearnersAnswer,
  type ContentHold,
} from './active-learners.js';

// Prisma hands back and expects the enum member names, not their mapped values.
const PRISMA_TYPE: Record<
  ActiveLearnerContentType,
  'CONTAINER' | 'LESSON' | 'VOCABULARY_LIST' | 'GRAMMAR_RULE' | 'EXERCISE'
> = {
  container: 'CONTAINER',
  lesson: 'LESSON',
  vocabulary_list: 'VOCABULARY_LIST',
  grammar_rule: 'GRAMMAR_RULE',
  exercise: 'EXERCISE',
};
const FROM_PRISMA_TYPE = Object.fromEntries(
  Object.entries(PRISMA_TYPE).map(([k, v]) => [v, k as ActiveLearnerContentType]),
) as Record<string, ActiveLearnerContentType>;

/**
 * How many learners still actively use each piece of content (plan 90, phase 5, step 4b) — what
 * content-service asks before it deletes a purged school's materials. The rule lives in
 * `active-learners.ts`.
 *
 * Callers send `x-service-token` (not `x-internal-token`) and the `/api/v1` prefix.
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/content')
export class ContentActiveLearnersController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('active-learners')
  @HttpCode(200)
  async count(@Body() body: unknown): Promise<{ items: ActiveLearnersAnswer[] }> {
    const { activeSince, items } = parseActiveLearnersBody(body);
    if (items.length === 0) return { items: [] };

    const containerIds = items.filter((i) => i.contentType === 'container').map((i) => i.contentId);
    const [enrollments, assignments] = await Promise.all([
      containerIds.length === 0
        ? []
        : this.prisma.enrollment.findMany({
            where: { containerId: { in: containerIds }, status: 'ACTIVE', deletedAt: null },
            select: { userId: true, containerId: true, enrolledAt: true },
          }),
      this.prisma.assignment.findMany({
        where: {
          OR: items.map((i) => ({
            contentType: PRISMA_TYPE[i.contentType],
            contentId: i.contentId,
          })),
          status: { in: ['ACTIVE', 'OVERDUE'] },
          deletedAt: null,
        },
        select: { assigneeId: true, contentType: true, contentId: true, assignedAt: true },
      }),
    ]);

    const holds: ContentHold[] = [
      ...enrollments.map((e) => ({
        userId: e.userId,
        contentType: 'container' as const,
        contentId: e.containerId,
        since: e.enrolledAt,
      })),
      ...assignments.map((a) => ({
        userId: a.assigneeId,
        contentType: FROM_PRISMA_TYPE[String(a.contentType)],
        contentId: a.contentId,
        since: a.assignedAt,
      })),
    ];
    if (holds.length === 0) return { items: countActiveLearners(items, [], [], activeSince) };

    const scopeIds = [...new Set(items.flatMap((i) => [i.contentId, ...i.leafIds]))];
    const touches = await this.prisma.userProgress.findMany({
      where: {
        userId: { in: [...new Set(holds.map((h) => h.userId))] },
        contentId: { in: scopeIds },
        updatedAt: { gte: activeSince },
      },
      select: { userId: true, contentId: true },
    });

    return { items: countActiveLearners(items, holds, touches, activeSince) };
  }
}
