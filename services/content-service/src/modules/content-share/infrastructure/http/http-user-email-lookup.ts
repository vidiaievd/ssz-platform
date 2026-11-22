import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../../config/configuration.js';
import type { IUserEmailLookup } from '../../application/ports/user-email-lookup.port.js';

/** user-profile's `GET /api/v1/internal/users/lookup?email=` behind `x-service-token`. */
@Injectable()
export class HttpUserEmailLookup implements IUserEmailLookup {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly token: string;

  constructor(config: ConfigService<AppConfig>) {
    const profile = config.get<AppConfig['profile']>('profile')!;
    this.baseUrl = profile.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = profile.timeoutMs;
    this.token = config.get<string>('internalServiceToken')!;
  }

  async findUserIdByEmail(email: string): Promise<string | null> {
    const url = `${this.baseUrl}/api/v1/internal/users/lookup?email=${encodeURIComponent(email)}`;
    const response = await fetch(url, {
      headers: { 'x-service-token': this.token },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`user-profile refused users/lookup: HTTP ${response.status}`);
    const body = (await response.json()) as { userId?: unknown };
    if (typeof body.userId !== 'string') throw new Error('user-profile answered users/lookup with a malformed body');
    return body.userId;
  }
}
