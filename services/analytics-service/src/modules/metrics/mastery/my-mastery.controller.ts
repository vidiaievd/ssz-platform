import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../infrastructure/auth/jwt-verifier.service.js';
import { MasteryProfileReader, type MasteryProfile } from './mastery-profile.reader.js';

class MasteryVerdictDto {
  @ApiProperty({ example: 'writing' }) skill!: string;
  @ApiProperty({ example: 'grammar' }) focus!: string;
  @ApiProperty({ description: 'Weighted success rate, 0..1' }) successRateEwma!: number;

  @ApiProperty({
    enum: ['forgets', 'never-knew', 'watch'],
    nullable: true,
    description: 'Why it is weak; null when memory was never observed',
  })
  reason!: 'forgets' | 'never-knew' | 'watch' | null;

  @ApiProperty({ type: Number, nullable: true }) meanStability!: number | null;
  @ApiProperty({ type: Number, nullable: true }) medianSecondsPerItem!: number | null;
  @ApiProperty() attempts!: number;
  @ApiProperty() weightedSample!: number;
  @ApiProperty({ example: '2026-10-24T10:00:00.000Z' }) lastAttemptAt!: string;
}

class MasteryUncertainDto {
  @ApiProperty({ example: 'listening' }) skill!: string;
  @ApiProperty({ example: 'vocabulary' }) focus!: string;
  @ApiProperty({ enum: ['insufficient_data'] }) status!: 'insufficient_data';
  @ApiProperty() attempts!: number;
  @ApiProperty() weightedSample!: number;
  @ApiProperty({ description: 'Evidence still needed before a verdict' }) shortfall!: number;
}

class MyMasteryResponseDto {
  @ApiProperty({ format: 'uuid' }) userId!: string;
  @ApiProperty({ type: String, nullable: true }) courseId!: string | null;

  @ApiProperty({ description: 'Below this much evidence the profile refuses to judge' })
  minWeightedSample!: number;

  @ApiProperty({ type: [MasteryVerdictDto], description: 'Weakest first; only cells that cleared the bar' })
  weakest!: MasteryVerdictDto[];

  @ApiProperty({ type: [MasteryUncertainDto], description: 'Attempted, but too little to judge' })
  insufficient!: MasteryUncertainDto[];
}

/**
 * The learner's own skill profile — the «Worth working on» card of the mobile «Today»
 * screen (VoxOrd mobile redesign 02, step 4), which has no BFF to reach the internal route.
 *
 * The same answer as `internal/mastery/:userId`, from the same reader; the learner is the
 * token's, and there is no parameter that could name anyone else.
 */
@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics/mastery')
export class MyMasteryController {
  constructor(private readonly reader: MasteryProfileReader) {}

  @Get('me')
  @ApiOperation({ summary: 'What I am weak at, and what there is too little evidence to judge' })
  @ApiQuery({ name: 'courseId', required: false, description: 'Narrow to one course' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'How many verdicts to return' })
  @ApiOkResponse({ type: MyMasteryResponseDto })
  @ApiUnauthorizedResponse({ description: 'No or invalid token' })
  async mine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('courseId') courseId?: string,
    @Query('limit') limit?: string,
  ): Promise<MasteryProfile> {
    return this.reader.read(user.userId, courseId, limit);
  }
}
