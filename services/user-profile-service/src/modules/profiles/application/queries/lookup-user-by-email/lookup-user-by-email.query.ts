import type { IQuery } from '@nestjs/cqrs';

export class LookupUserByEmailQuery implements IQuery {
  constructor(public readonly email: string) {}
}
