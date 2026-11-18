import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { microCredits } from '../../../ledger/domain/credits.js';
import type { ISpendReader } from '../../application/ports/spend.reader.js';
import type { SpendRow } from '../../domain/platform-spend.js';

interface RawRow {
  day: string;
  model_id: string;
  provider_id: string | null;
  capability: string;
  currency: string | null;
  calls: number;
  failed: number;
  fallback_calls: number;
  unpriced_calls: number;
  input_tokens: bigint;
  output_tokens: bigint;
  cache_read_tokens: bigint;
  cache_write_tokens: bigint;
  audio_ms: bigint;
  characters: bigint;
  cost_micros: bigint;
  credits: string;
}

@Injectable()
export class PrismaSpendReader implements ISpendReader {
  constructor(private readonly prisma: PrismaService) {}

  async rows(start: Date, end: Date): Promise<SpendRow[]> {
    // `created_at` is a UTC timestamp without a zone, so its date is the UTC day. The range is served
    // by the `created_at` index. Sums are cast to bigint (numeric otherwise); credits come as text with
    // six places, so no float ever touches money.
    const raw = await this.prisma.$queryRaw<RawRow[]>`
      SELECT to_char(created_at, 'YYYY-MM-DD')                                     AS day,
             model_id,
             provider_id,
             capability,
             currency,
             count(*)::int                                                         AS calls,
             count(*) FILTER (WHERE outcome IN ('error', 'invalid_response'))::int AS failed,
             count(*) FILTER (WHERE fallback_used)::int                            AS fallback_calls,
             count(*) FILTER (WHERE cost_micros IS NULL)::int                      AS unpriced_calls,
             coalesce(sum(input_tokens), 0)::bigint                                AS input_tokens,
             coalesce(sum(output_tokens), 0)::bigint                               AS output_tokens,
             coalesce(sum(cache_read_tokens), 0)::bigint                           AS cache_read_tokens,
             coalesce(sum(cache_write_tokens), 0)::bigint                          AS cache_write_tokens,
             coalesce(sum(audio_ms), 0)::bigint                                    AS audio_ms,
             coalesce(sum(characters), 0)::bigint                                  AS characters,
             coalesce(sum(cost_micros), 0)::bigint                                 AS cost_micros,
             round(coalesce(sum(credits), 0), 6)::text                            AS credits
        FROM ai_calls
       WHERE created_at >= ${start}
         AND created_at < ${end}
         AND model_id IS NOT NULL
       GROUP BY 1, 2, 3, 4, 5`;
    return raw.map(
      (r): SpendRow => ({
        day: r.day,
        modelId: r.model_id,
        providerId: r.provider_id,
        capability: r.capability,
        currency: r.currency,
        calls: r.calls,
        failed: r.failed,
        fallbackCalls: r.fallback_calls,
        unpricedCalls: r.unpriced_calls,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        cacheReadTokens: r.cache_read_tokens,
        cacheWriteTokens: r.cache_write_tokens,
        audioMs: r.audio_ms,
        characters: r.characters,
        costMicros: r.cost_micros,
        microCredits: microCredits(r.credits),
      }),
    );
  }
}
