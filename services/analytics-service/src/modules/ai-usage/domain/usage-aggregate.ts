import { histogramPercentile, mergeHistograms } from './latency-histogram.js';

/** Dimensions a reader may group the rollup by. `model` carries its provider with it. */
export const AI_USAGE_DIMENSIONS = ['day', 'capability', 'provider', 'model', 'payer', 'outcome'] as const;
export type AiUsageDimension = (typeof AI_USAGE_DIMENSIONS)[number];

/** One `ai_usage_daily` row, as the aggregation needs it. Credits as a fixed six-place string. */
export interface AiUsageRow {
  day: Date;
  capability: string;
  providerCode: string | null;
  providerModelId: string | null;
  payerType: string;
  payerId: string;
  outcome: string;
  calls: number;
  fallbackCalls: number;
  unpricedCalls: number;
  inputTokens: bigint;
  outputTokens: bigint;
  cacheReadTokens: bigint;
  cacheWriteTokens: bigint;
  credits: string;
  latencySumMs: bigint;
  latencyMinMs: number;
  latencyMaxMs: number;
  latencyBuckets: number[];
}

export interface AiUsageGroup {
  /** Only the dimensions that were grouped by are present. */
  key: {
    day?: string;
    capability?: string;
    providerCode?: string | null;
    providerModelId?: string | null;
    payerType?: string;
    payerId?: string;
    outcome?: string;
  };
  calls: number;
  fallbackCalls: number;
  unpricedCalls: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  /** Decimal string, six places. Unpriced calls add nothing — see `unpricedCalls`. */
  credits: string;
  latencyMs: {
    avg: number | null;
    min: number | null;
    p50: number | null;
    p95: number | null;
    max: number | null;
  };
}

interface Accumulator {
  key: AiUsageGroup['key'];
  calls: number;
  fallbackCalls: number;
  unpricedCalls: number;
  input: bigint;
  output: bigint;
  cacheRead: bigint;
  cacheWrite: bigint;
  microCredits: bigint;
  latencySumMs: bigint;
  latencyMinMs: number;
  latencyMaxMs: number;
  buckets: number[];
}

const CREDIT_SCALE = 1_000_000n;

/** `"12.345678"` → 12345678n. The column is NUMERIC(18,6), so there is never a seventh place. */
export function parseMicroCredits(value: string): bigint {
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = (negative ? value.slice(1) : value).split('.');
  const micro = BigInt(whole || '0') * CREDIT_SCALE + BigInt(fraction.padEnd(6, '0').slice(0, 6));
  return negative ? -micro : micro;
}

export function formatMicroCredits(micro: bigint): string {
  const negative = micro < 0n;
  const abs = negative ? -micro : micro;
  const whole = abs / CREDIT_SCALE;
  const fraction = (abs % CREDIT_SCALE).toString().padStart(6, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

function keyOf(row: AiUsageRow, dims: ReadonlySet<AiUsageDimension>): AiUsageGroup['key'] {
  const key: AiUsageGroup['key'] = {};
  if (dims.has('day')) key.day = row.day.toISOString().slice(0, 10);
  if (dims.has('capability')) key.capability = row.capability;
  if (dims.has('provider') || dims.has('model')) key.providerCode = row.providerCode;
  if (dims.has('model')) key.providerModelId = row.providerModelId;
  if (dims.has('payer')) {
    key.payerType = row.payerType;
    key.payerId = row.payerId;
  }
  if (dims.has('outcome')) key.outcome = row.outcome;
  return key;
}

/**
 * Folds daily rows into the groups a reader asked for. No dimensions → a single total.
 * Groups come back in the order their first row arrived; the caller sorts the rows.
 */
export function aggregateAiUsage(
  rows: readonly AiUsageRow[],
  groupBy: readonly AiUsageDimension[],
): AiUsageGroup[] {
  const dims = new Set(groupBy);
  const groups = new Map<string, Accumulator>();

  for (const row of rows) {
    const key = keyOf(row, dims);
    const id = JSON.stringify(key);
    let acc = groups.get(id);
    if (!acc) {
      acc = {
        key,
        calls: 0,
        fallbackCalls: 0,
        unpricedCalls: 0,
        input: 0n,
        output: 0n,
        cacheRead: 0n,
        cacheWrite: 0n,
        microCredits: 0n,
        latencySumMs: 0n,
        latencyMinMs: Number.POSITIVE_INFINITY,
        latencyMaxMs: 0,
        buckets: [],
      };
      groups.set(id, acc);
    }
    acc.calls += row.calls;
    acc.fallbackCalls += row.fallbackCalls;
    acc.unpricedCalls += row.unpricedCalls;
    acc.input += row.inputTokens;
    acc.output += row.outputTokens;
    acc.cacheRead += row.cacheReadTokens;
    acc.cacheWrite += row.cacheWriteTokens;
    acc.microCredits += parseMicroCredits(row.credits);
    acc.latencySumMs += row.latencySumMs;
    acc.latencyMinMs = Math.min(acc.latencyMinMs, row.latencyMinMs);
    acc.latencyMaxMs = Math.max(acc.latencyMaxMs, row.latencyMaxMs);
    acc.buckets = mergeHistograms(acc.buckets, row.latencyBuckets);
  }

  return [...groups.values()].map((acc) => ({
    key: acc.key,
    calls: acc.calls,
    fallbackCalls: acc.fallbackCalls,
    unpricedCalls: acc.unpricedCalls,
    tokens: {
      input: Number(acc.input),
      output: Number(acc.output),
      cacheRead: Number(acc.cacheRead),
      cacheWrite: Number(acc.cacheWrite),
    },
    credits: formatMicroCredits(acc.microCredits),
    latencyMs:
      acc.calls === 0
        ? { avg: null, min: null, p50: null, p95: null, max: null }
        : {
            avg: Math.round(Number(acc.latencySumMs) / acc.calls),
            min: acc.latencyMinMs,
            p50: histogramPercentile(acc.buckets, 0.5, acc.latencyMinMs, acc.latencyMaxMs),
            p95: histogramPercentile(acc.buckets, 0.95, acc.latencyMinMs, acc.latencyMaxMs),
            max: acc.latencyMaxMs,
          },
  }));
}
