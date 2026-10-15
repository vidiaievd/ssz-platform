import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { readProbeRecords, TEMPLATE_CODE as MINIMAL_PAIRS } from '@ssz/shared-kernel/minimal-pairs';
import type { ProbeRecord } from '@ssz/shared-kernel/minimal-pairs';
import { GetProbeHistoryQuery } from './get-probe-history.query.js';
import { ATTEMPT_REPOSITORY, type IAttemptRepository } from '../../../domain/repositories/attempt.repository.js';
import {
  CONTENT_CLIENT,
  type IContentClient,
  ContentClientError,
} from '../../../../../shared/application/ports/content-client.port.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { HISTORY_SITTINGS } from '../../services/minimal-pairs-sitting.js';

export type GetProbeHistoryError = { code: 'NOT_A_PROBE_SET' } | ContentClientError;

export interface ProbeHistory {
  /** The exercise's language: the history spans every `minimal_pairs` exercise in it. */
  targetLanguage: string;
  /** Newest first, at most as many as the engine itself reads when it deals `weakest`. */
  sittings: Array<{ probes: ProbeRecord[] }>;
}

/**
 * What the engine reads when it deals a `weakest` sitting, handed to the learner it belongs to
 * so the phone can deal one with no network (VoxOrd offline plan, B6) and come out where the
 * server would have. The phone folds it through the same `historyFor`, together with the
 * sittings it has played since.
 *
 * Only the learner's own scored sittings, each probe of which was closed and shown to them with
 * its answer; nothing here is a key they have not been given.
 */
@QueryHandler(GetProbeHistoryQuery)
export class GetProbeHistoryHandler implements IQueryHandler<GetProbeHistoryQuery> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
  ) {}

  async execute(query: GetProbeHistoryQuery): Promise<Result<ProbeHistory, GetProbeHistoryError>> {
    const def = await this.contentClient.getExerciseForAttempt(query.exerciseId, query.language, 'PRACTICE');
    if (def.isFail) return Result.fail(def.error);
    const { templateCode, targetLanguage } = def.value.exercise;
    if (templateCode !== MINIMAL_PAIRS) return Result.fail({ code: 'NOT_A_PROBE_SET' });

    const details = await this.attempts.findScoredDetails(
      query.userId,
      MINIMAL_PAIRS,
      targetLanguage,
      HISTORY_SITTINGS,
    );
    const sittings = details.flatMap((d) => {
      const probes =
        typeof d === 'object' && d !== null ? readProbeRecords((d as { probes?: unknown }).probes) : [];
      return probes.length > 0 ? [{ probes }] : [];
    });
    return Result.ok({ targetLanguage, sittings });
  }
}
