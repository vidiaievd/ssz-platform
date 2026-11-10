import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** A school's student seats (plan 90, phase 4). */
export class SeatUsageResponseDto {
  @ApiProperty({ example: 87, description: 'Active learners on the roster' })
  used: number;

  @ApiProperty({ type: Number, nullable: true, example: 100, description: 'Seats in the plan; null = no limit' })
  limit: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 110,
    description: 'limit + ceil(10 % of limit): beyond it new learners are refused; null = no limit',
  })
  ceiling: number | null;

  @ApiProperty({
    enum: ['ok', 'warning', 'full'],
    description: 'ok — within the limit; warning — over the limit, under the ceiling; full — at the ceiling',
  })
  state: string;
}

/** Answer of an action that put a learner on the roster. */
export class SeatsResultResponseDto {
  @ApiPropertyOptional({
    type: SeatUsageResponseDto,
    nullable: true,
    description: 'Seats after the learner joined; null when no learner took a seat or the limit could not be read',
  })
  seats: SeatUsageResponseDto | null;
}

/** Body of 409 SEATS_EXHAUSTED. */
export class SeatsExhaustedErrorDto {
  @ApiProperty({
    example: {
      code: 'SEATS_EXHAUSTED',
      message: 'School … has no student seats left (110 / 100)',
      seats: { used: 110, limit: 100, ceiling: 110, state: 'full' },
    },
  })
  error: { code: 'SEATS_EXHAUSTED'; message: string; seats: SeatUsageResponseDto };
}
