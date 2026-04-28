import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';
import type { AppConfig } from '../../config/configuration.js';
import type {
  GetMemberRoleOutput,
  IOrganizationClient,
} from '../../shared/application/ports/organization-client.port.js';
import { OrganizationClientError } from '../../shared/application/ports/organization-client.port.js';
import { Result } from '../../shared/kernel/result.js';

@Injectable()
export class HttpOrganizationClient implements IOrganizationClient {
  private readonly logger = new Logger(HttpOrganizationClient.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeout: number;

  constructor(
    private readonly httpService: HttpService,
    config: ConfigService<AppConfig>,
  ) {
    const cfg = config.get<AppConfig['organization']>('organization')!;
    this.baseUrl = cfg.baseUrl;
    this.token = config.get<string>('internalServiceToken' as any)!;
    this.timeout = cfg.timeoutMs;
  }

  async getMemberRole(
    schoolId: string,
    userId: string,
  ): Promise<Result<GetMemberRoleOutput, OrganizationClientError>> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<GetMemberRoleOutput>(
          `${this.baseUrl}/api/v1/internal/schools/${schoolId}/members/${userId}/role`,
          {
            headers: { 'x-internal-token': this.token },
            timeout: this.timeout,
          },
        ),
      );
      return Result.ok(data);
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 404) {
        return Result.fail(
          new OrganizationClientError(404, 'User is not a member of this school'),
        );
      }
      return this.mapError(err, `getMemberRole(${schoolId}, ${userId})`);
    }
  }

  private mapError(err: unknown, context: string): Result<never, OrganizationClientError> {
    if (isAxiosError(err)) {
      const status = err.response?.status ?? 500;
      const message = (err.response?.data as any)?.message ?? err.message;
      this.logger.warn(`OrgClient [${context}] → ${status}: ${message}`);
      return Result.fail(new OrganizationClientError(status, message));
    }
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`OrgClient [${context}] unexpected: ${message}`);
    return Result.fail(new OrganizationClientError(500, message));
  }
}
