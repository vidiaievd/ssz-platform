import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { Result } from '../shared/kernel/result.js';
import type { ILessonMediaUsage, LessonMediaUsageError } from '../shared/application/ports/lesson-media-usage.port.js';

/**
 * content-service's internal route, behind `x-internal-token`, under its global `/api/v1`
 * prefix. A wrong path is a 404 — read here as a refusal, never as "nothing is in use",
 * because that is the answer that would delete a narration a lesson still plays.
 */
@Injectable()
export class HttpLessonMediaUsageClient implements ILessonMediaUsage {
  private readonly logger = new Logger(HttpLessonMediaUsageClient.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService<AppConfig>) {
    const content = config.get<AppConfig['contentService']>('contentService')!;
    this.baseUrl = content.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = content.timeoutMs;
    this.token = config.get<string>('internalServiceToken' as never)!;
  }

  async inUse(assetIds: readonly string[]): Promise<Result<Set<string>, LessonMediaUsageError>> {
    if (assetIds.length === 0) return Result.ok(new Set());

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/v1/internal/media/in-use`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-token': this.token },
        body: JSON.stringify({ assetIds: [...assetIds] }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      this.logger.warn(`content-service unreachable: ${err instanceof Error ? err.message : String(err)}`);
      return Result.fail('CONTENT_UNAVAILABLE');
    }

    if (!response.ok) {
      this.logger.warn(`content-service refused the question: HTTP ${response.status}`);
      return Result.fail(response.status >= 500 ? 'CONTENT_UNAVAILABLE' : 'CONTENT_REFUSED');
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return Result.fail('CONTENT_BAD_ANSWER');
    }
    const inUse = (body as { inUse?: unknown } | null)?.inUse;
    if (!Array.isArray(inUse) || !inUse.every((id) => typeof id === 'string')) {
      return Result.fail('CONTENT_BAD_ANSWER');
    }
    return Result.ok(new Set(inUse as string[]));
  }
}
