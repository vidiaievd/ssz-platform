import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';
import type { AppConfig } from '../../config/configuration.js';
import type {
  ExerciseDefinition,
  IContentClient,
} from '../../shared/application/ports/content-client.port.js';
import { ContentClientError } from '../../shared/application/ports/content-client.port.js';
import { Result } from '../../shared/kernel/result.js';

@Injectable()
export class HttpContentClient implements IContentClient {
  private readonly logger = new Logger(HttpContentClient.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeout: number;

  constructor(
    private readonly httpService: HttpService,
    config: ConfigService<AppConfig>,
  ) {
    const cfg = config.get<AppConfig['content']>('content')!;
    this.baseUrl = cfg.baseUrl;
    this.token = config.get<string>('internalServiceToken' as any)!;
    this.timeout = cfg.timeoutMs;
  }

  async getExerciseForAttempt(
    exerciseId: string,
    language: string,
  ): Promise<Result<ExerciseDefinition, ContentClientError>> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<ExerciseDefinition>(
          `${this.baseUrl}/api/v1/internal/exercises/${exerciseId}`,
          {
            params: { language },
            headers: { 'x-internal-token': this.token },
            timeout: this.timeout,
          },
        ),
      );
      return Result.ok(data);
    } catch (err) {
      return this.mapError(err, `getExerciseForAttempt(${exerciseId})`);
    }
  }

  private mapError(err: unknown, context: string): Result<never, ContentClientError> {
    if (isAxiosError(err)) {
      const status = err.response?.status ?? 500;
      const message = (err.response?.data as any)?.message ?? err.message;
      this.logger.warn(`ContentClient [${context}] → ${status}: ${message}`);
      return Result.fail(new ContentClientError(status, message));
    }
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`ContentClient [${context}] unexpected: ${message}`);
    return Result.fail(new ContentClientError(500, message));
  }
}
