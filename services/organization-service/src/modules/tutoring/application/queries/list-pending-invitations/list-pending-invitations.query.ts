import { IQuery } from '@nestjs/cqrs';

export class ListPendingInvitationsQuery implements IQuery {
  constructor(public readonly tutorId: string) {}
}
