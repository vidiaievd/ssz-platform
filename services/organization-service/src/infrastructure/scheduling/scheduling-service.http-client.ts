import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/configuration.js';

export const SCHEDULING_SERVICE_PORT = Symbol('ISchedulingServicePort');

@Injectable()
export class SchedulingServiceHttpClient {
  private readonly logger = new Logger(SchedulingServiceHttpClient.name);
  private readonly baseUrl: string | undefined;

  constructor(private readonly config: ConfigService<Env>) {
    this.baseUrl = this.config.get('SCHEDULING_SERVICE_URL', { infer: true });
  }

  /** Returns null if scheduling-service is unavailable (non-blocking). */
  async getGroupSlotCount(schoolId: string, groupId: string): Promise<number | null> {
    if (!this.baseUrl) return null;

    try {
      const res = await fetch(
        `${this.baseUrl}/api/v1/scheduling/schools/${schoolId}/groups/${groupId}/slots`,
        { signal: AbortSignal.timeout(3000) },
      );
      if (!res.ok) return null;
      const body = await res.json() as unknown[];
      return Array.isArray(body) ? body.length : null;
    } catch (err) {
      this.logger.warn(`SchedulingService unreachable: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}
