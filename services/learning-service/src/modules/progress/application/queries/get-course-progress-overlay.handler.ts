import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { BadRequestException, Inject } from '@nestjs/common';
import { GetCourseProgressOverlayQuery } from './get-course-progress-overlay.query.js';
import { PROGRESS_REPOSITORY, type IProgressRepository } from '../../domain/repositories/progress.repository.interface.js';
import {
  CONTENT_CLIENT,
  ContentClientError,
  type IContentClient,
} from '../../../../shared/application/ports/content-client.port.js';
import type { ProgressStatus } from '../../domain/entities/user-progress.entity.js';

export interface ItemProgressEntry {
  contentType: string;
  contentId: string;
  status: ProgressStatus;
  completedAt: string | null;
  score: number | null;
  // Sub-lesson (module) this leaf belongs to; null when directly under the
  // course. Lets consumers roll progress up per sub-lesson.
  moduleId: string | null;
  isRequired: boolean;
}

export interface CourseProgressOverlay {
  containerId: string;
  totalItems: number;
  completedItems: number;
  completionRatio: number;
  items: ItemProgressEntry[];
}

@QueryHandler(GetCourseProgressOverlayQuery)
export class GetCourseProgressOverlayHandler
  implements IQueryHandler<GetCourseProgressOverlayQuery, CourseProgressOverlay>
{
  constructor(
    @Inject(PROGRESS_REPOSITORY) private readonly progressRepo: IProgressRepository,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
  ) {}

  async execute(query: GetCourseProgressOverlayQuery): Promise<CourseProgressOverlay> {
    const leafResult = await this.contentClient.getCourseLeafItems(query.containerId);
    if (leafResult.isFail) {
      throw new BadRequestException(
        `Cannot fetch course structure: ${(leafResult.error as ContentClientError).message}`,
      );
    }

    const leafItems = leafResult.value;
    const contentIds = leafItems.map((i) => i.ref.id);

    const progressRows = await this.progressRepo.findByUserAndContentIds(query.userId, contentIds);
    const progressByContentId = new Map(progressRows.map((p) => [p.contentRef.id, p]));

    const items: ItemProgressEntry[] = leafItems.map((leaf) => {
      const p = progressByContentId.get(leaf.ref.id);
      return {
        contentType: leaf.ref.type,
        contentId: leaf.ref.id,
        status: p?.status ?? 'NOT_STARTED',
        completedAt: p?.completedAt?.toISOString() ?? null,
        score: p?.score ?? null,
        moduleId: leaf.moduleId,
        isRequired: leaf.isRequired,
      };
    });

    const completedItems = items.filter((i) => i.status === 'COMPLETED').length;
    const totalItems = items.length;

    return {
      containerId: query.containerId,
      totalItems,
      completedItems,
      completionRatio: totalItems === 0 ? 0 : completedItems / totalItems,
      items,
    };
  }
}
