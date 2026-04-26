import { Result } from '../../../../shared/kernel/result.js';
import { ValueObject } from '../../../../shared/domain/value-object.base.js';
import { AssignmentDueDateInPastError } from '../exceptions/assignment.errors.js';

interface DueDateProps {
  value: Date;
}

export class AssignmentDueDate extends ValueObject<DueDateProps> {
  private constructor(props: DueDateProps) {
    super(props);
  }

  static create(
    date: Date,
    now: Date,
  ): Result<AssignmentDueDate, AssignmentDueDateInPastError> {
    if (date <= now) {
      return Result.fail(new AssignmentDueDateInPastError());
    }
    return Result.ok(new AssignmentDueDate({ value: date }));
  }

  get value(): Date {
    return this.props.value;
  }
}
