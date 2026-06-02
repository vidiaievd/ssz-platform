import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { ReplayEventsQuery as ReplayEventsQueryClass } from './queries/replay-events.query.js';
import { ReplayEventsQuery as ReplayEventsQueryDto, ReplayEventsResponseDto } from './dto/replay-events.dto.js';

@ApiTags('event-archive')
@Controller('internal/events')
export class EventArchiveController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Replay archived events',
    description:
      'Returns domain events in ascending sequence order. Use nextSeq as fromSeq on subsequent requests to paginate. Internal endpoint — accessible only from the service network.',
  })
  @ApiResponse({ status: 200, type: ReplayEventsResponseDto })
  async replay(@Query() query: ReplayEventsQueryDto): Promise<ReplayEventsResponseDto> {
    const types = query.types
      ? query.types.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    return this.queryBus.execute(
      new ReplayEventsQueryClass(query.fromSeq ?? 0, types, query.limit ?? 100),
    );
  }
}
