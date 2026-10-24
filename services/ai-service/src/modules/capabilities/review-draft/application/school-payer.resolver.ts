import { Injectable } from '@nestjs/common';
import type { PayerResolver } from '../../../access/application/ports/payer-resolver.js';
import type { Payer } from '../../../access/domain/payer.js';

/**
 * A submission in a school's queue: the school pays (its workspace account, plan 78).
 * Part 2 (`review_direct`) brings the learner's own resolver.
 */
@Injectable()
export class SchoolPayerResolver implements PayerResolver<{ schoolId: string }> {
  async resolve(input: { schoolId: string }): Promise<Payer> {
    return { type: 'workspace', id: input.schoolId };
  }
}
