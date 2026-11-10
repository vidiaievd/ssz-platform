import { ApiProperty } from '@nestjs/swagger';

const STATUSES = ['active', 'suspended', 'closed', 'purged'] as const;

/**
 * Where a school stands in its lifecycle (plan 90, phase 5), carried by every read a member's
 * screen draws from: `suspended` is read only until `closesAt`; `closed` is an archive (seen by
 * its owner only) until `purgeAt`.
 */
export class SchoolLifecycleFieldsDto {
  @ApiProperty({
    enum: STATUSES,
    example: 'active',
    description: '`active` — everything; `suspended` — read only; `closed` — archive, owner only',
  })
  status!: (typeof STATUSES)[number];

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'When a suspended school closes by itself' })
  closesAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'When a closed school is purged' })
  purgeAt!: Date | null;
}
