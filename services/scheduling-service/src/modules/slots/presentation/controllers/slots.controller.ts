import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { SlotInputDto, ReplaceSlotsBodyDto, SlotResponseDto } from '../dto/slot.dto.js';
import { CreateSlotCommand } from '../../application/commands/create-slot/create-slot.command.js';
import { DeleteSlotCommand } from '../../application/commands/delete-slot/delete-slot.command.js';
import { ReplaceSlotsCommand } from '../../application/commands/replace-slots/replace-slots.command.js';
import { ListSlotsQuery } from '../../application/queries/list-slots/list-slots.query.js';
import type { Slot } from '../../domain/entities/slot.entity.js';

function toDto(slot: Slot): SlotResponseDto {
  return {
    id: slot.id,
    groupId: slot.groupId,
    schoolId: slot.schoolId,
    weekday: slot.weekday,
    startTime: slot.startTime,
    endTime: slot.endTime,
    room: slot.room,
    createdAt: slot.createdAt.toISOString(),
  };
}

@ApiTags('Slots')
@ApiBearerAuth()
@Controller('scheduling/schools/:schoolId/groups/:groupId')
export class SlotsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get('slots')
  @ApiOperation({ summary: 'List slots for a group' })
  @ApiResponse({ status: 200, type: [SlotResponseDto] })
  async list(
    @Param('groupId') groupId: string,
  ): Promise<SlotResponseDto[]> {
    const slots = await this.queryBus.execute<ListSlotsQuery, Slot[]>(new ListSlotsQuery(groupId));
    return slots.map(toDto);
  }

  @Put('slots')
  @ApiOperation({ summary: 'Replace all slots for a group and regenerate lessons' })
  @ApiResponse({ status: 200, type: [SlotResponseDto] })
  async replace(
    @Param('schoolId') schoolId: string,
    @Param('groupId') groupId: string,
    @Body() body: ReplaceSlotsBodyDto,
  ): Promise<SlotResponseDto[]> {
    const slots = await this.commandBus.execute<ReplaceSlotsCommand, Slot[]>(
      new ReplaceSlotsCommand(groupId, schoolId, body.slots),
    );
    return slots.map(toDto);
  }

  @Post('slots')
  @ApiOperation({ summary: 'Add a single slot to a group' })
  @ApiResponse({ status: 201, type: SlotResponseDto })
  async create(
    @Param('schoolId') schoolId: string,
    @Param('groupId') groupId: string,
    @Body() body: SlotInputDto,
  ): Promise<SlotResponseDto> {
    const slot = await this.commandBus.execute<CreateSlotCommand, Slot>(
      new CreateSlotCommand(groupId, schoolId, body.weekday, body.startTime, body.endTime, body.room ?? null),
    );
    return toDto(slot);
  }

  @Delete('slots/:slotId')
  @ApiOperation({ summary: 'Delete a single slot' })
  @ApiResponse({ status: 204 })
  async remove(
    @Param('slotId') slotId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.commandBus.execute(new DeleteSlotCommand(slotId, user.sub));
  }
}
