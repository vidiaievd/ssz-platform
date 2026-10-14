import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { GetAssetQuery, type GetAssetResult } from '../../application/queries/get-asset/get-asset.query.js';
import {
  GetPreviousAssetQuery,
  type GetPreviousAssetResult,
} from '../../application/queries/get-previous-asset/get-previous-asset.query.js';
import { ListUserAssetsQuery, type ListUserAssetsResult } from '../../application/queries/list-user-assets/list-user-assets.query.js';
import { DeleteAssetCommand, type DeleteAssetResult } from '../../application/commands/delete-asset/delete-asset.command.js';
import {
  SupersedeAssetCommand,
  type SupersedeAssetResult,
} from '../../application/commands/supersede-asset/supersede-asset.command.js';
import { isAuthor } from '../../../../common/authoring-roles.js';
import {
  AssetResponseDto,
  PagedAssetsResponseDto,
  SupersedeAssetDto,
  SupersedeAssetResponseDto,
} from '../dto/asset-response.dto.js';
import { ListAssetsQueryDto } from '../dto/list-assets-query.dto.js';

@ApiTags('assets')
@ApiBearerAuth()
@Controller('media/assets')
export class AssetsController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List your media assets',
    description: 'Returns a paginated list of assets owned by the current user.',
  })
  @ApiResponse({ status: 200, type: PagedAssetsResponseDto })
  async listAssets(
    @Query() queryDto: ListAssetsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PagedAssetsResponseDto> {
    const result: ListUserAssetsResult = await this.queryBus.execute(
      new ListUserAssetsQuery(user.userId, {
        entityType: queryDto.entityType,
        entityId: queryDto.entityId,
        limit: queryDto.limit ?? 20,
        offset: queryDto.offset ?? 0,
      }),
    );

    return result.value;
  }

  @Get(':assetId')
  @ApiOperation({
    summary: 'Get a single media asset',
    description: 'Returns asset details with variant URLs. Private assets return pre-signed URLs (1h TTL).',
  })
  @ApiResponse({ status: 200, type: AssetResponseDto })
  @ApiResponse({ status: 404, description: 'Asset not found or does not belong to you' })
  async getAsset(
    @Param('assetId') assetId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AssetResponseDto> {
    const result: GetAssetResult = await this.queryBus.execute(
      new GetAssetQuery(assetId, user.userId),
    );

    if (result.isFail) {
      throw new NotFoundException('Asset not found');
    }

    return result.value as AssetResponseDto;
  }

  @Get(':assetId/previous')
  @ApiOperation({
    summary: 'The lesson asset this one replaced',
    description:
      'The most recently replaced asset whose `supersededBy` is this one and that is not deleted yet — ' +
      'what "restore the previous narration" goes back to. 404 when there is none or it is gone.',
  })
  @ApiResponse({ status: 200, type: AssetResponseDto })
  @ApiResponse({ status: 404, description: 'Nothing to go back to' })
  async getPrevious(
    @Param('assetId') assetId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AssetResponseDto> {
    const result: GetPreviousAssetResult = await this.queryBus.execute(new GetPreviousAssetQuery(assetId, user.userId));
    if (result.isFail) throw new NotFoundException('No previous asset');
    return result.value as AssetResponseDto;
  }

  @Post(':assetId/supersede')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a lesson asset as replaced by another',
    description:
      'Called when a lesson body names a new narration instead of this one (plan 74, D5). Nothing ' +
      'is deleted: the asset stays READY and restorable until `restorableUntil`; afterwards the ' +
      'sweep removes it only if no lesson body still names it. Superseding the replacement by the ' +
      'old asset is how the author goes back: the old one is in use again.',
  })
  @ApiResponse({ status: 200, type: SupersedeAssetResponseDto })
  @ApiResponse({ status: 403, description: 'The caller does not author lessons' })
  @ApiResponse({ status: 404, description: 'Asset or replacement not found' })
  @ApiResponse({ status: 422, description: 'Not a lesson asset, or replaced by itself' })
  async supersede(
    @Param('assetId') assetId: string,
    @Body() dto: SupersedeAssetDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SupersedeAssetResponseDto> {
    if (!isAuthor(user.roles)) throw new ForbiddenException('Only lesson authors can replace lesson media');

    const result: SupersedeAssetResult = await this.commandBus.execute(new SupersedeAssetCommand(assetId, dto.by));
    if (result.isFail) {
      if (result.error === 'ASSET_NOT_FOUND' || result.error === 'REPLACEMENT_NOT_FOUND') {
        throw new NotFoundException(result.error);
      }
      throw new UnprocessableEntityException(result.error);
    }
    return result.value;
  }

  @Delete(':assetId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a media asset',
    description: 'Soft-deletes the asset and removes its objects from storage.',
  })
  @ApiResponse({ status: 204, description: 'Asset deleted' })
  @ApiResponse({ status: 404, description: 'Asset not found or does not belong to you' })
  async deleteAsset(
    @Param('assetId') assetId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result: DeleteAssetResult = await this.commandBus.execute(
      new DeleteAssetCommand(assetId, user.userId),
    );

    if (result.isFail) {
      if (result.error === 'ASSET_NOT_FOUND') {
        throw new NotFoundException('Asset not found');
      }
      throw new UnprocessableEntityException(result.error);
    }
  }
}
