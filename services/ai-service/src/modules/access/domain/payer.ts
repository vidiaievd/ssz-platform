import type { AiPayerType } from '@ssz/contracts';

/** Who is billed for a call. Settled on the server from the request's context, never sent by the client. */
export interface Payer {
  type: AiPayerType;
  id: string;
}

/** The payer for calls nobody is billed for: admin checks. */
export const PLATFORM_PAYER: Payer = { type: 'platform', id: 'platform' };

/** Payers a school or a learner can be; `platform` has no policy and no tariff. */
export const BILLED_PAYER_TYPES = ['workspace', 'user'] as const;
export type BilledPayerType = (typeof BILLED_PAYER_TYPES)[number];
