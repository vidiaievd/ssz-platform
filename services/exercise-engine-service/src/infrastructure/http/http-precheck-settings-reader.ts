import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';
import type { AppConfig } from '../../config/configuration.js';
import type {
  IPrecheckSettingsReader,
  SchoolAiPrecheckSettings,
} from '../../shared/application/ports/precheck-settings-reader.port.js';

/**
 * organization-service `GET /api/v1/internal/schools/:id/ai-precheck` (plan 84, step 4). Read
 * straight through, as the review policy is: one row, read when a learner presses "check".
 */
@Injectable()
export class HttpPrecheckSettingsReader implements IPrecheckSettingsReader {
  private readonly organization: { baseUrl: string; timeoutMs: number };
  private readonly token: string;

  constructor(
    private readonly httpService: HttpService,
    config: ConfigService<AppConfig>,
  ) {
    this.organization = config.get<AppConfig['organization']>('organization')!;
    this.token = config.get<string>('internalServiceToken' as any)!;
  }

  async schoolAiPrecheck(schoolId: string): Promise<SchoolAiPrecheckSettings | null> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<SchoolAiPrecheckSettings>(
          `${this.organization.baseUrl}/api/v1/internal/schools/${schoolId}/ai-precheck`,
          { headers: { 'x-internal-token': this.token }, timeout: this.organization.timeoutMs },
        ),
      );
      return data;
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 404) return null;
      throw err;
    }
  }
}
