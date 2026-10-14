import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs';

import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { UpdateVariantCommand } from '../../../lesson/application/commands/update-variant/update-variant.command.js';
import { findAudioTokens, setAudioNarration } from './lesson-narration-token.js';
import type { CourseNarrationOptions, CourseNarrationReport, NarrationItemReport } from './course-narration.types.js';
import { NarrateCourseCommand } from './narrate-course.command.js';
import { MEDIA_NARRATION_CLIENT } from './media-narration.port.js';
import type { IMediaNarrationClient } from './media-narration.port.js';
import { planVariantNarration } from './narration-plan.js';
import type { NarrationAssetInfo, NarrationSkipReason, NarrationVariantPlan } from './narration-plan.js';

/** How long one narration may take from queued to READY. Piper speaks a text in seconds. */
const READY_TIMEOUT_MS = 180_000;
const READY_POLL_MS = 1_500;

interface VariantRow {
  id: string;
  lessonId: string;
  displayTitle: string;
  bodyMarkdown: string;
  ownerUserId: string;
}

/**
 * Narrate every text lesson of a course by speech synthesis (plan 74, phase 4).
 *
 * Which variants are touched is `planVariantNarration`: those with no narration, and those whose
 * synthesized narration is outdated or failed. A person's recording is never touched. The write
 * is the ordinary variant update, so the media references are rebuilt by it; and since a
 * variant's body is not versioned (a draft and its published version share the row), a real run
 * is live for students at once — which is why a dry run is the default.
 *
 * Variants are narrated one at a time: media-service speaks one text at a time anyway, and a
 * run that stops half way leaves each variant either untouched or fully done.
 */
@Injectable()
@CommandHandler(NarrateCourseCommand)
export class CourseNarrationService implements ICommandHandler<NarrateCourseCommand, CourseNarrationReport> {
  private readonly logger = new Logger(CourseNarrationService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
    @Inject(MEDIA_NARRATION_CLIENT) private readonly media: IMediaNarrationClient,
  ) {}

  execute(command: NarrateCourseCommand): Promise<CourseNarrationReport> {
    return this.run(command.courseId, command.options);
  }

  async run(courseId: string, options: CourseNarrationOptions): Promise<CourseNarrationReport> {
    if (this.running) throw new ConflictException('A course narration is already running');
    this.running = true;
    try {
      return await this.runOnce(courseId, options);
    } finally {
      this.running = false;
    }
  }

  private async runOnce(courseId: string, options: CourseNarrationOptions): Promise<CourseNarrationReport> {
    const course = await this.prisma.container.findFirst({
      where: { id: courseId, deletedAt: null, containerType: 'COURSE' },
      select: { id: true, targetLanguage: true, difficultyLevel: true },
    });
    if (!course) throw new NotFoundException(`No course ${courseId}`);

    const variants = await this.variantsOf(courseId);

    const tokenIds = variants.flatMap((variant) => findAudioTokens(variant.bodyMarkdown).map((t) => t.mediaId));
    const assets = tokenIds.length > 0 ? await this.media.describe(tokenIds) : new Map();

    const plans = variants.map((variant) => ({
      variant,
      plan: planVariantNarration(variant.bodyMarkdown, course.targetLanguage, (id) => assets.get(id), options.force),
    }));

    const items = plans.map(({ variant, plan }): NarrationItemReport => describePlan(variant, plan));
    const report: CourseNarrationReport = {
      courseId,
      dryRun: options.dryRun,
      lang: course.targetLanguage,
      variants: variants.length,
      counts: countOf(items),
      items,
    };
    if (options.dryRun) return report;

    let attempted = 0;
    for (const [index, { variant, plan }] of plans.entries()) {
      if (plan.kind === 'skip') continue;
      const item = items[index]!;
      if (options.limit !== undefined && attempted >= options.limit) {
        item.outcome = 'not-attempted';
        continue;
      }
      attempted += 1;
      await this.narrateVariant(variant, course.targetLanguage, course.difficultyLevel, plan, assets, item);
    }
    report.counts = { ...report.counts, ...outcomesOf(items) };
    return report;
  }

  /** TEXT lessons of the course, through every non-archived version of every nested container. */
  private async variantsOf(courseId: string): Promise<VariantRow[]> {
    const lessonIds = new Set<string>();
    const visited = new Set<string>();
    const queue = [courseId];

    while (queue.length > 0) {
      const containerId = queue.shift()!;
      if (visited.has(containerId)) continue;
      visited.add(containerId);

      const items = await this.prisma.containerItem.findMany({
        where: {
          itemType: { in: ['LESSON', 'CONTAINER'] },
          containerVersion: { containerId, status: { in: ['DRAFT', 'PUBLISHED', 'DEPRECATED'] } },
        },
        select: { itemType: true, itemId: true },
      });
      for (const item of items) {
        if (item.itemType === 'LESSON') lessonIds.add(item.itemId);
        else queue.push(item.itemId);
      }
    }
    if (lessonIds.size === 0) return [];

    const rows = await this.prisma.lessonContentVariant.findMany({
      where: { lessonId: { in: [...lessonIds] }, deletedAt: null, lesson: { kind: 'TEXT', deletedAt: null } },
      select: {
        id: true,
        lessonId: true,
        displayTitle: true,
        bodyMarkdown: true,
        lesson: { select: { ownerUserId: true } },
      },
      orderBy: [{ lessonId: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      lessonId: row.lessonId,
      displayTitle: row.displayTitle,
      bodyMarkdown: row.bodyMarkdown,
      ownerUserId: row.lesson.ownerUserId,
    }));
  }

  private async narrateVariant(
    variant: VariantRow,
    lang: string,
    level: string,
    plan: Exclude<NarrationVariantPlan, { kind: 'skip' }>,
    assets: Map<string, NarrationAssetInfo>,
    item: NarrationItemReport,
  ): Promise<void> {
    const fail = (error: string) => {
      item.outcome = 'failed';
      item.error = error;
      this.logger.warn(`Narration of variant ${variant.id} failed: ${error}`);
    };

    // The body may have been edited since the plan was made; narrate and write what is there now.
    const current = await this.prisma.lessonContentVariant.findFirst({
      where: { id: variant.id, deletedAt: null },
      select: { bodyMarkdown: true },
    });
    if (!current) return fail('VARIANT_GONE');
    const before = findAudioTokens(current.bodyMarkdown);
    const expected = plan.kind === 'refresh' ? plan.replaces : null;
    if (before.length > 1 || (before[0]?.mediaId ?? null) !== expected) return fail('BODY_CHANGED_SINCE_PLAN');

    const requested = await this.media.narrate({
      ownerId: variant.ownerUserId,
      bodyMarkdown: current.bodyMarkdown,
      lang,
      label: variant.displayTitle,
      lessonId: variant.lessonId,
      level,
      ...keptSettings(plan, assets),
    });
    if ('reason' in requested) return fail(requested.reason);

    const ready = await this.waitForReady(requested.assetId);
    if (ready !== 'READY') return fail(`NARRATION_${ready}`);

    // Re-read once more: the wait is long enough for an author to have saved.
    const latest = await this.prisma.lessonContentVariant.findFirst({
      where: { id: variant.id, deletedAt: null },
      select: { bodyMarkdown: true },
    });
    if (!latest) return fail('VARIANT_GONE');
    const latestTokens = findAudioTokens(latest.bodyMarkdown);
    if (latestTokens.length > 1 || (latestTokens[0]?.mediaId ?? null) !== expected) return fail('BODY_CHANGED_WHILE_SPEAKING');

    const updated = await this.commandBus.execute(
      new UpdateVariantCommand(
        variant.ownerUserId,
        variant.id,
        undefined,
        undefined,
        setAudioNarration(latest.bodyMarkdown, requested.assetId, null),
      ),
    );
    if (updated.isFail) return fail(`UPDATE_${String(updated.error)}`);

    if (plan.kind === 'refresh') {
      const marked = await this.media.supersede(plan.replaces, requested.assetId);
      if (!marked) item.error = 'SUPERSEDE_REFUSED';
    }
    item.outcome = 'narrated';
    item.newAssetId = requested.assetId;
    this.logger.log(`Narrated variant ${variant.id} (${variant.displayTitle}) → ${requested.assetId}`);
  }

  private async waitForReady(assetId: string): Promise<'READY' | 'FAILED' | 'TIMEOUT'> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const asset = (await this.media.describe([assetId])).get(assetId);
      if (asset?.status === 'READY') return 'READY';
      if (asset?.status === 'FAILED' || asset?.status === 'DELETED') return 'FAILED';
      await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
    }
    return 'TIMEOUT';
  }
}

/**
 * A narration refreshed because its text changed or it failed keeps the pace and pauses the
 * author gave it; a forced one starts from the level's defaults again — that is what force is for.
 */
function keptSettings(
  plan: Exclude<NarrationVariantPlan, { kind: 'skip' }>,
  assets: Map<string, NarrationAssetInfo>,
): { lengthScale?: number; pauseScale?: number } {
  if (plan.kind !== 'refresh' || plan.why === 'forced') return {};
  const previous = assets.get(plan.replaces);
  return {
    ...(previous?.lengthScale != null && { lengthScale: previous.lengthScale }),
    ...(previous?.pauseScale != null && { pauseScale: previous.pauseScale }),
  };
}

const SKIP_DETAIL: Record<NarrationSkipReason, string> = {
  current: 'narration is up to date',
  recorded: 'recorded by a person — left alone',
  'nothing-to-read': 'nothing to read aloud',
  'several-audio-tokens': 'several [audio:] tokens — left to the author',
  'asset-unknown': 'names an asset media-service does not know',
  'in-progress': 'narration is still being produced',
};

const REFRESH_DETAIL = {
  stale: 'text changed since it was spoken',
  failed: 'previous synthesis failed',
  forced: 're-spoken on request (force)',
} as const;

function describePlan(variant: VariantRow, plan: NarrationVariantPlan): NarrationItemReport {
  const base = { lessonId: variant.lessonId, variantId: variant.id, title: variant.displayTitle };
  switch (plan.kind) {
    case 'create':
      return { ...base, plan: 'create', detail: 'no narration yet' };
    case 'refresh':
      return {
        ...base,
        plan: 'refresh',
        detail: REFRESH_DETAIL[plan.why],
        assetId: plan.replaces,
      };
    case 'skip':
      return { ...base, plan: 'skip', detail: SKIP_DETAIL[plan.reason], ...(plan.assetId && { assetId: plan.assetId }) };
  }
}

function countOf(items: NarrationItemReport[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = item.plan === 'skip' ? `skip:${item.detail}` : item.plan;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function outcomesOf(items: NarrationItemReport[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    if (!item.outcome) continue;
    const key = `outcome:${item.outcome}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
