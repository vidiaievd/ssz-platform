import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../../config/configuration.js';
import type { ISchoolLearnerLookup } from '../../domain/ports/school-learner-lookup.port.js';

/**
 * learning-service's `GET /api/v1/internal/content/schools/:schoolId/learners/:userId` behind
 * `x-service-token` (learning's internal header, not `x-internal-token`).
 */
@Injectable()
export class HttpSchoolLearnerLookup implements ISchoolLearnerLookup {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly token: string;

  constructor(config: ConfigService<AppConfig>) {
    const learning = config.get<AppConfig['learning']>('learning')!;
    this.baseUrl = learning.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = learning.timeoutMs;
    this.token = config.get<string>('internalServiceToken')!;
  }

  async wasSchoolLearner(userId: string, schoolId: string): Promise<boolean> {
    const url =
      `${this.baseUrl}/api/v1/internal/content/schools/${encodeURIComponent(schoolId)}` +
      `/learners/${encodeURIComponent(userId)}`;
    const response = await fetch(url, {
      headers: { 'x-service-token': this.token },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`learning-service refused school-learner: HTTP ${response.status}`);
    const body = (await response.json()) as { learner?: unknown };
    if (typeof body.learner !== 'boolean') {
      throw new Error('learning-service answered school-learner with a malformed body');
    }
    return body.learner;
  }
}
