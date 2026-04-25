import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Query,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { GetAssetQuery, type GetAssetResult } from '../../application/queries/get-asset/get-asset.query.js';
import { ListUserAssetsQuery, type ListUserAssetsResult } from '../../application/queries/list-user-assets/list-user-assets.query.js';
import { DeleteAssetCommand, type DeleteAssetResult } from '../../application/commands/delete-asset/delete-asset.command.js';
import { AssetResponseDto, PagedAssetsResponseDto } from '../dto/asset-response.dto.js';
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
