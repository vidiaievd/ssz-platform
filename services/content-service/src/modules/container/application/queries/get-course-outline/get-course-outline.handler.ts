import { QueryHandler, QueryBus, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { GetCourseOutlineQuery } from './get-course-outline.query.js';
import { GetCurriculumTreeQuery } from '../get-curriculum-tree/get-curriculum-tree.query.js';
import type {
  CurriculumTreeItemNode,
  CurriculumTreeResult,
} from '../get-curriculum-tree/get-curriculum-tree.handler.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { ContainerDomainError } from '../../../domain/exceptions/container-domain.exceptions.js';
import { CONTAINER_REPOSITORY } from '../../../domain/repositories/container.repository.interface.js';
import type { IContainerRepository } from '../../../domain/repositories/container.repository.interface.js';

/** One teachable item of a course unit, in the order a group works through it. */
export interface CourseOutlineItem {
  /**
   * Stable identity of the item itself — the lesson, exercise or list behind the
   * placement. Schedulers store this: placement rows are recreated on every
   * publish, so a session pointing at one would lose its topic the next time the
   * course is published.
   */
  id: string;
  /** The placement row inside the version. Version-scoped; for joining with the curriculum tree. */
  placementId: string;
  itemType: string;
  /** Lesson kind (text/video/audio/live); null for anything that is not a lesson. */
  kind: string | null;
  title: string | null;
  position: number;
  durationMinutes: number | null;
}

export interface CourseOutlineUnit {
  /** Stable identity of the unit — the module container. See CourseOutlineItem.id. */
  id: string;
  placementId: string;
  title: string | null;
  /** Position among the course's units, counted across levels, starting at 1. */
  order: number;
  items: CourseOutlineItem[];
}

export interface CourseOutlineResult {
  containerId: string;
  /** The published version this outline describes; null when nothing is published yet. */
  versionId: string | null;
  units: CourseOutlineUnit[];
}

const EMPTY_OUTLINE = (containerId: string): CourseOutlineResult => ({
  containerId,
  versionId: null,
  units: [],
});

/**
 * A course as a flat, ordered teaching outline: units, and within each unit the
 * items in the order they are worked through. Read by scheduling-service to lay
 * a group's sessions over the course content.
 *
 * Always describes the *published* version. A group's schedule is what students
 * will be taught, and students never see a draft.
 */
@QueryHandler(GetCourseOutlineQuery)
export class GetCourseOutlineHandler implements IQueryHandler<
  GetCourseOutlineQuery,
  Result<CourseOutlineResult, ContainerDomainError>
> {
  constructor(
    @Inject(CONTAINER_REPOSITORY)
    private readonly containerRepo: IContainerRepository,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(
    query: GetCourseOutlineQuery,
  ): Promise<Result<CourseOutlineResult, ContainerDomainError>> {
    const container = await this.containerRepo.findById(query.containerId);
    if (!container) return Result.fail(ContainerDomainError.CONTAINER_NOT_FOUND);

    const versionId = container.currentPublishedVersionId;
    // Nothing published is a legal state, not a missing course: the course
    // exists, there is simply nothing a group could be taught from yet.
    if (!versionId) return Result.ok(EMPTY_OUTLINE(container.id));

    const tree = await this.queryBus.execute<
      GetCurriculumTreeQuery,
      Result<CurriculumTreeResult, ContainerDomainError>
    >(new GetCurriculumTreeQuery(versionId));
    if (tree.isFail) return Result.fail(tree.error);

    let order = 0;
    const units: CourseOutlineUnit[] = tree.value.levels.flatMap((level) =>
      level.modules.map((module) => {
        order += 1;
        return {
          id: module.containerId,
          placementId: module.id,
          title: module.title ?? module.titleEn,
          order,
          items: orderedItems(module),
        };
      }),
    );

    return Result.ok({ containerId: container.id, versionId, units });
  }
}

/**
 * A unit's items in working order. Sections group items for the author, but a
 * group is taught one item after another, so both sectioned and ungrouped items
 * are flattened onto a single ordered run.
 */
function orderedItems(module: {
  sections: Array<{ items: CurriculumTreeItemNode[] }>;
  ungroupedItems: CurriculumTreeItemNode[];
}): CourseOutlineItem[] {
  return [...module.sections.flatMap((section) => section.items), ...module.ungroupedItems]
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      id: item.refId,
      placementId: item.id,
      itemType: item.itemType,
      kind: item.lessonKind,
      title: item.title,
      position: item.position,
      durationMinutes: item.durationMinutes,
    }));
}
