import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/configuration.js';
import type { IUserEmailLookup, UserEmailAccount } from '../../modules/schools/application/ports/user-email-lookup.port.js';

/**
 * user-profile's `GET /api/v1/internal/users/lookup?email=` (`x-service-token`). Unlike the other
 * profile reads this one never turns a failure into "nobody": the dialog would then send a
 * registration letter to someone who already has an account.
 */
@Injectable()
export class ProfileUserLookupHttpClient implements IUserEmailLookup {
  private readonly baseUrl: string | undefined;
  private readonly token: string | undefined;

  constructor(config: ConfigService<Env>) {
    this.baseUrl = config.get('PROFILE_SERVICE_URL', { infer: true })?.replace(/\/+$/, '');
    this.token = config.get('INTERNAL_SERVICE_TOKEN', { infer: true });
  }

  async findByEmail(email: string): Promise<UserEmailAccount | null> {
    if (!this.baseUrl) throw new Error('PROFILE_SERVICE_URL is not configured');
    const res = await fetch(`${this.baseUrl}/api/v1/internal/users/lookup?email=${encodeURIComponent(email)}`, {
      headers: this.token ? { 'x-service-token': this.token } : {},
      signal: AbortSignal.timeout(3000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`user-profile refused users/lookup: HTTP ${res.status}`);
    const body = (await res.json()) as { userId?: unknown; roles?: unknown; displayName?: unknown };
    if (typeof body.userId !== 'string') throw new Error('user-profile answered users/lookup with a malformed body');
    return {
      userId: body.userId,
      roles: Array.isArray(body.roles) ? body.roles.filter((r): r is string => typeof r === 'string') : [],
      displayName: typeof body.displayName === 'string' ? body.displayName : null,
    };
  }
}
