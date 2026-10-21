import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, ValidateIf } from 'class-validator';
import type { AiRegion } from '../../registry/domain/registry.types.js';

const REGIONS: AiRegion[] = ['eu', 'us', 'global', 'local'];

export class PutPayerPolicyDto {
  @ApiProperty({ example: true, description: 'False refuses every agent for this payer (refused_policy / ai_disabled)' })
  @IsBoolean()
  aiEnabled!: boolean;

  @ApiProperty({
    type: [String],
    enum: REGIONS,
    nullable: true,
    example: ['eu', 'local'],
    description:
      "Null = any region. Otherwise only models whose provider's region is listed are called; matched literally — " +
      '`global` is a region of its own, and a self-hosted model needs `local`',
  })
  @ValidateIf((_o, v) => v !== null)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(REGIONS.length)
  @IsIn(REGIONS, { each: true })
  allowedRegions!: AiRegion[] | null;
}

export class PayerPolicyResponseDto {
  @ApiProperty({ enum: ['workspace', 'user'], example: 'workspace' }) payerType!: string;
  @ApiProperty({ example: '6f1c2b0e-8a7d-4c1e-9d0a-1b2c3d4e5f60' }) payerId!: string;
  @ApiProperty({ example: true }) aiEnabled!: boolean;

  @ApiProperty({ type: [String], enum: REGIONS, nullable: true, example: ['eu', 'local'], description: 'Null = any region' })
  allowedRegions!: string[] | null;

  @ApiProperty({ example: true, description: 'False when nothing is stored and the default (on, any region) applies' })
  stored!: boolean;

  @ApiProperty({ type: String, nullable: true, description: 'Who wrote the policy; null when not stored' })
  updatedBy!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  updatedAt!: Date | null;
}
