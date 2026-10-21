/**
 * Credits are decimal strings with up to six places (DECIMAL(18, 6) in the database), so
 * adding them goes through integer micro-credits rather than floats.
 */
const SCALE = 6;
const FACTOR = 10n ** BigInt(SCALE);

function toMicro(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * FACTOR + BigInt(fraction.padEnd(SCALE, '0').slice(0, SCALE));
}

function fromMicro(micro: bigint): string {
  const whole = micro / FACTOR;
  const fraction = (micro % FACTOR).toString().padStart(SCALE, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

/** Sum of non-negative decimal credit strings, without trailing zeros (`'20.5'`, `'300'`). */
export function addCredits(...values: string[]): string {
  return fromMicro(values.reduce((sum, v) => sum + toMicro(v), 0n));
}
