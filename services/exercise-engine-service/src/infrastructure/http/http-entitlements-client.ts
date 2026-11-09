import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { isAxiosError } from 'axios';
import type { AppConfig } from '../../config/configuration.js';
import type {
  FeatureEntitlement,
  IEntitlementLimitsClient,
  IEntitlementsClient,
  Payer,
} from '../../shared/application/ports/entitlements-client.port.js';
import { EntitlementsClientError } from '../../shared/application/ports/entitlements-client.port.js';
import { Result } from '../../shared/kernel/result.js';

/** The part of subscription-service's answer this client reads. */
interface EntitlementsBody {
  features?: Record<string, { enabled?: unknown; limits?: unknown } | undefined>;
}

@Injectable()
export class HttpEntitlementsClient implements IEntitlementsClient, IEntitlementLimitsClient {
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
    const feature = await this.feature(payer, featureKey);
    return feature.isFail ? Result.fail(feature.error) : Result.ok(feature.value.enabled);
  }

  async feature(
    payer: Payer,
    featureKey: string,
  ): Promise<Result<FeatureEntitlement, EntitlementsClientError>> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<EntitlementsBody>(`${this.baseUrl}/api/v1/internal/entitlements`, {
          headers: { 'x-internal-token': this.token },
          params: { type: payer.type, id: payer.id },
          timeout: this.timeout,
        }),
      );
      // A key the plan does not list is off: the catalogue grows before the plans do.
      const feature = data?.features?.[featureKey];
      return Result.ok({ enabled: feature?.enabled === true, limits: numericLimits(feature?.limits) });
    } catch (err) {
      const status = isAxiosError(err) ? (err.response?.status ?? 500) : 500;
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`EntitlementsClient [${payer.type} ${payer.id} ${featureKey}] → ${status}: ${message}`);
      return Result.fail(new EntitlementsClientError(status, message));
    }
  }
}

/** The named limits that are numbers; anything else in the map is no limit. */
function numericLimits(raw: unknown): Record<string, number> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])),
  );
}
