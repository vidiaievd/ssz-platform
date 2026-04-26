import type { IQuery } from '@nestjs/cqrs';
import type { EnrollmentStatus } from '../../domain/entities/enrollment.entity.js';

export class ListUserEnrollmentsQuery implements IQuery {
  constructor(
    public readonly userId: string,
    public readonly status?: EnrollmentStatus[],
  ) {}
}
