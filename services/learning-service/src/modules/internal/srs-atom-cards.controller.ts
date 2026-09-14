import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InternalAuthGuard } from './internal-auth.guard.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

/**
 * How this service's card types are addressed elsewhere. Mirrors Content Service's
 * `AtomType` wire values, which is what every address in the event stream carries.
 */
const ATOM_TYPE_BY_CONTENT_TYPE: Record<string, string> = {
  VOCABULARY_WORD: 'vocabulary_item',
  GRAMMAR_ATOM: 'grammar_rule_atom',
};

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

/**
 * One learner's memory, atom by atom — plan 63 phase 8.
 *
 * Analytics has every answer this learner ever gave and not one fact about *when the
 * schedule wants them back*: cards live here. Without this, "what should we practise
 * next" can be assembled from evidence and from the course, and the single most
 * mechanical source — the card that came due this morning — would be missing.
 *
 * Only the atom-scoped types are served. The exercise-scoped cards are addresses of
 * exercises rather than of facts, and they retire in phase 7; an assistant that proposed
 * "revise exercise 4f21…" would be proposing the thing this plan exists to stop
 * scheduling.
 *
 * Suspended cards are left out — a card the learner put away is not something to be
 * handed back to them by a second screen.
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/srs')
export class SrsAtomCardsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('atom-cards')
  async atomCards(
    @Query('userId') userId: string,
    @Query('limit') limitStr?: string,
  ) {
    if (!userId) return { cards: [] };

    const limit = Math.min(parseInt(limitStr ?? '', 10) || DEFAULT_LIMIT, MAX_LIMIT);

    const rows = await this.prisma.srsReviewCard.findMany({
      where: {
        userId,
        contentType: { in: ['VOCABULARY_WORD', 'GRAMMAR_ATOM'] as any },
        state: { not: 'SUSPENDED' as any },
      },
      // Soonest due first: a caller that has to cut the list keeps the urgent end of it.
      orderBy: { dueAt: 'asc' },
      take: limit,
      select: {
        contentType: true,
        contentId: true,
        track: true,
        state: true,
        dueAt: true,
        stability: true,
        difficulty: true,
        reps: true,
        lapses: true,
        lastReviewedAt: true,
      },
    });

    return {
      cards: rows.map((row) => ({
        atomType: ATOM_TYPE_BY_CONTENT_TYPE[row.contentType] ?? row.contentType,
        atomId: row.contentId,
        // Lowercased for the same reason the budget keys are: the Prisma member name is
        // an implementation detail of this service, `lexis` is the word everyone uses.
        track: String(row.track).toLowerCase(),
        state: row.state,
        dueAt: row.dueAt.toISOString(),
        stability: row.stability,
        difficulty: row.difficulty,
        reps: row.reps,
        lapses: row.lapses,
        lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null,
      })),
    };
  }
}
