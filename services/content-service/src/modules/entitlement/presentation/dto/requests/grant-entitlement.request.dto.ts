import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { EntitlementType } from '../../../domain/value-objects/entitlement-type.vo.js';

export class GrantEntitlementRequestDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: EntitlementType, example: EntitlementType.MANUAL })
  @IsEnum(EntitlementType)
  entitlementType!: EntitlementType;

  @ApiPropertyOptional({ type: String, example: '2027-01-01T00:00:00.000Z' })
  @IsOptional()
  @ValidateIf((o: GrantEntitlementRequestDto) => o.expiresAt != null)
  @IsISO8601()
  expiresAt?: string;

  @ApiPropertyOptional({ example: 'invoice-12345', maxLength: 200 })
  @IsOptional()
  @ValidateIf((o: GrantEntitlementRequestDto) => o.sourceReference != null)
  @IsString()
  @MaxLength(200)
  sourceReference?: string;

  @ApiPropertyOptional({ example: { invoiceId: '123' } })
  @IsOptional()
  @ValidateIf((o: GrantEntitlementRequestDto) => o.metadata != null)
  @IsObject()
  metadata?: Record<string, unknown>;
}
