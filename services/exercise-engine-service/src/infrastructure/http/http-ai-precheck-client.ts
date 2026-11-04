import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';
import type { AppConfig } from '../../config/configuration.js';
import {
  AiPrecheckClientError,
  type AiPrecheckOutcome,
  type AiPrecheckRequest,
  type AiSentenceCheckOutcome,
  type AiSentenceCheckRequest,
  type IAiPrecheckClient,
} from '../../shared/application/ports/ai-precheck-client.port.js';
import { Result } from '../../shared/kernel/result.js';

const OUTCOMES: ReadonlySet<string> = new Set(['ok', 'refused', 'failed']);

/**
 * ai-service `POST /api/v1/internal/precheck` (plan 84, step 2). No retry: the learner is
 * waiting, the call may already have been billed, and pressing the button again is theirs.
 */
@Injectable()
export class HttpAiPrecheckClient implements IAiPrecheckClient {
  private readonly logger = new Logger(HttpAiPrecheckClient.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeout: number;

  constructor(
    private readonly httpService: HttpService,
    config: ConfigService<AppConfig>,
  ) {
    const cfg = config.get<AppConfig['ai']>('ai')!;
    this.baseUrl = cfg.baseUrl;
    this.token = config.get<string>('internalServiceToken' as any)!;
    this.timeout = cfg.timeoutMs;
  }

  async precheck(request: AiPrecheckRequest): Promise<Result<AiPrecheckOutcome, AiPrecheckClientError>> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<AiPrecheckOutcome>(`${this.baseUrl}/api/v1/internal/precheck`, request, {
          headers: { 'x-internal-token': this.token },
          timeout: this.timeout,
        }),
      );
      if (!OUTCOMES.has((data as { status?: unknown } | null)?.status as string)) {
        return Result.fail(new AiPrecheckClientError(502, 'ai-service answered without an outcome'));
      }
      return Result.ok(data);
    } catch (err) {
      const status = isAxiosError(err) ? (err.response?.status ?? 503) : 500;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`AiPrecheckClient [attempt ${request.attemptId}] → ${status}: ${message}`);
      return Result.fail(new AiPrecheckClientError(status, message));
    }
  }

  async sentenceCheck(request: AiSentenceCheckRequest): Promise<Result<AiSentenceCheckOutcome, AiPrecheckClientError>> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<AiSentenceCheckOutcome>(`${this.baseUrl}/api/v1/internal/sentence-checks`, request, {
          headers: { 'x-internal-token': this.token },
          timeout: this.timeout,
        }),
      );
      if (!OUTCOMES.has((data as { status?: unknown } | null)?.status as string)) {
        return Result.fail(new AiPrecheckClientError(502, 'ai-service answered without an outcome'));
      }
      return Result.ok(data);
    } catch (err) {
      const status = isAxiosError(err) ? (err.response?.status ?? 503) : 500;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`AiPrecheckClient [sentence of ${request.exerciseId}] → ${status}: ${message}`);
      return Result.fail(new AiPrecheckClientError(status, message));
    }
  }
}
