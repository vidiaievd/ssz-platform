import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class AcknowledgeAlertDto {
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class AlertResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() schoolId!: string;
  @ApiProperty() kind!: string;
  @ApiProperty() severity!: string;
  @ApiPropertyOptional() entityType!: string | null;
  @ApiPropertyOptional() entityId!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty() occurredAt!: string;
  @ApiPropertyOptional() acknowledgedAt!: string | null;
  @ApiPropertyOptional() resolvedAt!: string | null;
  @ApiProperty() createdAt!: string;
}
