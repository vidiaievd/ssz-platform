import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';

export interface TeachingProfile {
  userId: string;
  languages: Array<{ code: string; level?: string | null }>;
}

@Injectable()
export class ProfileServiceHttpClient {
  private readonly logger = new Logger(ProfileServiceHttpClient.name);
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(private readonly config: ConfigService<AppConfig>) {
    this.baseUrl = config.get<AppConfig['profile']>('profile')?.baseUrl ?? 'http://user-profile-service:3001';
    this.token = config.get<AppConfig['organization']>('organization')?.token ?? '';
  }

  async getTeachingLanguages(userId: string): Promise<string[]> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/v1/profiles/${userId}/teaching`,
        { headers: { Authorization: `Bearer ${this.token}` } },
      );
      if (!res.ok) return [];
      const body = await res.json() as { languages?: Array<{ code: string }> };
      return (body.languages ?? []).map((l) => l.code);
    } catch (err) {
      this.logger.warn(`getTeachingLanguages failed for ${userId}: ${String(err)}`);
      return [];
    }
  }
}
