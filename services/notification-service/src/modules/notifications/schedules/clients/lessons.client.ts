import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout } from 'rxjs';
import type { AppConfig } from '../../../../config/configuration.js';

/** One lesson, as much of it as a reminder needs. */
export interface UpcomingLesson {
  id: string;
  groupId: string;
  schoolId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  type: string;
}

const TIMEOUT_MS = 10_000;

/**
 * What the timetable says is happening tomorrow, and who is in the group it happens to.
 *
 * Both calls answer `null` on failure rather than throwing, for the reason the review
 * clients do: this runs on a timer with nobody watching, and a service that is restarting
 * must cost one run's reminders and not the scheduler.
 */
@Injectable()
export class LessonsClient {
  private readonly logger = new Logger(LessonsClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  private get settings() {
    return this.config.get<AppConfig['lessonReminder']>('lessonReminder');
  }

  /** Configured at all? A job with no timetable address is off, not broken. */
  get configured(): boolean {
    return Boolean(this.settings?.schedulingServiceUrl && this.settings?.organizationServiceUrl);
  }

  private headers(): Record<string, string> {
    return { 'x-internal-token': this.settings?.internalToken ?? '' };
  }

  /** Every lesson of a day, across every workspace. Cancelled ones never come back. */
  async lessonsOn(day: string): Promise<UpcomingLesson[] | null> {
    const base = this.settings?.schedulingServiceUrl;
    if (!base) return null;

    try {
      const response = await firstValueFrom(
        this.http
          .get<UpcomingLesson[]>(`${base}/api/v1/internal/sessions/upcoming`, {
            params: { from: day, to: day },
            headers: this.headers(),
          })
          .pipe(timeout(TIMEOUT_MS)),
      );
      return response.data;
    } catch (err) {
      this.logger.warn(`lessonsOn(${day}) failed: ${String(err)}`);
      return null;
    }
  }

  /** Who is in a group right now — the people a lesson of it is for. */
  async membersOf(schoolId: string, groupId: string): Promise<string[] | null> {
    const base = this.settings?.organizationServiceUrl;
    if (!base) return null;

    try {
      const response = await firstValueFrom(
        this.http
          .get<{ userIds: string[] }>(
            `${base}/api/v1/internal/schools/${schoolId}/groups/${groupId}/members`,
            { headers: this.headers() },
          )
          .pipe(timeout(TIMEOUT_MS)),
      );
      return response.data.userIds ?? [];
    } catch (err) {
      this.logger.warn(`membersOf(${groupId}) failed: ${String(err)}`);
      return null;
    }
  }
}
