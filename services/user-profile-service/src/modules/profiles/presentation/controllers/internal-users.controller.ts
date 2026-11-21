import { Controller, Get, NotFoundException, Query, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../../../common/decorators/public.decorator.js';
import { InternalAuthGuard } from '../../../../common/guards/internal-auth.guard.js';
import { LookupUserByEmailQuery } from '../../application/queries/lookup-user-by-email/lookup-user-by-email.query.js';
import type { UserLookupResult } from '../../application/queries/lookup-user-by-email/lookup-user-by-email.handler.js';

/**
 * Who owns an e-mail address — for other services only (`x-service-token`). There is no public
 * route any more: whether an address has an account is answered by organization to staff of a
 * school (`schools/:id/users/lookup`) and used by content for sharing by e-mail, each with its
 * own permission check and a per-asker rate limit (plan 90, session 16 remark 4).
 */
@ApiExcludeController()
@Public()
@UseGuards(InternalAuthGuard)
@Controller('internal/users')
export class InternalUsersController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('lookup')
  async lookup(@Query('email') email: string | undefined): Promise<UserLookupResult> {
    const result: UserLookupResult | null = email
      ? await this.queryBus.execute(new LookupUserByEmailQuery(email))
      : null;
    if (!result) throw new NotFoundException('No user found with that email');
    return result;
  }
}
