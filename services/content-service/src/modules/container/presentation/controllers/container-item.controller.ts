import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { AddContainerItemCommand } from '../../application/commands/add-container-item/add-container-item.command.js';
import { UpdateContainerItemCommand } from '../../application/commands/update-container-item/update-container-item.command.js';
import { RemoveContainerItemCommand } from '../../application/commands/remove-container-item/remove-container-item.command.js';
import { ReorderContainerItemsCommand } from '../../application/commands/reorder-container-items/reorder-container-items.command.js';
import { GetVersionItemsQuery } from '../../application/queries/get-version-items/get-version-items.query.js';
import type { Result } from '../../../../shared/kernel/result.js';
import type { ContainerDomainError } from '../../domain/exceptions/container-domain.exceptions.js';
import type { ContainerItemEntity } from '../../domain/entities/container-item.entity.js';
import { ContainerItemResponseDto } from '../dto/responses/container-item.response.dto.js';
import { AddContainerItemRequestDto } from '../dto/requests/add-container-item.request.dto.js';
import { UpdateContainerItemRequestDto } from '../dto/requests/update-container-item.request.dto.js';
import { ReorderItemsRequestDto } from '../dto/requests/reorder-items.request.dto.js';
import { throwHttpException } from '../utils/domain-error.mapper.js';

@ApiTags('Container Items')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('containers/:containerId/versions/:versionId/items')
export class ContainerItemController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all items in a container version' })
  @ApiOkResponse({ type: ContainerItemResponseDto, isArray: true })
  async findAll(@Param('versionId') versionId: string): Promise<ContainerItemResponseDto[]> {
    const result = await this.queryBus.execute<
      GetVersionItemsQuery,
      Result<ContainerItemEntity[], ContainerDomainError>
    >(new GetVersionItemsQuery(versionId));

    if (result.isFail) throwHttpException(result.error);
    return result.value.map((item) => ContainerItemResponseDto.from(item));
  }

  @Post()
  @ApiOperation({ summary: 'Add an item to a draft version' })
  @ApiCreatedResponse({ type: ContainerItemResponseDto })
  async addItem(
    @Param('versionId') versionId: string,
    @Body() dto: AddContainerItemRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ itemId: string }> {
    const result = await this.commandBus.execute<
      AddContainerItemCommand,
      Result<{ itemId: string }, ContainerDomainError>
    >(
      new AddContainerItemCommand(
        user.userId,
        versionId,
        dto.itemType,
        dto.itemId,
        dto.isRequired,
        dto.sectionLabel,
      ),
    );

    if (result.isFail) throwHttpException(result.error);
    return result.value;
  }

  @Patch(':itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update an item in a draft version' })
  @ApiNoContentResponse()
  async updateItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateContainerItemRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      UpdateContainerItemCommand,
      Result<void, ContainerDomainError>
    >(new UpdateContainerItemCommand(user.userId, itemId, dto.isRequired, dto.sectionLabel));

    if (result.isFail) throwHttpException(result.error);
  }

  @Delete(':itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an item from a draft version' })
  @ApiNoContentResponse()
  async removeItem(
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const result = await this.commandBus.execute<
      RemoveContainerItemCommand,
      Result<void, ContainerDomainError>
    >(new RemoveContainerItemCommand(user.userId, itemId));

    if (result.isFail) throwHttpException(result.error);
  }

  @Put('reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Reorder items within a draft version' })
  @ApiNoContentResponse()
  async reorder(
    @Param('versionId') versionId: string,
    @Body() dto: ReorderItemsRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const reorderItems = dto.orderedItemIds.map((id, index) => ({ id, position: index }));

    const result = await this.commandBus.execute<
      ReorderContainerItemsCommand,
      Result<void, ContainerDomainError>
    >(new ReorderContainerItemsCommand(user.userId, versionId, reorderItems));

    if (result.isFail) throwHttpException(result.error);
  }
}
