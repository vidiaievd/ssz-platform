import type { Payer } from '../../domain/payer.js';

/**
 * Settles who pays for an agent's call from what the server knows about the request
 * (course → workspace, self-study → the learner). Each agent brings its own in its plan;
 * a `payer` sent by the client is never trusted.
 */
export interface PayerResolver<TInput> {
  resolve(input: TInput): Promise<Payer>;
}
