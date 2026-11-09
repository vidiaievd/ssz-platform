import type { Payer } from './payer.js';

/** One counter: what a payer has spent on one agent in one tariff period. */
export interface QuotaKey {
  payer: Payer;
  /** The agent's pool (`quotaPoolOf`): agents sold under one key share a counter. */
  capability: string;
  periodStart: Date;
  periodEnd: Date;
}

/** The counter the gate checked; the gateway charges the call's credits to it afterwards. */
export interface QuotaInForce {
  key: QuotaKey;
  limitMicro: bigint;
  /** What the counter held when the gate checked it — before this call. */
  usedMicro: bigint;
}
