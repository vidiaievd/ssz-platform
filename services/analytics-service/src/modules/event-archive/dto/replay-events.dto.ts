import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ReplayEventsQuery {
  @ApiPropertyOptional({ description: 'Return events with sequence > fromSeq (exclusive). Omit to start from beginning.', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fromSeq?: number = 0;

  @ApiPropertyOptional({ description: 'Comma-separated list of eventTypes to filter by.' })
  @IsOptional()
  @IsString()
  types?: string;

  @ApiPropertyOptional({ description: 'Maximum number of events to return.', default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 100;
}

export class ArchivedEventDto {
  @ApiProperty() id!: string;
  @ApiProperty() sequence!: string;
  @ApiProperty() eventId!: string;
  @ApiProperty() eventType!: string;
  @ApiProperty() exchange!: string;
  @ApiProperty() routingKey!: string;
  @ApiProperty() source!: string;
  @ApiProperty() payload!: unknown;
  @ApiProperty() occurredAt!: string;
  @ApiProperty() archivedAt!: string;
}

export class ReplayEventsResponseDto {
  @ApiProperty({ type: [ArchivedEventDto] }) events!: ArchivedEventDto[];
  @ApiPropertyOptional({ description: 'Sequence of the last returned event. Pass as fromSeq for the next page. Null when no more events.' })
  nextSeq!: string | null;
  @ApiProperty() total!: number;
}
