import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminUsageTokensDto {
  @ApiProperty({ example: 120000 }) input!: number;
  @ApiProperty({ example: 30000 }) output!: number;
  @ApiProperty({ example: 0 }) cacheRead!: number;
  @ApiProperty({ example: 0 }) cacheWrite!: number;
}

export class AdminUsageFiguresDto {
  @ApiProperty({ description: 'Model calls, every outcome', example: 412 })
  calls!: number;

  @ApiProperty({ description: 'Calls the model had no price for — they add nothing to `credits`', example: 3 })
  unpricedCalls!: number;

  @ApiProperty({ type: AdminUsageTokensDto })
  tokens!: AdminUsageTokensDto;

  @ApiProperty({ description: 'Decimal string, six places', example: '184.250000' })
  credits!: string;
}

/** One row of the answer; which key fields are present depends on `groupBy`. */
export class AdminUsageItemDto extends AdminUsageFiguresDto {
  @ApiPropertyOptional({ description: '`groupBy=capability`', example: 'review_draft' })
  capability?: string;

  @ApiPropertyOptional({ description: '`groupBy=payer`', enum: ['workspace', 'user', 'platform'] })
  payerType?: string;

  @ApiPropertyOptional({ description: '`groupBy=payer`: school id, learner id, or `platform`', example: '0f3c…' })
  payerId?: string;

  @ApiPropertyOptional({ description: '`groupBy=week`: ISO week', example: '2026-W46' })
  week?: string;

  @ApiPropertyOptional({ description: "`groupBy=week`: the week's first day inside the range", example: '2026-11-09' })
  from?: string;

  @ApiPropertyOptional({ description: "`groupBy=week`: the week's last day inside the range", example: '2026-11-14' })
  to?: string;
}

export class AdminUsageOthersDto extends AdminUsageFiguresDto {
  @ApiProperty({ description: 'Payers below the top N', example: 37 })
  payers!: number;
}

export class AdminUsageDto {
  @ApiProperty({ example: '2026-10-16' }) from!: string;
  @ApiProperty({ example: '2026-11-14' }) to!: string;
  @ApiProperty({ enum: ['capability', 'payer', 'week'] }) groupBy!: string;

  @ApiProperty({ type: String, nullable: true, enum: ['workspace', 'user', 'platform'], description: 'null = all' })
  payerType!: string | null;

  @ApiProperty({ type: AdminUsageFiguresDto, description: 'The whole range after the `payerType` filter' })
  total!: AdminUsageFiguresDto;

  @ApiProperty({
    type: [AdminUsageItemDto],
    description:
      '`capability` — most credits first; `payer` — top `limit` by credits (ties by calls, then type and id); ' +
      '`week` — every ISO week the range touches, in order, empty ones as zeros',
  })
  items!: AdminUsageItemDto[];

  @ApiPropertyOptional({ description: '`groupBy=payer`: payers that spent anything in the range', example: 57 })
  payers?: number;

  @ApiPropertyOptional({
    type: AdminUsageOthersDto,
    nullable: true,
    description: '`groupBy=payer`: everyone below the top N folded; null when the top holds them all',
  })
  others?: AdminUsageOthersDto | null;
}
