import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ADMIN_SCHOOL_STATUSES, type AdminSchoolStatus } from '../../admin-schools/domain/admin-school.js';

export class SchoolTransitionRequestDto {
  @ApiProperty({ description: 'Why — kept in the admin trail; never shown to the school', maxLength: 500 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class SchoolLifecycleDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ADMIN_SCHOOL_STATUSES }) status!: AdminSchoolStatus;
  @ApiProperty({ type: Date, nullable: true, format: 'date-time' }) statusChangedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true, description: "The admin's reason for the current status" })
  statusReason!: string | null;
  @ApiProperty({ type: Date, nullable: true, format: 'date-time', description: 'When a suspended school closes by itself' })
  closesAt!: Date | null;
  @ApiProperty({
    type: Date,
    nullable: true,
    format: 'date-time',
    description: 'When a closed school is purged; now or earlier = an early purge is waiting for the timer',
  })
  purgeAt!: Date | null;
}
