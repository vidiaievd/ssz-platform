import { formatMicroCredits, parseMicroCredits } from './usage-aggregate.js';

/**
 * AI spend per payer for the platform admin panel (plan 90, phase 7, step 12): one cut of
 * `ai_usage_daily` at a time — by capability, by payer (top N by credits) or by ISO week (every
 * week of the range, empty ones as zeros).
 */
export const ADMIN_USAGE_GROUPINGS = ['capability', 'payer', 'week'] as const;
export type AdminUsageGrouping = (typeof ADMIN_USAGE_GROUPINGS)[number];

/** `platform` — calls nobody is billed for (admin evals, model tests). */
export const ADMIN_USAGE_PAYER_TYPES = ['workspace', 'user', 'platform'] as const;
export type AdminUsagePayerType = (typeof ADMIN_USAGE_PAYER_TYPES)[number];

export const ADMIN_USAGE_PAYER_LIMIT = { min: 1, max: 100, default: 20 } as const;

/** Sums over some `ai_usage_daily` rows, as a SQL GROUP BY gives them. Credits as a six-place string. */
export interface AdminUsageSums {
  calls: number;
  unpricedCalls: number;
  inputTokens: bigint;
  outputTokens: bigint;
  cacheReadTokens: bigint;
  cacheWriteTokens: bigint;
  credits: string;
}

export interface CapabilitySums extends AdminUsageSums {
  capability: string;
}

export interface PayerSums extends AdminUsageSums {
  payerType: string;
  payerId: string;
}

export interface DaySums extends AdminUsageSums {
  day: Date;
}

export interface AdminUsageFigures {
  calls: number;
  /** Calls the model had no price for — they add nothing to `credits`. */
  unpricedCalls: number;
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  /** Decimal string, six places. */
  credits: string;
}

export interface CapabilityItem extends AdminUsageFigures {
  capability: string;
}

export interface PayerItem extends AdminUsageFigures {
  payerType: string;
  payerId: string;
}

export interface WeekItem extends AdminUsageFigures {
  /** ISO week, `2026-W46`. */
  week: string;
  /** The week's days inside the range — the first and last weeks may be cut by it. */
  from: string;
  to: string;
}

interface Acc {
  calls: number;
  unpricedCalls: number;
  input: bigint;
  output: bigint;
  cacheRead: bigint;
  cacheWrite: bigint;
  micro: bigint;
}

const emptyAcc = (): Acc => ({
  calls: 0,
  unpricedCalls: 0,
  input: 0n,
  output: 0n,
  cacheRead: 0n,
  cacheWrite: 0n,
  micro: 0n,
});

function add(acc: Acc, sums: AdminUsageSums): void {
  acc.calls += sums.calls;
  acc.unpricedCalls += sums.unpricedCalls;
  acc.input += sums.inputTokens;
  acc.output += sums.outputTokens;
  acc.cacheRead += sums.cacheReadTokens;
  acc.cacheWrite += sums.cacheWriteTokens;
  acc.micro += parseMicroCredits(sums.credits);
}

function figures(acc: Acc): AdminUsageFigures {
  return {
    calls: acc.calls,
    unpricedCalls: acc.unpricedCalls,
    tokens: {
      input: Number(acc.input),
      output: Number(acc.output),
      cacheRead: Number(acc.cacheRead),
      cacheWrite: Number(acc.cacheWrite),
    },
    credits: formatMicroCredits(acc.micro),
  };
}

function totalOf(rows: readonly AdminUsageSums[]): Acc {
  const acc = emptyAcc();
  for (const row of rows) add(acc, row);
  return acc;
}

/** Credits first, then calls; exact on micro-credits, never on rounded strings. */
function byCost(a: Acc, b: Acc): number {
  if (a.micro !== b.micro) return a.micro > b.micro ? -1 : 1;
  return b.calls - a.calls;
}

export interface CapabilityCut {
  total: AdminUsageFigures;
  items: CapabilityItem[];
}

/** One row per capability, most credits first; ties by calls, then by name. */
export function cutByCapability(rows: readonly CapabilitySums[]): CapabilityCut {
  const groups = new Map<string, Acc>();
  for (const row of rows) {
    let acc = groups.get(row.capability);
    if (!acc) groups.set(row.capability, (acc = emptyAcc()));
    add(acc, row);
  }
  const items = [...groups.entries()]
    .sort(([na, a], [nb, b]) => byCost(a, b) || na.localeCompare(nb))
    .map(([capability, acc]) => ({ capability, ...figures(acc) }));
  return { total: figures(totalOf(rows)), items };
}

export interface PayerCut {
  total: AdminUsageFigures;
  /** Payers that spent anything in the range (after the `payerType` filter). */
  payers: number;
  items: PayerItem[];
  /** Everyone below the top N, folded; null when the top holds them all. */
  others: (AdminUsageFigures & { payers: number }) | null;
}

/** Top `limit` payers by credits; ties by calls, then type and id, so pages are stable. */
export function cutByPayer(rows: readonly PayerSums[], limit: number): PayerCut {
  const groups = new Map<string, { payerType: string; payerId: string; acc: Acc }>();
  for (const row of rows) {
    const id = `${row.payerType}:${row.payerId}`;
    let group = groups.get(id);
    if (!group) groups.set(id, (group = { payerType: row.payerType, payerId: row.payerId, acc: emptyAcc() }));
    add(group.acc, row);
  }
  const sorted = [...groups.values()].sort(
    (a, b) =>
      byCost(a.acc, b.acc) ||
      a.payerType.localeCompare(b.payerType) ||
      a.payerId.localeCompare(b.payerId),
  );
  const top = sorted.slice(0, limit);
  const rest = sorted.slice(limit);

  let others: PayerCut['others'] = null;
  if (rest.length > 0) {
    const acc = emptyAcc();
    for (const group of rest) {
      acc.calls += group.acc.calls;
      acc.unpricedCalls += group.acc.unpricedCalls;
      acc.input += group.acc.input;
      acc.output += group.acc.output;
      acc.cacheRead += group.acc.cacheRead;
      acc.cacheWrite += group.acc.cacheWrite;
      acc.micro += group.acc.micro;
    }
    others = { payers: rest.length, ...figures(acc) };
  }

  return {
    total: figures(totalOf(rows)),
    payers: sorted.length,
    items: top.map((group) => ({ payerType: group.payerType, payerId: group.payerId, ...figures(group.acc) })),
    others,
  };
}

export interface WeekCut {
  total: AdminUsageFigures;
  items: WeekItem[];
}

/**
 * Every ISO week the range touches, in order, zeros included. A week is labelled by its ISO
 * year, so the last days of December can be week 1 of the next year.
 */
export function cutByWeek(rows: readonly DaySums[], from: string, to: string): WeekCut {
  const buckets = new Map<string, { week: string; from: string; to: string; acc: Acc }>();
  const start = dayToDate(from);
  const end = dayToDate(to);
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const week = isoWeek(day);
    const text = dateToDay(day);
    const bucket = buckets.get(week);
    if (bucket) bucket.to = text;
    else buckets.set(week, { week, from: text, to: text, acc: emptyAcc() });
  }
  for (const row of rows) {
    // Rows come from a query bounded by the same range; one outside it has no bucket to land in.
    const bucket = buckets.get(isoWeek(row.day));
    if (bucket) add(bucket.acc, row);
  }
  return {
    total: figures(totalOf(rows)),
    items: [...buckets.values()].map((bucket) => ({
      week: bucket.week,
      from: bucket.from,
      to: bucket.to,
      ...figures(bucket.acc),
    })),
  };
}

/** `2026-11-14` (a Saturday) → `2026-W46`. */
export function isoWeek(day: Date): string {
  const date = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  // Thursday of the same ISO week decides the year.
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const year = date.getUTCFullYear();
  const firstJan = Date.UTC(year, 0, 1);
  const week = Math.ceil(((date.getTime() - firstJan) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function dayToDate(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function dateToDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
