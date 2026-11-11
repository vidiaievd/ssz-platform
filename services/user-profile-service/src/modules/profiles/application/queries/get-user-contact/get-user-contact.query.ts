import type { IQuery } from '@nestjs/cqrs';

export class GetUserContactQuery implements IQuery {
  constructor(public readonly userId: string) {}
}
