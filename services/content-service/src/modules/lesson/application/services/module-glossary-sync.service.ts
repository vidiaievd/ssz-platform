import { ContentRelationEntity } from '../../../content-relation/domain/entities/content-relation.entity.js';
import { RelatableEntityType } from '../../../content-relation/domain/types/relatable-entity-type.js';
import { RelationKind } from '../../../content-relation/domain/types/relation-kind.js';
import type { IContentRelationRepository } from '../../../content-relation/domain/repositories/content-relation.repository.interface.js';
import type { ILessonRepository } from '../../domain/repositories/lesson.repository.interface.js';
import type { LessonEntity } from '../../domain/entities/lesson.entity.js';

/**
 * Adds a vocabulary item to the glossary of every module that currently contains
 * the lesson — "Text and Video share one glossary per module" (decision 3 /
 * BE1.5). Reuses the same INTRODUCES relation `get-expanded-module` reads.
 *
 * Shared by the two write paths that put a word into a lesson's glossary:
 * marking it from the authoring panel, and creating a vocab span over it in the
 * text. Both must sync, or a word annotated in the text would be missing from
 * the unit's word list and from SRS seeding.
 *
 * Deliberately additive only. Removing the relation is a module-level decision:
 * another lesson in the same module may introduce the same word, and dropping it
 * here would silently strip the word from students' vocabulary lists.
 */
export async function syncModuleGlossary(
  deps: { lessonRepo: ILessonRepository; contentRelationRepo: IContentRelationRepository },
  params: { lesson: LessonEntity; vocabularyItemId: string; userId: string },
): Promise<void> {
  const moduleIds = await deps.lessonRepo.findContainingModuleIds(params.lesson.id);

  for (const moduleId of moduleIds) {
    const existing = await deps.contentRelationRepo.findExact(
      RelatableEntityType.CONTAINER,
      moduleId,
      RelationKind.INTRODUCES,
      RelatableEntityType.VOCABULARY_ITEM,
      params.vocabularyItemId,
    );
    if (existing) continue;

    const relation = ContentRelationEntity.create({
      sourceType: RelatableEntityType.CONTAINER,
      sourceId: moduleId,
      targetType: RelatableEntityType.VOCABULARY_ITEM,
      targetId: params.vocabularyItemId,
      relationKind: RelationKind.INTRODUCES,
      ownerSchoolId: params.lesson.ownerSchoolId,
      createdByUserId: params.userId,
    });
    await deps.contentRelationRepo.save(relation);
  }
}
