import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';
import type { AppConfig } from '../../config/configuration.js';
import type {
  CourseReviewPolicy,
  IReviewPolicyReader,
  SchoolReviewPolicy,
} from '../../shared/application/ports/review-policy-reader.port.js';

/**
 * content-service `GET /api/v1/internal/containers/:id/review-policy` and organization-service
 * `GET /api/v1/internal/schools/:id/review-policy` (plan 80, steps 1–2). Both are cached at
 * their source for a minute, so this reads straight through.
 */
@Injectable()
export class HttpReviewPolicyReader implements IReviewPolicyReader {
  private readonly content: { baseUrl: string; timeoutMs: number };
  private readonly organization: { baseUrl: string; timeoutMs: number };
  private readonly token: string;

  constructor(
    private readonly httpService: HttpService,
    config: ConfigService<AppConfig>,
  ) {
    this.content = config.get<AppConfig['content']>('content')!;
    this.organization = config.get<AppConfig['organization']>('organization')!;
    this.token = config.get<string>('internalServiceToken' as any)!;
  }

  courseReviewPolicy(courseId: string): Promise<CourseReviewPolicy | null> {
    return this.read<CourseReviewPolicy>(
      `${this.content.baseUrl}/api/v1/internal/containers/${courseId}/review-policy`,
      this.content.timeoutMs,
    );
  }

  schoolReviewPolicy(schoolId: string): Promise<SchoolReviewPolicy | null> {
    return this.read<SchoolReviewPolicy>(
      `${this.organization.baseUrl}/api/v1/internal/schools/${schoolId}/review-policy`,
      this.organization.timeoutMs,
    );
  }

  private async read<T>(url: string, timeout: number): Promise<T | null> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<T>(url, { headers: { 'x-internal-token': this.token }, timeout }),
      );
      return data;
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 404) return null;
      throw err;
    }
  }
}
