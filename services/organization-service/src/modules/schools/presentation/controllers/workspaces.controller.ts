import { Controller, Get, Param } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { GetWorkspaceQuery } from '../../application/queries/get-workspace/get-workspace.query.js';
import { WorkspaceResponseDto } from '../dto/workspace.response.dto.js';

@ApiTags('Workspaces')
@ApiBearerAuth('JWT')
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get(':idOrSlug')
  @ApiOperation({
    summary: 'Resolve a workspace for the caller',
    description:
      'Answers the same shape for a school and for a private tutor\'s own space, so a screen can be addressed by workspace rather than by contour. A caller who does not belong here gets the same 404 as one asking about a workspace that does not exist.',
  })
  @ApiResponse({ status: 200, type: WorkspaceResponseDto })
  @ApiResponse({ status: 404, description: 'No such workspace, or not yours' })
  async getWorkspace(
    @CurrentUser() user: JwtPayload,
    @Param('idOrSlug') idOrSlug: string,
  ): Promise<WorkspaceResponseDto> {
    return this.queryBus.execute(new GetWorkspaceQuery(idOrSlug, user.sub));
  }
}
