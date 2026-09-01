import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { coverageIssues, diff, tally } from '@ssz/shared-kernel/skills';
import type { Coverage, CoverageDifference, CoverageIssue } from '@ssz/shared-kernel/skills';
import { GetContainerCoverageQuery } from './get-container-coverage.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { EXERCISE_AXES } from '../../../../../shared/skills/domain/exercise-axes.port.js';
import type { IExerciseAxes } from '../../../../../shared/skills/domain/exercise-axes.port.js';

/** One version's answer to "what does this train". */
export interface CoverageReport {
  version: 'draft' | 'published';
  /**
   * False when this container has no such version — a course nobody has published yet
   * has no published coverage, and reporting that as a course full of zeroes would be a
   * different and much worse lie than saying there is nothing there.
   */
  available: boolean;
  coverage: Coverage;
  issues: CoverageIssue[];
  modules: ModuleCoverage[];
}

export interface ModuleCoverage {
  containerId: string;
  title: string;
  coverage: Coverage;
  issues: CoverageIssue[];
}

export interface ContainerCoverageResult {
  containerId: string;
  containerType: string;
  title: string;
  draft: CoverageReport | null;
  published: CoverageReport | null;
  /**
   * Whether the two versions disagree about what this container trains.
   *
   * Answered by the server, not by whoever is drawing it. "Did the versions diverge" is
   * one question, and leaving it to the client means it gets answered again in the web
   * editor, in the mobile app and in every later consumer, by three slightly different
   * rules. False whenever only one version was asked for.
   */
  diverges: boolean;
  /** The cells that differ. Empty unless `diverges`. */
  differences: CoverageDifference[];
}

/**
 * What a course, a module or a collection actually trains — plan 55 §3.7.
 *
 * A pure read, with no storage of its own. Coverage is a property of the content, and
 * the only place that knows what a module is made of is this service; asking analytics
 * would mean keeping a second copy of the tree. No cache either: 452 exercises to a
 * course is three orders of magnitude away from where a cache starts paying for itself,
 * and a stale coverage strip is worse than a slow one.
 */
@QueryHandler(GetContainerCoverageQuery)
export class GetContainerCoverageHandler implements IQueryHandler<
  GetContainerCoverageQuery,
  Result<ContainerCoverageResult, ContainerDomainError>
> {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EXERCISE_AXES)
    private readonly axes: IExerciseAxes,
  ) {}

  async execute(
    query: GetContainerCoverageQuery,
  ): Promise<Result<ContainerCoverageResult, ContainerDomainError>> {
    const container = await this.prisma.container.findFirst({
      where: { id: query.containerId, deletedAt: null },
      select: { id: true, title: true, containerType: true },
    });
    if (!container) return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);

    const wantsDraft = query.version === 'draft' || query.version === 'both';
    const wantsPublished = query.version === 'published' || query.version === 'both';

    const draft = wantsDraft ? await this.report(query.containerId, 'draft') : null;
    const published = wantsPublished ? await this.report(query.containerId, 'published') : null;

    // Only a real comparison counts as divergence. One side missing is not a difference
    // between two versions — it is the absence of one of them, which `available` says.
    const comparable =
      draft !== null && published !== null && draft.available && published.available;
    const differences = comparable ? diff(draft.coverage, published.coverage) : [];

    return Result.ok({
      containerId: container.id,
      containerType: container.containerType,
      title: container.title,
      draft,
      published,
      diverges: differences.length > 0,
      differences,
    });
  }

  private async report(
    containerId: string,
    version: 'draft' | 'published',
  ): Promise<CoverageReport> {
    const versionId = await this.versionId(containerId, version);
    if (versionId === null) {
      return {
        version,
        available: false,
        coverage: tally([]),
        issues: [],
        modules: [],
      };
    }

    // Direct children first, so the breakdown can name a module before the walk flattens
    // everything beneath it. A module asked about itself simply has no children to list.
    const items = await this.prisma.containerItem.findMany({
      where: { containerVersionId: versionId },
      orderBy: [{ position: 'asc' }],
      select: { itemType: true, itemId: true },
    });

    const own = new Set<string>();
    const childContainerIds: string[] = [];

    for (const item of items) {
      if (item.itemType === 'CONTAINER') childContainerIds.push(item.itemId);
      else await this.collectLeaf(item.itemType, item.itemId, version, own);
    }

    const modules: ModuleCoverage[] = [];
    const all = new Set<string>(own);

    for (const childId of childContainerIds) {
      const child = await this.prisma.container.findFirst({
        where: { id: childId, deletedAt: null },
        select: { id: true, title: true },
      });
      if (!child) continue;

      const ids = new Set<string>();
      await this.collectContainer(childId, version, ids, new Set([containerId]));
      for (const id of ids) all.add(id);

      const childCoverage = await this.count(ids, version);
      modules.push({
        containerId: child.id,
        title: child.title,
        coverage: childCoverage,
        issues: coverageIssues(childCoverage),
      });
    }

    const coverage = await this.count(all, version);
    return { version, available: true, coverage, issues: coverageIssues(coverage), modules };
  }

  /**
   * Which version of a container this scope means.
   *
   * `draft` falls back to the published version, because that is what the editor shows an
   * author who has changed nothing: without the fallback, every untouched module would
   * report an empty draft and the strip would claim the course trains nothing.
   * `published` has no fallback — nothing live means nothing live.
   */
  private async versionId(
    containerId: string,
    version: 'draft' | 'published',
  ): Promise<string | null> {
    const container = await this.prisma.container.findFirst({
      where: { id: containerId, deletedAt: null },
      select: { currentPublishedVersionId: true },
    });
    if (!container) return null;
    if (version === 'published') return container.currentPublishedVersionId;

    const draft = await this.prisma.containerVersion.findFirst({
      where: { containerId, status: 'DRAFT' },
      orderBy: [{ versionNumber: 'desc' }],
      select: { id: true },
    });
    return draft?.id ?? container.currentPublishedVersionId;
  }

  /** Walks a container and everything below it, adding every exercise it reaches. */
  private async collectContainer(
    containerId: string,
    version: 'draft' | 'published',
    into: Set<string>,
    visited: Set<string>,
  ): Promise<void> {
    // A container placed inside itself is impossible through the editor and fatal here.
    if (visited.has(containerId)) return;
    visited.add(containerId);

    const versionId = await this.versionId(containerId, version);
    if (versionId === null) return;

    const items = await this.prisma.containerItem.findMany({
      where: { containerVersionId: versionId },
      select: { itemType: true, itemId: true },
    });

    for (const item of items) {
      if (item.itemType === 'CONTAINER') {
        await this.collectContainer(item.itemId, version, into, visited);
      } else {
        await this.collectLeaf(item.itemType, item.itemId, version, into);
      }
    }
  }

  /**
   * The exercises one non-container item contributes.
   *
   * A lesson contributes the exercises bolted onto its variants — the listening stages
   * and the video question. Skipping them would be the single worst error this report
   * could make: those are precisely the listening exercises, and a report that counted
   * only what sits directly in the module would announce `listening: 0` for a course
   * built out of audio lessons.
   */
  private async collectLeaf(
    itemType: string,
    itemId: string,
    version: 'draft' | 'published',
    into: Set<string>,
  ): Promise<void> {
    if (itemType === 'EXERCISE') {
      into.add(itemId);
      return;
    }
    if (itemType !== 'LESSON') return;

    // A lesson has one variant per explanation language and level band, and they place
    // the same exercises; the set deduplicates them. For the published view only
    // variants a learner can actually open count.
    const variants = await this.prisma.lessonContentVariant.findMany({
      where: {
        lessonId: itemId,
        deletedAt: null,
        ...(version === 'published' ? { status: 'PUBLISHED' } : {}),
      },
      select: {
        listeningStages: { select: { exerciseId: true } },
        videoQuestion: { select: { exerciseId: true } },
      },
    });

    for (const variant of variants) {
      for (const stage of variant.listeningStages) into.add(stage.exerciseId);
      if (variant.videoQuestion) into.add(variant.videoQuestion.exerciseId);
    }
  }

  /** The composition scope decides the document scope too: a draft view reads drafts. */
  private async count(ids: Set<string>, version: 'draft' | 'published'): Promise<Coverage> {
    const derived = await this.axes.forExercises([...ids], version === 'draft' ? 'draft' : 'live');
    return tally([...derived.values()]);
  }
}
