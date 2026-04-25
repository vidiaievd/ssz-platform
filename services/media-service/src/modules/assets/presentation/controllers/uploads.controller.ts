import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { RequestUploadCommand } from '../../application/commands/request-upload/request-upload.command.js';
import type { RequestUploadResult } from '../../application/commands/request-upload/request-upload.command.js';
import { FinalizeUploadCommand } from '../../application/commands/finalize-upload/finalize-upload.command.js';
import { MediaAssetDomainError } from '../../domain/exceptions/media-asset.exceptions.js';
import { RequestUploadDto } from '../dto/request-upload.dto.js';
import { RequestUploadResponseDto } from '../dto/request-upload-response.dto.js';
import { Result } from '../../../../shared/kernel/result.js';

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('media/uploads')
export class UploadsController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('request')
  @ApiOperation({
    summary: 'Request a pre-signed upload URL',
    description:
      'Creates a MediaAsset record and returns a pre-signed PUT URL. ' +
      'Upload the file directly to that URL, then call /finalize.',
  })
  @ApiResponse({ status: 201, type: RequestUploadResponseDto })
  @ApiResponse({ status: 422, description: 'MIME type not allowed or file too large' })
  async requestUpload(
    @Body() dto: RequestUploadDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RequestUploadResponseDto> {
    const result: Result<RequestUploadResult, MediaAssetDomainError> =
      await this.commandBus.execute(
        new RequestUploadCommand(
          user.userId,
          dto.mimeType,
          BigInt(dto.sizeBytes),
          dto.originalFilename ?? null,
          dto.entityType ?? null,
          dto.entityId ?? null,
        ),
      );

    if (result.isFail) {
      throw new UnprocessableEntityException(result.error);
    }

    const { assetId, uploadUrl, expiresAt } = result.value;

    return {
      assetId,
      uploadUrl,
      expiresAt: expiresAt.toISOString(),
      finalizeUrl: `/api/v1/media/uploads/${assetId}/finalize`,
    };
  }

  @Post(':assetId/finalize')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Finalize an upload',
    description:
      'Confirms the file was uploaded to storage and transitions the asset to UPLOADED status. ' +
      'Triggers processing jobs for images and audio files.',
  })
  @ApiResponse({ status: 204, description: 'Upload finalized successfully' })
  @ApiResponse({ status: 404, description: 'Asset not found or does not belong to you' })
  @ApiResponse({ status: 422, description: 'File not found in storage or invalid status transition' })
  async finalizeUpload(
    @Param('assetId') assetId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute(
      new FinalizeUploadCommand(assetId, user.userId),
    );

    if (result.isFail) {
      if (result.error === 'ASSET_NOT_FOUND') {
        throw new NotFoundException('Asset not found');
      }
      if (result.error === 'FILE_NOT_FOUND_IN_STORAGE') {
        throw new UnprocessableEntityException(
          'File was not found in storage. Please upload before finalizing.',
        );
      }
      throw new UnprocessableEntityException(result.error);
    }
  }
}
