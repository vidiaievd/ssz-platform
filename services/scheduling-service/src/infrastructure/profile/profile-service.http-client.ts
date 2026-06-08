import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';

export interface TutorProfile {
  userId: string;
  teachingLanguages: string[]; // ISO 639-1 codes
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

  async getTutorTeachingLanguages(userId: string): Promise<string[]> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/v1/profiles/${userId}/tutor`,
        { headers: { Authorization: `Bearer ${this.token}` } },
      );
      if (!res.ok) return [];
      const body = await res.json() as { teachingLanguages?: string[] };
      return body.teachingLanguages ?? [];
    } catch (err) {
      this.logger.warn(`getTutorTeachingLanguages failed for ${userId}: ${String(err)}`);
      return [];
    }
  }
}
