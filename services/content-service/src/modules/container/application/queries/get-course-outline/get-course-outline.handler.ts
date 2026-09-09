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

    return Result.ok({
      containerId: container.id,
      versionId,
      units: unitsOf(tree.value, container.id, container.title),
    });
  }
}

/** A unit before it is put in order — sorted on where it sits in the version. */
interface UnsortedUnit extends Omit<CourseOutlineUnit, 'order'> {
  sortKey: [number, number];
}

/**
 * A course's units in teaching order.
 *
 * Usually a unit is a module. But a course may also hold lessons directly,
 * without modules at all, and those lessons are just as teachable — ignoring
 * them would leave such a course looking empty to anyone planning from it. The
 * lessons a course keeps in one of its own levels therefore form a unit of their
 * own, named after that level, or after the course when it has no levels.
 */
function unitsOf(
  tree: CurriculumTreeResult,
  containerId: string,
  courseTitle: string,
): CourseOutlineUnit[] {
  const units: UnsortedUnit[] = [];

  tree.levels.forEach((level, levelIndex) => {
    for (const module of level.modules) {
      units.push({
        id: module.containerId,
        placementId: module.id,
        title: module.title ?? module.titleEn,
        sortKey: [levelIndex, module.position],
        items: orderedItems(module),
      });
    }

    if (level.items.length) {
      units.push({
        // A level is not a container of its own, so the course stands in as the
        // unit's identity when the level has no id.
        id: level.id ?? containerId,
        placementId: level.id ?? containerId,
        title: level.title ?? courseTitle,
        sortKey: [levelIndex, Math.min(...level.items.map((i) => i.position))],
        items: toOutlineItems(level.items),
      });
    }
  });

  // Lessons placed on the course itself, in no level. A flat course is nothing
  // but these.
  if (tree.ungroupedItems.length) {
    units.push({
      id: containerId,
      placementId: containerId,
      title: courseTitle,
      sortKey: [tree.levels.length, 0],
      items: toOutlineItems(tree.ungroupedItems),
    });
  }

  return units
    .sort((a, b) => a.sortKey[0] - b.sortKey[0] || a.sortKey[1] - b.sortKey[1])
    .map((unit, i) => ({
      id: unit.id,
      placementId: unit.placementId,
      title: unit.title,
      order: i + 1,
      items: unit.items,
    }));
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
  return toOutlineItems([
    ...module.sections.flatMap((section) => section.items),
    ...module.ungroupedItems,
  ]);
}

function toOutlineItems(items: CurriculumTreeItemNode[]): CourseOutlineItem[] {
  return [...items]
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
