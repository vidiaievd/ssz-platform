import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { BadRequestException, Inject } from '@nestjs/common';
import { GetUnitContentsQuery } from './get-unit-contents.query.js';
import { PROGRESS_REPOSITORY, type IProgressRepository } from '../../domain/repositories/progress.repository.interface.js';
import {
  CONTENT_CLIENT,
  ContentClientError,
  type IContentClient,
  type ModuleReaderStructureItemRef,
} from '../../../../shared/application/ports/content-client.port.js';
import type { UserProgress } from '../../domain/entities/user-progress.entity.js';

export type UnitItemStatus = 'locked' | 'available' | 'in_progress' | 'completed';

export interface UnitContentsItem {
  id: string;
  contentType: string;
  contentId: string;
  title: string | null;
  lessonKind: string | null;
  durationMinutes: number | null;
  xpReward: number | null;
  status: UnitItemStatus;
}

export interface UnitContentsSection {
  id: string;
  title: string;
  items: UnitContentsItem[];
}

export interface UnitContentsResult {
  moduleId: string;
  moduleTitle: string | null;
  sections: UnitContentsSection[];
  ungroupedItems: UnitContentsItem[];
}

@QueryHandler(GetUnitContentsQuery)
export class GetUnitContentsHandler
  implements IQueryHandler<GetUnitContentsQuery, UnitContentsResult>
{
  constructor(
    @Inject(PROGRESS_REPOSITORY) private readonly progressRepo: IProgressRepository,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
  ) {}

  async execute(query: GetUnitContentsQuery): Promise<UnitContentsResult> {
    const structureResult = await this.contentClient.getModuleReaderStructure(query.moduleId);
    if (structureResult.isFail) {
      throw new BadRequestException(
        `Cannot fetch unit structure: ${(structureResult.error as ContentClientError).message}`,
      );
    }
    const structure = structureResult.value;

    // All items within a sub-lesson (module) are available at once — gating
    // now happens only between sub-lessons, not between items inside one
    // (course-access-and-navigation decision 2026-07-19, supersedes the old
    // plan 29 BE3.1 per-item sequential unlock).
    const flattened = structure.sections.flatMap((s) => s.items).concat(structure.ungroupedItems);

    const progressRows = await this.progressRepo.findByUserAndContentIds(
      query.userId,
      flattened.map((i) => i.ref.id),
    );
    const progressByContentId = new Map(progressRows.map((p) => [p.contentRef.id, p]));

    const statusByItemId = new Map<string, UnitItemStatus>();
    for (const item of flattened) {
      const progress = progressByContentId.get(item.ref.id);
      statusByItemId.set(item.id, this.resolveStatus(progress));
    }

    const toDto = (item: ModuleReaderStructureItemRef): UnitContentsItem => ({
      id: item.id,
      contentType: item.ref.type,
      contentId: item.ref.id,
      title: item.title,
      lessonKind: item.lessonKind,
      durationMinutes: item.durationMinutes,
      xpReward: item.xpReward,
      status: statusByItemId.get(item.id) ?? 'locked',
    });

    return {
      moduleId: structure.moduleId,
      moduleTitle: structure.moduleTitle,
      sections: structure.sections.map((s) => ({ id: s.id, title: s.title, items: s.items.map(toDto) })),
      ungroupedItems: structure.ungroupedItems.map(toDto),
    };
  }

  private resolveStatus(progress: UserProgress | undefined): UnitItemStatus {
    if (progress?.status === 'COMPLETED') return 'completed';
    if (progress?.status === 'IN_PROGRESS' || progress?.status === 'NEEDS_REVIEW') return 'in_progress';
    return 'available';
  }
}
