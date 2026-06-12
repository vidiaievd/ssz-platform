import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ActivityItemDto {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ example: 'Maria Singh' })
  who?: string | null;

  @ApiProperty({ example: 'published lesson' })
  what!: string;

  @ApiPropertyOptional({ example: 'A2 · Restaurant role-play' })
  target?: string | null;

  @ApiProperty({ example: '2026-06-02T16:00:00.000Z' })
  occurredAt!: string;

  @ApiProperty({ enum: ['people', 'content', 'review', 'milestone'] })
  tag!: string;
}

export class GetActivityResponseDto {
  @ApiProperty({ type: [ActivityItemDto] })
  items!: ActivityItemDto[];

  @ApiPropertyOptional({ nullable: true })
  nextCursor!: string | null;
}
