import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';
import type { AppConfig } from '../../config/configuration.js';
import type {
  AccessTier,
  CanDoDescriptorRef,
  ContentMetadata,
  ContentRelationRef,
  IContentClient,
  ModuleReaderStructureItemRef,
  ModuleReaderStructureRef,
  RelatableEntityType,
  RelationKind,
  VisibilityResult,
} from '../../shared/application/ports/content-client.port.js';
import { ContentClientError } from '../../shared/application/ports/content-client.port.js';
import { Result } from '../../shared/kernel/result.js';
import {
  ContentRef,
  type ContentType,
} from '../../shared/domain/value-objects/content-ref.js';

// Content Service's internal reader-structure endpoint serializes ContainerItemType
// as its lowercase domain value (e.g. 'lesson'), not the uppercase ContentType wire
// convention used by getContainerLeafItems — translate at this boundary.
const WIRE_ITEM_TYPE_TO_CONTENT_TYPE: Record<string, ContentType> = {
  container: 'CONTAINER',
  lesson: 'LESSON',
  vocabulary_list: 'VOCABULARY_LIST',
  grammar_rule: 'GRAMMAR_RULE',
  exercise: 'EXERCISE',
};

interface ModuleReaderStructureItemWireDto {
  id: string;
  itemType: string;
  refId: string;
  title: string | null;
  position: number;
  lessonKind: string | null;
  durationMinutes: number | null;
}

interface ModuleReaderStructureSectionWireDto {
  id: string;
  title: string;
  position: number;
  items: ModuleReaderStructureItemWireDto[];
}

interface ModuleReaderStructureWireDto {
  moduleId: string;
  moduleTitle: string | null;
  sections: ModuleReaderStructureSectionWireDto[];
  ungroupedItems: ModuleReaderStructureItemWireDto[];
}

@Injectable()
export class ContentClient implements IContentClient {
  private readonly logger = new Logger(ContentClient.name);
  private readonly http: AxiosInstance;

  constructor(config: ConfigService<AppConfig>) {
    const cfg = config.get<AppConfig['content']>('content')!;
    const token = config.get<string>('internalServiceToken' as any)!;

    this.http = axios.create({
      // Content Service mounts everything behind the 'api/v1' global prefix,
      // including its 'internal' controller — there is no bare '/api/internal'.
      baseURL: `${cfg.baseUrl}/api/v1/internal`,
      timeout: cfg.timeoutMs,
      headers: {
        'x-internal-token': token,
        'Content-Type': 'application/json',
      },
    });
  }

  async getContentMetadata(
    ref: ContentRef,
  ): Promise<Result<ContentMetadata, ContentClientError>> {
    try {
      const { data } = await this.http.get<ContentMetadata>(
        `/content-items/${ref.type}/${ref.id}`,
      );
      return Result.ok(data);
    } catch (err) {
      return this.mapError(err, `getContentMetadata(${ref})`);
    }
  }

  async checkVisibilityForUser(
    ref: ContentRef,
    userId: string,
  ): Promise<Result<VisibilityResult, ContentClientError>> {
    try {
      const { data } = await this.http.get<VisibilityResult>(
        `/content-items/${ref.type}/${ref.id}/visibility`,
        { params: { userId } },
      );
      return Result.ok(data);
    } catch (err) {
      return this.mapError(err, `checkVisibilityForUser(${ref}, ${userId})`);
    }
  }

  async getAccessTier(
    containerId: string,
  ): Promise<Result<AccessTier, ContentClientError>> {
    try {
      const { data } = await this.http.get<{ accessTier: AccessTier }>(
        `/containers/${containerId}/access-tier`,
      );
      return Result.ok(data.accessTier);
    } catch (err) {
      return this.mapError(err, `getAccessTier(${containerId})`);
    }
  }

  async getContainerLeafItems(
    containerId: string,
  ): Promise<Result<ContentRef[], ContentClientError>> {
    try {
      const { data } = await this.http.get<Array<{ type: string; id: string }>>(
        `/containers/${containerId}/leaf-items`,
      );

      const refs: ContentRef[] = [];
      for (const item of data) {
        const ref = ContentRef.create(item.type as ContentType, item.id);
        if (ref.isFail) {
          return Result.fail(new ContentClientError(`Invalid content ref from Content Service: ${ref.error.message}`));
        }
        refs.push(ref.value);
      }

      return Result.ok(refs);
    } catch (err) {
      return this.mapError(err, `getContainerLeafItems(${containerId})`);
    }
  }

  async getModuleReaderStructure(
    moduleId: string,
  ): Promise<Result<ModuleReaderStructureRef, ContentClientError>> {
    try {
      const { data } = await this.http.get<ModuleReaderStructureWireDto>(
        `/modules/${moduleId}/reader-structure`,
      );

      const sections: ModuleReaderStructureRef['sections'] = [];
      for (const section of data.sections) {
        const items = this.mapReaderStructureItems(section.items);
        if (items.isFail) return Result.fail(items.error);
        sections.push({ id: section.id, title: section.title, position: section.position, items: items.value });
      }

      const ungroupedItems = this.mapReaderStructureItems(data.ungroupedItems);
      if (ungroupedItems.isFail) return Result.fail(ungroupedItems.error);

      return Result.ok({
        moduleId: data.moduleId,
        moduleTitle: data.moduleTitle,
        sections,
        ungroupedItems: ungroupedItems.value,
      });
    } catch (err) {
      return this.mapError(err, `getModuleReaderStructure(${moduleId})`);
    }
  }

  private mapReaderStructureItems(
    items: ModuleReaderStructureItemWireDto[],
  ): Result<ModuleReaderStructureItemRef[], ContentClientError> {
    const mapped: ModuleReaderStructureItemRef[] = [];
    for (const item of items) {
      const contentType = WIRE_ITEM_TYPE_TO_CONTENT_TYPE[item.itemType];
      if (!contentType) {
        return Result.fail(
          new ContentClientError(`Unknown item type from Content Service: ${item.itemType}`),
        );
      }
      const ref = ContentRef.create(contentType, item.refId);
      if (ref.isFail) {
        return Result.fail(new ContentClientError(`Invalid content ref from Content Service: ${ref.error.message}`));
      }
      mapped.push({
        id: item.id,
        ref: ref.value,
        title: item.title,
        position: item.position,
        lessonKind: item.lessonKind,
        durationMinutes: item.durationMinutes,
      });
    }
    return Result.ok(mapped);
  }

  async getVocabularyListItems(
    listId: string,
  ): Promise<Result<string[], ContentClientError>> {
    try {
      const { data } = await this.http.get<Array<{ id: string }>>(
        `/vocabulary-lists/${listId}/items`,
      );
      return Result.ok(data.map((item) => item.id));
    } catch (err) {
      return this.mapError(err, `getVocabularyListItems(${listId})`);
    }
  }

  async getVocabularyListAutoAddToSrs(
    listId: string,
  ): Promise<Result<boolean, ContentClientError>> {
    try {
      const { data } = await this.http.get<{ autoAddToSrs: boolean }>(
        `/vocabulary-lists/${listId}`,
      );
      return Result.ok(data.autoAddToSrs);
    } catch (err) {
      return this.mapError(err, `getVocabularyListAutoAddToSrs(${listId})`);
    }
  }

  async getRelationsBySource(
    sourceType: RelatableEntityType,
    sourceId: string,
    relationKind?: RelationKind,
  ): Promise<Result<ContentRelationRef[], ContentClientError>> {
    try {
      const { data } = await this.http.get<ContentRelationRef[]>('/content-relations', {
        params: { sourceType, sourceId, relationKind },
      });
      return Result.ok(data);
    } catch (err) {
      return this.mapError(err, `getRelationsBySource(${sourceType}, ${sourceId})`);
    }
  }

  async getRelationsByTarget(
    targetType: RelatableEntityType,
    targetId: string,
    relationKind?: RelationKind,
  ): Promise<Result<ContentRelationRef[], ContentClientError>> {
    try {
      const { data } = await this.http.get<ContentRelationRef[]>('/content-relations', {
        params: { targetType, targetId, relationKind },
      });
      return Result.ok(data);
    } catch (err) {
      return this.mapError(err, `getRelationsByTarget(${targetType}, ${targetId})`);
    }
  }

  async getCanDoDescriptorsByIds(
    ids: string[],
  ): Promise<Result<CanDoDescriptorRef[], ContentClientError>> {
    if (ids.length === 0) return Result.ok([]);
    try {
      const { data } = await this.http.get<CanDoDescriptorRef[]>('/can-do/descriptors', {
        params: { ids: ids.join(',') },
      });
      return Result.ok(data);
    } catch (err) {
      return this.mapError(err, `getCanDoDescriptorsByIds([${ids.join(',')}])`);
    }
  }

  async getGrammarRulePoolExerciseIds(
    ruleId: string,
  ): Promise<Result<string[], ContentClientError>> {
    try {
      const { data } = await this.http.get<{ exerciseIds: string[] }>(
        `/grammar-rules/${ruleId}/pool-exercise-ids`,
      );
      return Result.ok(data.exerciseIds);
    } catch (err) {
      return this.mapError(err, `getGrammarRulePoolExerciseIds(${ruleId})`);
    }
  }

  private mapError(err: unknown, context: string): Result<never, ContentClientError> {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      const message = (err.response?.data as any)?.message ?? err.message;
      this.logger.warn(`ContentClient [${context}] → ${status ?? 'network'}: ${message}`);
      return Result.fail(new ContentClientError(message, status));
    }
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`ContentClient [${context}] unexpected error: ${message}`);
    return Result.fail(new ContentClientError(message));
  }
}
