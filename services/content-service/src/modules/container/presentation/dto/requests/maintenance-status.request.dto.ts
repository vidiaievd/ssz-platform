import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { MaintenanceStatus } from '../../../domain/value-objects/maintenance-status.vo.js';

/** The author's say on whether the course is still looked after (plan 90, phase 5, Q5). */
export class SetContainerMaintenanceStatusRequestDto {
  @ApiProperty({
    enum: MaintenanceStatus,
    example: MaintenanceStatus.UNMAINTAINED,
    description:
      '`unmaintained` stays in the catalogue with a badge; `obsolete` leaves the catalogue and takes no new enrolments (current learners carry on); `maintained` undoes either.',
  })
  @IsEnum(MaintenanceStatus)
  status!: MaintenanceStatus;
}
