import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Who is claiming a submission, and for which school.
 *
 * Both fields are required in every real sense, and both are checked in the controller
 * rather than here — the same reason the queue scope is (see `ReviewQueueScopeDto`): the
 * global ValidationPipe answers 400 before any route pipe runs, and a review route that
 * was not told what it may touch is a 422 like every other one on this controller.
 */
export class ReviewLockRequestDto {
  @ApiProperty({ description: 'The school the caller is acting for — never optional' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  schoolId?: string;

  /**
   * Sent by the caller rather than read from a token: these routes are service-to-service
   * and the BFF has already established who the teacher is.
   */
  @ApiProperty({ description: 'The reviewer placing or lifting the marker' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  teacherId?: string;
}
