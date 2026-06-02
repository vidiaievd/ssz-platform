import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../infrastructure/auth/jwt-verifier.service.js';
import { GetActivityQuery } from '../queries/get-activity.query.js';
import { GetActivityResponseDto } from '../dto/activity-response.dto.js';

@ApiTags('Activity')
@ApiBearerAuth()
@Controller('schools/:schoolId/activity')
export class ActivityController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({ summary: 'Get school activity feed (cursor-paginated, newest first)' })
  @ApiParam({ name: 'schoolId', format: 'uuid' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 6 })
  @ApiQuery({ name: 'cursor', required: false, type: String, description: 'ISO timestamp of last received item' })
  @ApiOkResponse({ type: GetActivityResponseDto })
  @ApiForbiddenResponse({ description: 'Not a member or insufficient role' })
  @ApiNotFoundResponse({ description: 'School not found' })
  async getActivity(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Query('limit', new DefaultValuePipe(6), ParseIntPipe) limit: number,
    @Query('cursor') cursor: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GetActivityResponseDto> {
    return this.queryBus.execute(
      new GetActivityQuery(schoolId, user.userId, Math.min(limit, 50), cursor),
    );
  }
}
