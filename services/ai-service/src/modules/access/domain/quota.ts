import type { Payer } from './payer.js';

/** One counter: what a payer has spent on one agent in one tariff period. */
export interface QuotaKey {
  payer: Payer;
  capability: string;
  periodStart: Date;
  periodEnd: Date;
}

/** The counter the gate checked; the gateway charges the call's credits to it afterwards. */
export interface QuotaInForce {
  key: QuotaKey;
  limitMicro: bigint;
}
