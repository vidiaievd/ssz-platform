import { Injectable } from '@nestjs/common';
import type { PayerResolver } from '../../../access/application/ports/payer-resolver.js';
import type { Payer } from '../../../access/domain/payer.js';

/** The work of a learner without a school: the learner pays, under their own tariff (plan 78). */
@Injectable()
export class LearnerPayerResolver implements PayerResolver<{ userId: string }> {
  async resolve(input: { userId: string }): Promise<Payer> {
    return { type: 'user', id: input.userId };
  }
}
