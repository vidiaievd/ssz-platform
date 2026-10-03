import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';

/** One atom's card, as the scheduler holds it. */
export interface AtomCard {
  atomType: string;
  atomId: string;
  /** 'lexis' | 'grammar' — which daily budget it is scheduled against (plan 63 phase 6). */
  track: string;
  state: string;
  dueAt: string;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastReviewedAt: string | null;
}

/**
 * When the schedule wants each fact back, asked of the service that schedules it
 * (plan 63 phase 8).
 *
 * This service holds every answer the learner ever gave and no card at all: "due" is the
 * one candidate for practice that cannot be derived from evidence, only read. Projecting
 * the cards here would mean a second copy of a state that moves on every review — the
 * one thing a projection is worst at.
 *
 * Unreachable answers `null`, like the clients beside it: a suggestion list assembled
 * without the schedule is thinner and still true, while an empty list would say the
 * learner has nothing due.
 */
@Injectable()
export class LearningClient {
  private readonly logger = new Logger(LearningClient.name);
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(private readonly config: ConfigService<AppConfig>) {
    const learning = this.config.get<AppConfig['learning']>('learning');
    this.baseUrl = learning?.baseUrl ?? 'http://learning-service:3007';
    this.token = learning?.token ?? 'internal-dev-token';
  }

  async getAtomCards(userId: string, limit = 500): Promise<AtomCard[] | null> {
    try {
      // learning-service mounts everything under a global `/api/v1`, internal routes
      // included — a call without it 404s silently.
      const res = await fetch(
        `${this.baseUrl}/api/v1/internal/srs/atom-cards?userId=${encodeURIComponent(userId)}&limit=${limit}`,
        // learning-service's internal guard reads `x-service-token`, not the
        // `x-internal-token` content and scheduling expect. Sending the wrong one here
        // answers 401, and a 401 on this route reads as "no cards" — see plan 63 §5.
        { headers: { 'x-service-token': this.token } },
      );

      if (!res.ok) {
        this.logger.warn(`Atom cards for ${userId} failed: ${res.status}`);
        return null;
      }

      return ((await res.json()) as { cards: AtomCard[] }).cards;
    } catch (error) {
      this.logger.warn(`Atom cards for ${userId} unreachable: ${(error as Error).message}`);
      return null;
    }
  }
}
