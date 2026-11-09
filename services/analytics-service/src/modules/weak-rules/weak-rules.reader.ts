import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { ContentClient } from '../../infrastructure/http/content.client.js';
import {
  GRAMMAR_RULE_ATOM,
  aggregateWeakRules,
  windowSince,
  type FlagFact,
  type WeakRulesWindow,
} from './domain/weak-rules.js';
import type { WeakRulesResponseDto } from './dto/weak-rules-response.dto.js';

/**
 * The weak-rules reading — one for a group's learners, one for a single learner (plan 85,
 * step 10). Both print the same row, so a teacher moving from the group to a learner sees the
 * same counts.
 *
 * Narrowed by learners and course, never by the signal's `group_id`: a learner's self-study
 * carries no group, and filtering on it would leave their weak rules permanently out of the
 * group's list — the false emptiness plan 58 is about.
 */
@Injectable()
export class WeakRulesReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentClient,
  ) {}

  async read(input: {
    userIds: readonly string[];
    courseId: string | null;
    window: WeakRulesWindow;
    now?: Date;
  }): Promise<WeakRulesResponseDto> {
    const since = windowSince(input.window, input.now ?? new Date());

    const rows =
      input.userIds.length === 0
        ? []
        : await this.prisma.weakRuleDaily.findMany({
            where: {
              userId: { in: [...input.userIds] },
              atomType: GRAMMAR_RULE_ATOM,
              ...(input.courseId === null ? {} : { containerId: input.courseId }),
              ...(since === null ? {} : { day: { gte: new Date(since) } }),
            },
            select: { userId: true, atomId: true, exerciseId: true, source: true, flaggedAt: true },
          });

    const rules = aggregateWeakRules(
      rows.map((row): FlagFact => ({ ...row, source: row.source as FlagFact['source'] })),
    );
    // Best-effort: a rule whose name could not be asked is still a real finding.
    const named = await this.content.describeAtoms(
      rules.map((rule) => ({ atomType: GRAMMAR_RULE_ATOM, atomId: rule.atomId })),
    );

    return {
      window: input.window,
      since,
      courseId: input.courseId,
      rules: rules.map((rule) => {
        const atom = named.get(`${GRAMMAR_RULE_ATOM}:${rule.atomId}`);
        return {
          atomId: rule.atomId,
          title: atom?.title ?? null,
          ruleId: atom?.parentId ?? null,
          flags: rule.flags,
          learners: rule.learners,
          bySource: {
            aiPrecheck: rule.bySource.ai_precheck,
            aiReview: rule.bySource.ai_review,
            teacher: rule.bySource.teacher,
            aiVoice: rule.bySource.ai_voice,
            aiSession: rule.bySource.ai_session,
          },
          lastFlaggedAt: rule.lastFlaggedAt,
        };
      }),
    };
  }
}
