import type { IQuery } from '@nestjs/cqrs';

export class CountEnrollmentsByContainerQuery implements IQuery {
  constructor(public readonly containerId: string) {}
}
