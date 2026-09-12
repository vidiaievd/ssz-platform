import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';

/** One unit of a group's teaching plan, as the lesson log leaves it. */
export interface DeliveryUnit {
  curriculumUnitId: string;
  title: string;
  order: number;
  plannedSessions: number;
  /** Which course unit this plan unit teaches, or `null` while unstitched. */
  contentUnitId: string | null;
  lessonsHeld: number;
  lastHeldAt: string | null;
}

export interface GroupDelivery {
  groupId: string;
  planId: string | null;
  lessonsHeld: number;
  lessonsPlanned: number;
  units: DeliveryUnit[];
}

/**
 * "How much of this was actually taught", asked of the service that keeps the journal
 * (plan 58 §2 G).
 *
 * Not projected here, unlike the roster and the course outline: `delivered` moves every
 * time a teacher marks or un-marks a lesson held, scheduling already derives it for its
 * own curriculum screen, and a second derivation would eventually tell a teacher
 * something different from the journal open in the next tab.
 *
 * Unreachable answers `null`, and the caller says "we could not ask the timetable" rather
 * than drawing a zero. A group whose schedule service is down has not stopped being
 * taught, and `0` is precisely the sentence this plan exists to stop printing.
 */
@Injectable()
export class SchedulingClient {
  private readonly logger = new Logger(SchedulingClient.name);
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(private readonly config: ConfigService<AppConfig>) {
    const scheduling = this.config.get<AppConfig['scheduling']>('scheduling');
    this.baseUrl = scheduling?.baseUrl ?? 'http://scheduling-service:3009';
    this.token = scheduling?.token ?? 'internal-dev-token';
  }

  async getGroupDelivery(groupId: string): Promise<GroupDelivery | null> {
    try {
      // scheduling-service mounts everything under a global `/api/v1`, internal routes
      // included — a call without it 404s silently.
      const res = await fetch(`${this.baseUrl}/api/v1/internal/groups/${groupId}/delivery`, {
        headers: { 'x-internal-token': this.token },
      });

      if (!res.ok) {
        this.logger.warn(`Delivery for group ${groupId} failed: ${res.status}`);
        return null;
      }

      return (await res.json()) as GroupDelivery;
    } catch (error) {
      this.logger.warn(`Delivery for group ${groupId} unreachable: ${(error as Error).message}`);
      return null;
    }
  }
}
