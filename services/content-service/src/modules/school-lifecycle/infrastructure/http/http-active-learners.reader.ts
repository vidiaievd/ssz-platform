import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../../config/configuration.js';
import { materialKey } from '../../domain/school-materials.js';
import type {
  ActiveLearnersQuestion,
  IActiveLearnersReader,
} from '../../application/ports/active-learners.reader.port.js';

/** learning-service's caps per request (`internal/content/active-learners`). */
export const MAX_ITEMS = 200;
export const MAX_IDS = 2000;

interface WireItem {
  contentType: string;
  contentId: string;
  leafIds: string[];
}

/**
 * Packs questions into requests learning accepts. A container with more leaves than one request
 * carries is asked in parts: only "at least one active learner" matters, so the largest answer of
 * the parts stands for the container.
 */
export function packQuestions(questions: readonly ActiveLearnersQuestion[]): WireItem[][] {
  const units: WireItem[] = [];
  for (const q of questions) {
    const room = MAX_IDS - 1;
    if (q.leafIds.length === 0) units.push({ contentType: q.kind, contentId: q.id, leafIds: [] });
    for (let i = 0; i < q.leafIds.length; i += room) {
      units.push({ contentType: q.kind, contentId: q.id, leafIds: q.leafIds.slice(i, i + room) });
    }
  }

  const requests: WireItem[][] = [];
  let current: WireItem[] = [];
  let ids = 0;
  for (const unit of units) {
    const size = 1 + unit.leafIds.length;
    if (current.length > 0 && (current.length >= MAX_ITEMS || ids + size > MAX_IDS)) {
      requests.push(current);
      current = [];
      ids = 0;
    }
    current.push(unit);
    ids += size;
  }
  if (current.length > 0) requests.push(current);
  return requests;
}

/** learning-service's `POST /api/v1/internal/content/active-learners` behind `x-service-token`. */
@Injectable()
export class HttpActiveLearnersReader implements IActiveLearnersReader {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly token: string;

  constructor(config: ConfigService<AppConfig>) {
    const learning = config.get<AppConfig['learning']>('learning')!;
    this.baseUrl = learning.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = learning.timeoutMs;
    this.token = config.get<string>('internalServiceToken')!;
  }

  async countActive(
    questions: readonly ActiveLearnersQuestion[],
    activeSince: Date,
  ): Promise<Map<string, number>> {
    const active = new Map<string, number>();
    for (const items of packQuestions(questions)) {
      const response = await fetch(`${this.baseUrl}/api/v1/internal/content/active-learners`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-service-token': this.token },
        body: JSON.stringify({ activeSince: activeSince.toISOString(), items }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok)
        throw new Error(`learning-service refused active-learners: HTTP ${response.status}`);
      const body = (await response.json()) as {
        items?: Array<{ contentType: string; contentId: string; activeLearners: number }>;
      };
      if (!Array.isArray(body.items) || body.items.length !== items.length) {
        throw new Error('learning-service answered active-learners with a malformed body');
      }
      for (const answer of body.items) {
        if (answer.activeLearners <= 0) continue;
        const key = materialKey({ kind: answer.contentType as never, id: answer.contentId });
        active.set(key, Math.max(active.get(key) ?? 0, answer.activeLearners));
      }
    }
    return active;
  }
}
