import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../infrastructure/auth/jwt-verifier.service.js';
import { GetKpisQuery } from '../queries/get-kpis.query.js';
import { GetKpisResponseDto } from '../dto/kpi-response.dto.js';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('schools/:schoolId/dashboard')
export class DashboardController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('kpis')
  @ApiOperation({ summary: 'Get school dashboard KPIs (value, delta, trend, sparkline)' })
  @ApiParam({ name: 'schoolId', format: 'uuid' })
  @ApiOkResponse({ type: GetKpisResponseDto })
  @ApiForbiddenResponse({ description: 'Not a member or insufficient role' })
  @ApiNotFoundResponse({ description: 'School not found' })
  async getKpis(
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GetKpisResponseDto> {
    return this.queryBus.execute(new GetKpisQuery(schoolId, user.userId));
  }
}
