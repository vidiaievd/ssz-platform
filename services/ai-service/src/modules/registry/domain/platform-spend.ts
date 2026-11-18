import { formatMicroCredits } from '../../ledger/domain/credits.js';
import type { AiModel, AiProvider } from './registry.types.js';

/**
 * What the platform spent on AI in a period, per model (plan 90, phase 7, step 2). Read from the
 * call ledger, not from analytics' `ai_usage_daily`: only the ledger keeps money, audio and spoken
 * characters, so a speech model (Azure, whisper) shows here with what it really cost.
 */

const DAY_MS = 86_400_000;
export const SPEND_DEFAULT_DAYS = 30;
export const SPEND_MAX_DAYS = 366;

const MICROS = 1_000_000n;

export interface SpendPeriod {
  /** First day, inclusive, `YYYY-MM-DD` (UTC). */
  from: string;
  /** Last day, inclusive. */
  to: string;
  start: Date;
  /** The day after `to`, 00:00 UTC — the query's exclusive end. */
  end: Date;
  days: string[];
}

export type SpendPeriodResult = { ok: true; period: SpendPeriod } | { ok: false; error: string };

/**
 * `from` and `to` are UTC calendar days, both inclusive — the same rule as organization's
 * `admin/stats`. No `to` = today; no `from` = 30 days ending at `to`.
 */
export function resolveSpendPeriod(from: string | undefined, to: string | undefined, now: Date): SpendPeriodResult {
  const toDay = to === undefined ? startOfUtcDay(now) : parseDay(to);
  if (!toDay) return { ok: false, error: '`to` must be a date YYYY-MM-DD' };

  const fromDay = from === undefined ? new Date(toDay.getTime() - (SPEND_DEFAULT_DAYS - 1) * DAY_MS) : parseDay(from);
  if (!fromDay) return { ok: false, error: '`from` must be a date YYYY-MM-DD' };
  if (fromDay > toDay) return { ok: false, error: '`from` must not be after `to`' };

  const count = Math.round((toDay.getTime() - fromDay.getTime()) / DAY_MS) + 1;
  if (count > SPEND_MAX_DAYS) return { ok: false, error: `The period is at most ${SPEND_MAX_DAYS} days` };

  const days = Array.from({ length: count }, (_, i) => dayLabel(new Date(fromDay.getTime() + i * DAY_MS)));
  return {
    ok: true,
    period: { from: days[0]!, to: days[count - 1]!, start: fromDay, end: new Date(toDay.getTime() + DAY_MS), days },
  };
}

/** One group of ledger rows: a day, a model, a capability and a currency. */
export interface SpendRow {
  day: string;
  modelId: string;
  providerId: string | null;
  capability: string;
  /** Null for calls the model had no price for. */
  currency: string | null;
  calls: number;
  /** `error` or `invalid_response`. */
  failed: number;
  fallbackCalls: number;
  /** Calls without a cost: the model had no price in effect. Not the same as "cost nothing". */
  unpricedCalls: number;
  inputTokens: bigint;
  outputTokens: bigint;
  cacheReadTokens: bigint;
  cacheWriteTokens: bigint;
  audioMs: bigint;
  characters: bigint;
  costMicros: bigint;
  microCredits: bigint;
}

export interface Money {
  currency: string;
  /** Decimal string with six places — never a float. */
  amount: string;
}

export interface SpendUsage {
  calls: number;
  failed: number;
  fallbackCalls: number;
  unpricedCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  audioMs: number;
  characters: number;
  /** One entry per currency, by currency code; empty when nothing was priced. */
  cost: Money[];
  /** What the calls charged their payers, in platform credits. */
  credits: string;
}

export interface SpendBinding {
  capability: string;
  role: 'primary' | 'fallback';
}

export interface ModelSpend extends SpendUsage {
  modelId: string;
  /** Null when the model or its provider is no longer in the registry: the ledger outlives them. */
  provider: Pick<AiProvider, 'id' | 'code' | 'kind' | 'displayName' | 'region'> | null;
  model: Pick<AiModel, 'displayName' | 'providerModelId' | 'modality' | 'status'> | null;
  /** Where the model is bound now. A bound model with no calls in the period is listed with zeros. */
  boundTo: SpendBinding[];
  byCapability: (SpendUsage & { capability: string })[];
}

export interface SpendDayModel {
  modelId: string;
  calls: number;
  cost: Money[];
}

export interface SpendDay {
  day: string;
  calls: number;
  cost: Money[];
  /** Only the models with calls that day. */
  byModel: SpendDayModel[];
}

export interface PlatformSpend {
  from: string;
  to: string;
  totals: SpendUsage;
  models: ModelSpend[];
  /** Every day of the period, zeros included. */
  daily: SpendDay[];
}

export interface SpendRegistry {
  models: AiModel[];
  providers: AiProvider[];
  bindings: { capability: string; primaryModelId: string; fallbackModelId: string | null }[];
}

export function buildPlatformSpend(period: SpendPeriod, rows: SpendRow[], registry: SpendRegistry): PlatformSpend {
  const models = new Map(registry.models.map((m) => [m.id, m]));
  const providers = new Map(registry.providers.map((p) => [p.id, p]));

  const boundTo = new Map<string, SpendBinding[]>();
  for (const b of [...registry.bindings].sort((a, z) => a.capability.localeCompare(z.capability))) {
    push(boundTo, b.primaryModelId, { capability: b.capability, role: 'primary' });
    if (b.fallbackModelId) push(boundTo, b.fallbackModelId, { capability: b.capability, role: 'fallback' });
  }

  const totals = new Tally();
  const perModel = new Map<string, { tally: Tally; providerId: string | null; byCapability: Map<string, Tally> }>();
  const perDay = new Map<string, { tally: Tally; byModel: Map<string, Tally> }>();

  for (const row of rows) {
    totals.add(row);

    let model = perModel.get(row.modelId);
    if (!model) {
      model = { tally: new Tally(), providerId: row.providerId, byCapability: new Map() };
      perModel.set(row.modelId, model);
    }
    model.tally.add(row);
    model.providerId ??= row.providerId;
    at(model.byCapability, row.capability).add(row);

    let day = perDay.get(row.day);
    if (!day) {
      day = { tally: new Tally(), byModel: new Map() };
      perDay.set(row.day, day);
    }
    day.tally.add(row);
    at(day.byModel, row.modelId).add(row);
  }

  // A bound model that was not called still shows: "bound, cost nothing" is worth seeing.
  for (const modelId of boundTo.keys()) {
    if (!perModel.has(modelId)) perModel.set(modelId, { tally: new Tally(), providerId: null, byCapability: new Map() });
  }

  const modelList: ModelSpend[] = [...perModel.entries()].map(([modelId, entry]) => {
    const model = models.get(modelId) ?? null;
    const provider = providers.get(model?.providerId ?? entry.providerId ?? '') ?? null;
    return {
      modelId,
      provider: provider && {
        id: provider.id,
        code: provider.code,
        kind: provider.kind,
        displayName: provider.displayName,
        region: provider.region,
      },
      model: model && {
        displayName: model.displayName,
        providerModelId: model.providerModelId,
        modality: model.modality,
        status: model.status,
      },
      boundTo: boundTo.get(modelId) ?? [],
      ...entry.tally.usage(),
      byCapability: [...entry.byCapability.entries()]
        .map(([capability, tally]) => ({ capability, ...tally.usage(), weight: tally.weight() }))
        .sort(byWeight((c) => c.capability))
        .map(({ weight: _weight, ...rest }) => rest),
      weight: entry.tally.weight(),
    };
  })
    .sort(byWeight((m) => m.model?.displayName ?? m.modelId))
    .map(({ weight: _weight, ...rest }) => rest);

  const daily: SpendDay[] = period.days.map((day) => {
    const entry = perDay.get(day);
    if (!entry) return { day, calls: 0, cost: [], byModel: [] };
    return {
      day,
      calls: entry.tally.calls,
      cost: entry.tally.money(),
      byModel: [...entry.byModel.entries()]
        .map(([modelId, tally]) => ({ modelId, calls: tally.calls, cost: tally.money(), weight: tally.weight() }))
        .sort(byWeight((m) => m.modelId))
        .map(({ weight: _weight, ...rest }) => rest),
    };
  });

  return { from: period.from, to: period.to, totals: totals.usage(), models: modelList, daily };
}

/** Running sums of ledger rows. BigInt throughout: a period is many small calls. */
class Tally {
  calls = 0;
  private failed = 0;
  private fallbackCalls = 0;
  private unpricedCalls = 0;
  private inputTokens = 0n;
  private outputTokens = 0n;
  private cacheReadTokens = 0n;
  private cacheWriteTokens = 0n;
  private audioMs = 0n;
  private characters = 0n;
  private microCredits = 0n;
  private readonly cost = new Map<string, bigint>();

  add(row: SpendRow): void {
    this.calls += row.calls;
    this.failed += row.failed;
    this.fallbackCalls += row.fallbackCalls;
    this.unpricedCalls += row.unpricedCalls;
    this.inputTokens += row.inputTokens;
    this.outputTokens += row.outputTokens;
    this.cacheReadTokens += row.cacheReadTokens;
    this.cacheWriteTokens += row.cacheWriteTokens;
    this.audioMs += row.audioMs;
    this.characters += row.characters;
    this.microCredits += row.microCredits;
    if (row.currency) this.cost.set(row.currency, (this.cost.get(row.currency) ?? 0n) + row.costMicros);
  }

  money(): Money[] {
    return [...this.cost.entries()]
      .sort(([a], [z]) => a.localeCompare(z))
      .map(([currency, micros]) => ({ currency, amount: formatMicros(micros) }));
  }

  /** Order key: USD first (what the platform pays in), then any other money, then calls. */
  weight(): [bigint, bigint, number] {
    let other = 0n;
    for (const [currency, micros] of this.cost) if (currency !== 'USD') other += micros;
    return [this.cost.get('USD') ?? 0n, other, this.calls];
  }

  usage(): SpendUsage {
    return {
      calls: this.calls,
      failed: this.failed,
      fallbackCalls: this.fallbackCalls,
      unpricedCalls: this.unpricedCalls,
      inputTokens: Number(this.inputTokens),
      outputTokens: Number(this.outputTokens),
      cacheReadTokens: Number(this.cacheReadTokens),
      cacheWriteTokens: Number(this.cacheWriteTokens),
      audioMs: Number(this.audioMs),
      characters: Number(this.characters),
      cost: this.money(),
      credits: formatMicroCredits(this.microCredits),
    };
  }
}

/** Biggest spend first; ties by name, so the order is stable. */
function byWeight<T extends { weight: [bigint, bigint, number] }>(name: (item: T) => string) {
  return (a: T, z: T): number => {
    for (let i = 0; i < 3; i++) {
      const x = a.weight[i]!;
      const y = z.weight[i]!;
      if (x !== y) return x > y ? -1 : 1;
    }
    return name(a).localeCompare(name(z));
  };
}

function formatMicros(micros: bigint): string {
  const sign = micros < 0n ? '-' : '';
  const abs = micros < 0n ? -micros : micros;
  return `${sign}${abs / MICROS}.${(abs % MICROS).toString().padStart(6, '0')}`;
}

function at(map: Map<string, Tally>, key: string): Tally {
  let tally = map.get(key);
  if (!tally) {
    tally = new Tally();
    map.set(key, tally);
  }
  return tally;
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function parseDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || dayLabel(date) !== value ? null : date;
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function dayLabel(date: Date): string {
  return date.toISOString().slice(0, 10);
}
