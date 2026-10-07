import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { Result } from '../shared/kernel/result.js';
import type { IRecordingUsage, RecordingUsageError } from '../shared/application/ports/recording-usage.port.js';

/**
 * exercise-engine's internal route, behind `x-internal-token`. The engine has the global
 * `/api/v1` prefix, so the path carries it — a missing prefix is a 404 that would read as
 * "nothing is in use", which is exactly the answer that deletes files.
 *
 * Native `fetch`: the service has no HTTP client package and one POST does not need one.
 */
@Injectable()
export class HttpRecordingUsageClient implements IRecordingUsage {
  private readonly logger = new Logger(HttpRecordingUsageClient.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService<AppConfig>) {
    const engine = config.get<AppConfig['exerciseEngine']>('exerciseEngine')!;
    this.baseUrl = engine.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = engine.timeoutMs;
    this.token = config.get<string>('internalServiceToken' as never)!;
  }

  async inUse(
    assetIds: readonly string[],
    liveDraftSince: Date,
  ): Promise<Result<Set<string>, RecordingUsageError>> {
    if (assetIds.length === 0) return Result.ok(new Set());

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/api/v1/internal/attempts/recordings/in-use`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-token': this.token },
        body: JSON.stringify({ assetIds: [...assetIds], liveDraftSince: liveDraftSince.toISOString() }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      this.logger.warn(`engine unreachable: ${err instanceof Error ? err.message : String(err)}`);
      return Result.fail('ENGINE_UNAVAILABLE');
    }

    if (!response.ok) {
      this.logger.warn(`engine refused the question: HTTP ${response.status}`);
      return Result.fail(response.status >= 500 ? 'ENGINE_UNAVAILABLE' : 'ENGINE_REFUSED');
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return Result.fail('ENGINE_BAD_ANSWER');
    }
    const inUse = (body as { inUse?: unknown } | null)?.inUse;
    if (!Array.isArray(inUse) || !inUse.every((id) => typeof id === 'string')) {
      return Result.fail('ENGINE_BAD_ANSWER');
    }
    return Result.ok(new Set(inUse as string[]));
  }
}
