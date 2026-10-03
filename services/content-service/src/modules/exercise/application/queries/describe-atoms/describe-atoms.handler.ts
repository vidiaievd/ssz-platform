import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { DescribeAtomsQuery } from './describe-atoms.query.js';
import { EXERCISE_ITEM_TARGET_REPOSITORY } from '../../../domain/repositories/exercise-item-target.repository.interface.js';
import type {
  AtomDescriptor,
  IExerciseItemTargetRepository,
} from '../../../domain/repositories/exercise-item-target.repository.interface.js';

/**
 * Atoms that still exist, by address — plan 63, phase 4.
 *
 * An address that resolves to nothing is simply absent from the answer rather than
 * reported as an error: a retired atom is an ordinary thing for an old record to point at,
 * and the caller's screen drops the row instead of failing.
 */
@QueryHandler(DescribeAtomsQuery)
export class DescribeAtomsHandler implements IQueryHandler<DescribeAtomsQuery, AtomDescriptor[]> {
  constructor(
    @Inject(EXERCISE_ITEM_TARGET_REPOSITORY)
    private readonly targetRepo: IExerciseItemTargetRepository,
  ) {}

  async execute(query: DescribeAtomsQuery): Promise<AtomDescriptor[]> {
    if (query.refs.length === 0) return [];
    return this.targetRepo.describeAtoms([...query.refs]);
  }
}
