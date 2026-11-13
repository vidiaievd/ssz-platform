import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout } from 'rxjs';
import type { AppConfig } from '../../../../config/configuration.js';

/** Where to write to a user and in which language. */
export interface UserContact {
  userId: string;
  email: string;
  displayName: string | null;
  uiLocale: string | null;
}

const TIMEOUT_MS = 5_000;

/**
 * The owner's address, from user-profile-service (the only place that keeps one besides auth).
 *
 * `null` means "there is nobody to write to" (404: the user is gone). Any other failure throws,
 * so the consumer requeues the event once instead of silently dropping the letter.
 */
@Injectable()
export class OwnerContactClient {
  private readonly logger = new Logger(OwnerContactClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  async contactOf(userId: string): Promise<UserContact | null> {
    const settings = this.config.get<AppConfig['profile']>('profile');
    if (!settings?.serviceUrl) {
      this.logger.warn('PROFILE_SERVICE_URL not configured — school lifecycle letters are not sent');
      return null;
    }

    try {
      const response = await firstValueFrom(
        this.http
          .get<UserContact>(`${settings.serviceUrl}/api/v1/internal/profiles/${userId}/contact`, {
            headers: { 'x-service-token': settings.internalToken ?? '' },
          })
          .pipe(timeout(TIMEOUT_MS)),
      );
      return response.data;
    } catch (err) {
      if ((err as { response?: { status?: number } }).response?.status === 404) return null;
      throw err;
    }
  }
}
