import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/configuration.js';
import type { IWorkspaceEntitlementsPort } from '../../shared/application/ports/workspace-entitlements.interface.js';

const TIMEOUT_MS = 3000;

/** The part of subscription-service's answer this client reads. */
interface EntitlementsBody {
  features?: Record<string, { enabled?: unknown } | undefined>;
}

@Injectable()
export class SubscriptionServiceHttpClient implements IWorkspaceEntitlementsPort {
  private readonly logger = new Logger(SubscriptionServiceHttpClient.name);
  private readonly baseUrl: string | undefined;
  private readonly token: string;

  constructor(config: ConfigService<Env>) {
    this.baseUrl = config.get('SUBSCRIPTION_SERVICE_URL', { infer: true });
    this.token = config.get('INTERNAL_SERVICE_TOKEN', { infer: true })!;
  }

  async isEnabled(workspaceId: string, featureKey: string): Promise<boolean> {
    if (!this.baseUrl) {
      this.logger.warn('SUBSCRIPTION_SERVICE_URL not configured — cannot confirm a plan feature');
      throw new ServiceUnavailableException('subscription-service is not configured');
    }
    const url = `${this.baseUrl}/api/v1/internal/entitlements?type=workspace&id=${encodeURIComponent(workspaceId)}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'x-internal-token': this.token },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.warn(`isEnabled(${workspaceId}, ${featureKey}) failed: ${String(err)}`);
      throw new ServiceUnavailableException('subscription-service unavailable');
    }
    if (!res.ok) {
      this.logger.warn(`isEnabled(${workspaceId}, ${featureKey}) → ${res.status}`);
      throw new ServiceUnavailableException('subscription-service could not confirm the plan');
    }
    const body = (await res.json()) as EntitlementsBody;
    // A key the plan does not list is off: the catalogue grows before the plans do.
    return body.features?.[featureKey]?.enabled === true;
  }
}
