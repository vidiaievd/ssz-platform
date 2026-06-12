import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/configuration.js';
import type { IProfileServicePort, ProfileSummary, TeachingLanguages } from '../../shared/application/ports/profile-service.interface.js';

@Injectable()
export class ProfileServiceHttpClient implements IProfileServicePort {
  private readonly logger = new Logger(ProfileServiceHttpClient.name);
  private readonly baseUrl: string | undefined;

  constructor(private readonly config: ConfigService<Env>) {
    this.baseUrl = this.config.get('PROFILE_SERVICE_URL', { infer: true });
  }

  async getTeachingLanguages(userId: string): Promise<TeachingLanguages | null> {
    if (!this.baseUrl) {
      this.logger.warn('PROFILE_SERVICE_URL not configured — skipping language validation');
      return null;
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/v1/profiles/${userId}/teaching`, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000),
      });

      if (res.status === 404) return null;
      if (!res.ok) {
        this.logger.warn(`ProfileService returned ${res.status} for userId=${userId}`);
        return null;
      }

      const body = await res.json() as { languages?: Array<{ code: string }> };
      const langs = (body.languages ?? []).map((l) => l.code);
      return { userId, langs };
    } catch (err) {
      this.logger.warn(`ProfileService unreachable: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async getProfileSummary(userId: string): Promise<ProfileSummary | null> {
    if (!this.baseUrl) return null;

    try {
      const res = await fetch(`${this.baseUrl}/api/v1/profiles/${userId}`, {
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000),
      });

      if (res.status === 404) return null;
      if (!res.ok) {
        this.logger.warn(`ProfileService returned ${res.status} for profileSummary userId=${userId}`);
        return null;
      }

      const body = await res.json() as { displayName?: string; avatarUrl?: string };
      return {
        userId,
        name: body.displayName ?? userId,
        avatarUrl: body.avatarUrl ?? null,
      };
    } catch (err) {
      this.logger.warn(`ProfileService unreachable (summary): ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}
