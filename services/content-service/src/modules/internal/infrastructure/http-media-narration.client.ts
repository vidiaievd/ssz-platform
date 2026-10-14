import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../../../config/configuration.js';
import type { IMediaNarrationClient, NarrationRequest } from '../application/narration/media-narration.port.js';
import type { NarrationAssetInfo } from '../application/narration/narration-plan.js';

const DESCRIBE_CHUNK = 100;

/**
 * media-service's `/api/v1/internal/media/*` routes behind `x-internal-token`. A wrong path is a
 * 404, so every non-2xx answer is a refusal and never "no such asset".
 */
@Injectable()
export class HttpMediaNarrationClient implements IMediaNarrationClient {
  private readonly logger = new Logger(HttpMediaNarrationClient.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly token: string;

  constructor(config: ConfigService<AppConfig>) {
    const media = config.get<AppConfig['media']>('media')!;
    this.baseUrl = media.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = media.timeoutMs;
    this.token = config.get<string>('internalServiceToken')!;
  }

  async describe(assetIds: readonly string[]): Promise<Map<string, NarrationAssetInfo>> {
    const found = new Map<string, NarrationAssetInfo>();
    const unique = [...new Set(assetIds)];
    for (let i = 0; i < unique.length; i += DESCRIBE_CHUNK) {
      const response = await this.post('/internal/media/assets/describe', { ids: unique.slice(i, i + DESCRIBE_CHUNK) });
      if (!response.ok) throw new ServiceUnavailableException(`media-service refused describe: HTTP ${response.status}`);
      const rows = (await response.json()) as Array<{
        id: string;
        status: string;
        origin: string;
        textHash: string | null;
        lengthScale: number | null;
        pauseScale: number | null;
        voiceId: string | null;
      }>;
      for (const row of rows) found.set(row.id, {
          status: row.status,
          origin: row.origin,
          textHash: row.textHash,
          lengthScale: row.lengthScale,
          pauseScale: row.pauseScale,
          voiceId: row.voiceId,
        });
    }
    return found;
  }

  async narrate(request: NarrationRequest): Promise<{ assetId: string } | { reason: string }> {
    let response: Response;
    try {
      response = await this.post('/internal/media/narration', request);
    } catch (err) {
      return { reason: `MEDIA_UNAVAILABLE: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (response.status === 422) {
      const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
      return { reason: typeof body?.message === 'string' ? body.message : 'REFUSED' };
    }
    if (!response.ok) return { reason: `HTTP_${response.status}` };
    const body = (await response.json()) as { assetId?: string };
    return body.assetId ? { assetId: body.assetId } : { reason: 'BAD_ANSWER' };
  }

  async supersede(assetId: string, byAssetId: string): Promise<boolean> {
    try {
      const response = await this.post(`/internal/media/assets/${assetId}/supersede`, { by: byAssetId });
      if (!response.ok) this.logger.warn(`supersede ${assetId} → ${byAssetId}: HTTP ${response.status}`);
      return response.ok;
    } catch (err) {
      this.logger.warn(`supersede ${assetId} → ${byAssetId}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  private post(path: string, body: unknown): Promise<Response> {
    return fetch(`${this.baseUrl}/api/v1${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-token': this.token },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }
}
