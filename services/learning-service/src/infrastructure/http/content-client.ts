import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';
import type { AppConfig } from '../../config/configuration.js';
import type {
  AccessTier,
  ContentMetadata,
  IContentClient,
  VisibilityResult,
} from '../../shared/application/ports/content-client.port.js';
import { ContentClientError } from '../../shared/application/ports/content-client.port.js';
import { Result } from '../../shared/kernel/result.js';
import {
  ContentRef,
  type ContentType,
} from '../../shared/domain/value-objects/content-ref.js';

@Injectable()
export class ContentClient implements IContentClient {
  private readonly logger = new Logger(ContentClient.name);
  private readonly http: AxiosInstance;

  constructor(config: ConfigService<AppConfig>) {
    const cfg = config.get<AppConfig['content']>('content')!;
    const token = config.get<string>('internalServiceToken' as any)!;

    this.http = axios.create({
      baseURL: `${cfg.baseUrl}/api/internal`,
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
