import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';
import type { AppConfig } from '../../config/configuration.js';
import type {
  CreateSubmissionInput,
  CreateSubmissionOutput,
  ILearningClient,
} from '../../shared/application/ports/learning-client.port.js';
import { LearningClientError } from '../../shared/application/ports/learning-client.port.js';
import { Result } from '../../shared/kernel/result.js';

@Injectable()
export class HttpLearningClient implements ILearningClient {
  private readonly logger = new Logger(HttpLearningClient.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeout: number;

  constructor(
    private readonly httpService: HttpService,
    config: ConfigService<AppConfig>,
  ) {
    const cfg = config.get<AppConfig['learning']>('learning')!;
    this.baseUrl = cfg.baseUrl;
    this.token = config.get<string>('internalServiceToken' as any)!;
    this.timeout = cfg.timeoutMs;
  }

  async createSubmission(
    input: CreateSubmissionInput,
  ): Promise<Result<CreateSubmissionOutput, LearningClientError>> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<CreateSubmissionOutput>(
          `${this.baseUrl}/api/v1/submissions`,
          {
            assignmentId: input.assignmentId,
            exerciseId: input.exerciseId,
            userId: input.userId,
            attemptId: input.attemptId,
            submittedAnswer: input.submittedAnswer,
            timeSpentSeconds: input.timeSpentSeconds,
          },
          {
            headers: { 'x-internal-token': this.token },
            timeout: this.timeout,
          },
        ),
      );
      return Result.ok(data);
    } catch (err) {
      return this.mapError(err, `createSubmission(exerciseId=${input.exerciseId})`);
    }
  }

  private mapError(err: unknown, context: string): Result<never, LearningClientError> {
    if (isAxiosError(err)) {
      const status = err.response?.status ?? 500;
      const message = (err.response?.data as any)?.message ?? err.message;
      this.logger.warn(`LearningClient [${context}] → ${status}: ${message}`);
      return Result.fail(new LearningClientError(status, message));
    }
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`LearningClient [${context}] unexpected: ${message}`);
    return Result.fail(new LearningClientError(500, message));
  }
}
