import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';
import type { AppConfig } from '../../config/configuration.js';
import type {
  IMediaAssets,
  MediaAssetDescription,
} from '../../shared/application/ports/media-assets.port.js';
import { MediaAssetsError } from '../../shared/application/ports/media-assets.port.js';
import { Result } from '../../shared/kernel/result.js';

/**
 * media-service's internal routes, behind `x-internal-token` like every other neighbour.
 *
 * media-service has the global `/api/v1` prefix, so the path carries it — the same trap the
 * engine's own internal clients fell into once (a 404 that read as "no such asset").
 */
@Injectable()
export class HttpMediaAssetsClient implements IMediaAssets {
  private readonly logger = new Logger(HttpMediaAssetsClient.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeout: number;

  constructor(
    private readonly httpService: HttpService,
    config: ConfigService<AppConfig>,
  ) {
    const cfg = config.get<AppConfig['media']>('media')!;
    this.baseUrl = cfg.baseUrl;
    this.token = config.get<string>('internalServiceToken' as any)!;
    this.timeout = cfg.timeoutMs;
  }

  async describe(ids: string[]): Promise<Result<MediaAssetDescription[], MediaAssetsError>> {
    // The route refuses an empty list with a 400, and an empty question has an empty answer.
    if (ids.length === 0) return Result.ok([]);

    try {
      const { data } = await firstValueFrom(
        this.httpService.post<MediaAssetDescription[]>(
          `${this.baseUrl}/api/v1/internal/media/assets/describe`,
          { ids: [...new Set(ids)] },
          {
            headers: { 'x-internal-token': this.token },
            timeout: this.timeout,
          },
        ),
      );
      return Result.ok(Array.isArray(data) ? data : []);
    } catch (err) {
      return this.mapError(err, `describe(${ids.length} ids)`);
    }
  }

  private mapError(err: unknown, context: string): Result<never, MediaAssetsError> {
    if (isAxiosError(err)) {
      // No response at all is media-service being away, and is reported as such: the
      // submit answers 503 and keeps the draft, rather than calling the takes missing.
      const status = err.response?.status ?? 503;
      const message = (err.response?.data as any)?.message ?? err.message;
      this.logger.warn(`MediaClient [${context}] → ${status}: ${message}`);
      return Result.fail(new MediaAssetsError(status, message));
    }
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`MediaClient [${context}] unexpected: ${message}`);
    return Result.fail(new MediaAssetsError(503, message));
  }
}
