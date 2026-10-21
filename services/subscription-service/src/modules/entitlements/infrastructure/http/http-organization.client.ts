import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../../config/configuration.js';
import type { IOrganizationClient } from '../../application/ports/organization.client.js';

const TIMEOUT_MS = 3000;

@Injectable()
export class HttpOrganizationClient implements IOrganizationClient {
  private readonly logger = new Logger(HttpOrganizationClient.name);
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(config: ConfigService<AppConfig>) {
    this.baseUrl = config.get<AppConfig['organization']>('organization')!.baseUrl;
    this.token = config.get<string>('internalServiceToken')!;
  }

  async memberRole(schoolId: string, userId: string): Promise<string | null> {
    const url = `${this.baseUrl}/api/v1/internal/schools/${schoolId}/members/${userId}/role`;
    let res: Response;
    try {
      // organization-service gates /internal/* with x-internal-token; without it the answer
      // is a 401 that would read here as "not a member".
      res = await fetch(url, { headers: { 'x-internal-token': this.token }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      this.logger.warn(`memberRole(${schoolId}, ${userId}) failed: ${String(err)}`);
      throw new ServiceUnavailableException('organization-service unavailable');
    }
    if (res.status === 404) return null;
    if (!res.ok) {
      this.logger.warn(`memberRole(${schoolId}, ${userId}) → ${res.status}`);
      throw new ServiceUnavailableException('organization-service could not confirm membership');
    }
    return ((await res.json()) as { role: string }).role;
  }
}
