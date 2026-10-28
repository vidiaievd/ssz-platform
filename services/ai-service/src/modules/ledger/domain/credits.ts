const SCALE = 1_000_000n; // credits and the rate carry six decimals

/**
 * Credits for a cost, as a decimal string with six places: `costMicros × rate / 1e6`,
 * rounded half up. `rate` is credits per one currency unit (one USD), a plain decimal.
 *
 * Done in BigInt like `costMicros`: a quota is a sum of many small calls, and float
 * rounding on each would drift the total.
 */
export function creditsFor(costMicros: number, rate: string): string {
  if (!Number.isSafeInteger(costMicros) || costMicros < 0) throw new Error(`Not a cost: ${costMicros}`);
  // costMicros × rateScaled = credits × 1e12; divide by 1e6 to keep six decimals.
  return formatMicroCredits((BigInt(costMicros) * parseRate(rate) + SCALE / 2n) / SCALE);
}

/** Throws on anything that is not a plain non-negative decimal with at most six places. */
export function parseRate(rate: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(rate)) throw new Error(`Not a credit rate: "${rate}"`);
  return microCredits(rate);
}

/** Credits as an integer count of 1e-6 credits — the unit quotas are summed in. */
export function microCredits(credits: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(credits);
  if (!match) throw new Error(`Not a credit amount: "${credits}"`);
  return BigInt(match[1]!) * SCALE + BigInt((match[2] ?? '').padEnd(6, '0'));
}

/** Micro-credits back to the decimal string with six places that `credits` columns hold. */
export function formatMicroCredits(micro: bigint): string {
  if (micro < 0n) throw new Error(`Not a credit amount: ${micro}`);
  return `${micro / SCALE}.${(micro % SCALE).toString().padStart(6, '0')}`;
}
