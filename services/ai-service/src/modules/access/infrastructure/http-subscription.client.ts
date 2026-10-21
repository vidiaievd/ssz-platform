import type { ISubscriptionClient } from '../application/ports/subscription.client.js';
import type { BilledPayer } from '../application/ports/entitlement-projection.js';
import type { PayerEntitlements } from '../domain/entitlement.js';
import { fromWire } from './entitlements-wire.mapper.js';

/** `GET /api/v1/internal/entitlements` of subscription-service, behind `x-internal-token`. */
export class HttpSubscriptionClient implements ISubscriptionClient {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string,
    private readonly timeoutMs = 3_000,
  ) {}

  async fetchEntitlements(payer: BilledPayer): Promise<PayerEntitlements> {
    const url = new URL('/api/v1/internal/entitlements', this.baseUrl);
    url.searchParams.set('type', payer.type);
    url.searchParams.set('id', payer.id);
    const res = await fetch(url, {
      headers: { 'x-internal-token': this.internalToken, accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      throw new Error(`subscription-service answered ${res.status} for ${payer.type} ${payer.id}`);
    }
    return fromWire(await res.json());
  }
}
