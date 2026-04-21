// Requires: npm install --workspace=services/content-service @nestjs/axios axios
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout } from 'rxjs';
import type { AppConfig } from '../../../../config/configuration.js';
import type {
  IOrganizationClient,
  SchoolMemberRole,
} from '../../domain/ports/organization-client.port.js';
import { OrganizationServiceUnavailableException } from './organization-service-unavailable.exception.js';

@Injectable()
export class HttpOrganizationClient implements IOrganizationClient {
  private readonly logger = new Logger(HttpOrganizationClient.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly authToken: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<AppConfig>,
  ) {
    const orgConfig = this.config.get<AppConfig['organization']>('organization')!;
    this.baseUrl = orgConfig.baseUrl;
    this.timeoutMs = orgConfig.timeoutMs;
    this.retries = orgConfig.retries;
    this.authToken = orgConfig.internalAuthToken;
  }

  async getMemberRole(userId: string, schoolId: string): Promise<SchoolMemberRole | null> {
    const url = `${this.baseUrl}/api/v1/internal/schools/${schoolId}/members/${userId}/role`;

    let lastError: unknown;
    const delays = [250, 500, 1000];

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      this.logger.debug(
        `getMemberRole attempt ${attempt + 1}/${this.retries + 1} — userId=${userId} schoolId=${schoolId}`,
      );

      try {
        const response = await firstValueFrom(
          this.http
            .get<{ role: SchoolMemberRole }>(url, {
              headers: { Authorization: `Bearer ${this.authToken}` },
            })
            .pipe(timeout(this.timeoutMs)),
        );

        return response.data.role;
      } catch (err: unknown) {
        const status = this.extractStatus(err);

        if (status === 404) {
          this.logger.debug(
            `getMemberRole 404 — user ${userId} is not a member of school ${schoolId}`,
          );
          return null;
        }

        if (status === 401 || status === 403) {
          this.logger.error('getMemberRole auth failure — INTERNAL_SERVICE_TOKEN misconfigured');
          throw new Error('Internal auth misconfigured');
        }

        // Network error or 5xx — retry.
        lastError = err;

        if (attempt < this.retries) {
          const delay = delays[attempt] ?? 1000;
          this.logger.warn(
            `getMemberRole attempt ${attempt + 1} failed (${this.describeError(err)}) — retrying in ${delay}ms`,
          );
          await this.sleep(delay);
        }
      }
    }

    this.logger.error(
      `getMemberRole exhausted ${this.retries + 1} attempts — ${this.describeError(lastError)}`,
    );
    throw new OrganizationServiceUnavailableException(lastError);
  }

  private extractStatus(err: unknown): number | null {
    if (
      err !== null &&
      typeof err === 'object' &&
      'response' in err &&
      err.response !== null &&
      typeof err.response === 'object' &&
      'status' in err.response
    ) {
      return err.response.status as number;
    }
    return null;
  }

  private describeError(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
