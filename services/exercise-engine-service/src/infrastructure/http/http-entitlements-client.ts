import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';
import type { AppConfig } from '../../config/configuration.js';
import type {
  IEntitlementsClient,
  Payer,
} from '../../shared/application/ports/entitlements-client.port.js';
import { EntitlementsClientError } from '../../shared/application/ports/entitlements-client.port.js';
import { Result } from '../../shared/kernel/result.js';

/** The part of subscription-service's answer this client reads. */
interface EntitlementsBody {
  features?: Record<string, { enabled?: unknown } | undefined>;
}

@Injectable()
export class HttpEntitlementsClient implements IEntitlementsClient {
  private readonly logger = new Logger(HttpEntitlementsClient.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeout: number;

  constructor(
    private readonly httpService: HttpService,
    config: ConfigService<AppConfig>,
  ) {
    const cfg = config.get<AppConfig['subscription']>('subscription')!;
    this.baseUrl = cfg.baseUrl;
    this.token = config.get<string>('internalServiceToken' as any)!;
    this.timeout = cfg.timeoutMs;
  }

  async isEnabled(
    payer: Payer,
    featureKey: string,
  ): Promise<Result<boolean, EntitlementsClientError>> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<EntitlementsBody>(`${this.baseUrl}/api/v1/internal/entitlements`, {
          headers: { 'x-internal-token': this.token },
          params: { type: payer.type, id: payer.id },
          timeout: this.timeout,
        }),
      );
      // A key the plan does not list is off: the catalogue grows before the plans do.
      return Result.ok(data?.features?.[featureKey]?.enabled === true);
    } catch (err) {
      const status = isAxiosError(err) ? (err.response?.status ?? 500) : 500;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`EntitlementsClient [${payer.type} ${payer.id} ${featureKey}] → ${status}: ${message}`);
      return Result.fail(new EntitlementsClientError(status, message));
    }
  }
}
