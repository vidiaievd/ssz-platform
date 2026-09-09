import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * A named list of submissions to approve at once.
 *
 * `schoolId` and `reviewerId` are required in every real sense and are checked in the
 * controller rather than here, for the reason `ReviewLockRequestDto` gives: the global
 * ValidationPipe answers 400 before any route pipe runs, and a review route that was not
 * told what it may touch is a 422 like every other one on this controller.
 */
export class BatchApproveRequestDto {
  @ApiProperty({ description: 'The school the caller is acting for — never optional' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  schoolId?: string;

  @ApiProperty({ description: 'The teacher whose name goes on every verdict in the list' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reviewerId?: string;

  /**
   * The submissions themselves — never a filter. The modal listed these learners by
   * name and it is that list which must be carried out (§5 of the contract).
   */
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  attemptIds!: string[];
}
