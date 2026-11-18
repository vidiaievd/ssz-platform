import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/configuration.js';
import type { IWorkspaceEntitlementsPort } from '../../shared/application/ports/workspace-entitlements.interface.js';
import type { ISeatLimitSource, SeatLimitSnapshot } from '../../shared/application/ports/seat-limit.interface.js';
import { studentSeatLimitOf, type SnapshotFeature } from '../../modules/schools/domain/value-objects/seat-limit.vo.js';

const TIMEOUT_MS = 3000;

/** The part of subscription-service's answer this client reads. */
interface EntitlementsBody {
  features?: Record<string, SnapshotFeature | undefined>;
  version?: unknown;
  validUntil?: unknown;
}

@Injectable()
export class SubscriptionServiceHttpClient implements IWorkspaceEntitlementsPort, ISeatLimitSource {
  private readonly logger = new Logger(SubscriptionServiceHttpClient.name);
  private readonly baseUrl: string | undefined;
  private readonly token: string;

  constructor(config: ConfigService<Env>) {
    this.baseUrl = config.get('SUBSCRIPTION_SERVICE_URL', { infer: true });
    this.token = config.get('INTERNAL_SERVICE_TOKEN', { infer: true })!;
  }

  async isEnabled(workspaceId: string, featureKey: string): Promise<boolean> {
    const body = await this.entitlements(workspaceId, `isEnabled(${workspaceId}, ${featureKey})`);
    // A key the plan does not list is off: the catalogue grows before the plans do.
    return body.features?.[featureKey]?.enabled === true;
  }

  async fetchStudentSeatLimit(schoolId: string): Promise<SeatLimitSnapshot> {
    const body = await this.entitlements(schoolId, `fetchStudentSeatLimit(${schoolId})`);
    const validUntil = typeof body.validUntil === 'string' ? new Date(body.validUntil) : null;
    if (typeof body.version !== 'number' || !validUntil || Number.isNaN(validUntil.getTime())) {
      this.logger.warn(`fetchStudentSeatLimit(${schoolId}) → answer without version/validUntil`);
      throw new ServiceUnavailableException('subscription-service answered without a snapshot version');
    }
    return { max: studentSeatLimitOf(body.features), version: body.version, validUntil };
  }

  private async entitlements(workspaceId: string, what: string): Promise<EntitlementsBody> {
    if (!this.baseUrl) {
      this.logger.warn('SUBSCRIPTION_SERVICE_URL not configured — cannot read the plan');
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
      this.logger.warn(`${what} failed: ${String(err)}`);
      throw new ServiceUnavailableException('subscription-service unavailable');
    }
    if (!res.ok) {
      this.logger.warn(`${what} → ${res.status}`);
      throw new ServiceUnavailableException('subscription-service could not confirm the plan');
    }
    return (await res.json()) as EntitlementsBody;
  }
}
