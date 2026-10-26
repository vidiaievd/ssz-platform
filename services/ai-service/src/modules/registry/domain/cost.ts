import type { LlmUsage } from '../../providers/domain/llm-result.js';
import type { AiModelPrice } from './registry.types.js';

const SCALE = 1_000_000n; // prices carry six decimals (Decimal(12,6))
const MS_PER_HOUR = 3_600_000n;

/**
 * Cost of one call in micro-units of the price's currency (1e-6 USD), rounded half up.
 *
 * A price is per 1M tokens, so `tokens × pricePerMtok / 1M` is the cost in currency units
 * and `tokens × pricePerMtok` is the cost in micro-units. Done in BigInt on the decimal
 * strings, never on floats: summed over a month of calls, float error becomes money.
 */
export function costMicros(usage: LlmUsage, price: AiModelPrice): number {
  return Number((tokensScaled(usage, price) + SCALE / 2n) / SCALE);
}

/**
 * Cost of a call to a speech model (plan 82, step 3): tokens, if it reported any, plus the
 * audio it took at the price per hour — `ms × pricePerHour / 3.6e6` in currency units, so
 * `ms × pricePerHour(scaled) / 3.6e6` in micro-units. One rounding, at the end, over both.
 */
export function speechCostMicros(audioMs: number, usage: LlmUsage | null, price: AiModelPrice): number {
  if (!Number.isSafeInteger(audioMs) || audioMs < 0) throw new Error(`Not an audio length: ${audioMs}`);
  // Over one denominator, 1e6 × 3.6e6: tokens are in 1e-12 units, audio is ms × the scaled hourly price.
  const numerator =
    (usage ? tokensScaled(usage, price) : 0n) * MS_PER_HOUR + BigInt(audioMs) * toScaled(price.audioPerHour) * SCALE;
  const denominator = SCALE * MS_PER_HOUR;
  return Number((numerator + denominator / 2n) / denominator);
}

/** Token cost in 1e-12 of the currency: tokens × scaled price per 1M. */
function tokensScaled(usage: LlmUsage, price: AiModelPrice): bigint {
  return (
    BigInt(usage.input) * toScaled(price.inputPerMtok) +
    BigInt(usage.output) * toScaled(price.outputPerMtok) +
    BigInt(usage.cacheRead) * toScaled(price.cacheReadPerMtok) +
    BigInt(usage.cacheWrite) * toScaled(price.cacheWritePerMtok)
  );
}

/** "2.5" → 2_500_000n. Rejects anything that is not a plain non-negative decimal. */
function toScaled(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value);
  if (!match) throw new Error(`Not a price: "${value}"`);
  return BigInt(match[1]!) * SCALE + BigInt((match[2] ?? '').padEnd(6, '0'));
}
