import { Controller, Get, Query, NotFoundException } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../../common/decorators/roles.decorator.js';
import { LookupUserByEmailQuery } from '../../application/queries/lookup-user-by-email/lookup-user-by-email.query.js';
import type { UserLookupResult } from '../../application/queries/lookup-user-by-email/lookup-user-by-email.handler.js';

@ApiTags('users')
@ApiBearerAuth('JWT')
@Controller('users')
export class UsersLookupController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('lookup')
  @Roles('tutor', 'school_admin')
  @ApiOperation({ summary: 'Look up a user by email — school admin / tutor only. Returns userId + roles.' })
  @ApiQuery({ name: 'email', required: true, description: 'Email address to look up' })
  @ApiResponse({ status: 200, schema: { properties: { userId: { type: 'string' }, roles: { type: 'array', items: { type: 'string' } }, displayName: { type: 'string' } } } })
  @ApiResponse({ status: 404, description: 'No user with that email' })
  async lookup(@Query('email') email: string): Promise<UserLookupResult> {
    const result: UserLookupResult | null = await this.queryBus.execute(
      new LookupUserByEmailQuery(email),
    );
    if (!result) throw new NotFoundException('No user found with that email');
    return result;
  }
}
