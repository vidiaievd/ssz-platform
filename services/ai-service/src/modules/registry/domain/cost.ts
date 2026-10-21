import type { LlmUsage } from '../../providers/domain/llm-result.js';
import type { AiModelPrice } from './registry.types.js';

const SCALE = 1_000_000n; // prices carry six decimals (Decimal(12,6))

/**
 * Cost of one call in micro-units of the price's currency (1e-6 USD), rounded half up.
 *
 * A price is per 1M tokens, so `tokens × pricePerMtok / 1M` is the cost in currency units
 * and `tokens × pricePerMtok` is the cost in micro-units. Done in BigInt on the decimal
 * strings, never on floats: summed over a month of calls, float error becomes money.
 */
export function costMicros(usage: LlmUsage, price: AiModelPrice): number {
  const scaled =
    BigInt(usage.input) * toScaled(price.inputPerMtok) +
    BigInt(usage.output) * toScaled(price.outputPerMtok) +
    BigInt(usage.cacheRead) * toScaled(price.cacheReadPerMtok) +
    BigInt(usage.cacheWrite) * toScaled(price.cacheWritePerMtok);
  return Number((scaled + SCALE / 2n) / SCALE);
}

/** "2.5" → 2_500_000n. Rejects anything that is not a plain non-negative decimal. */
function toScaled(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(value);
  if (!match) throw new Error(`Not a price: "${value}"`);
  return BigInt(match[1]!) * SCALE + BigInt((match[2] ?? '').padEnd(6, '0'));
}
