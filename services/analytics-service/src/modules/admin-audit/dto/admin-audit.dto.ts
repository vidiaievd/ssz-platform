import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { AdminAuditService } from '@ssz/contracts';
import { ADMIN_AUDIT_PAGE_DEFAULT, ADMIN_AUDIT_PAGE_MAX, ADMIN_AUDIT_SERVICES } from '../domain/admin-audit.js';

export class ListAdminAuditQueryDto {
  @ApiPropertyOptional({ enum: ADMIN_AUDIT_SERVICES, description: 'Service that made the change' })
  @IsOptional()
  @IsIn(ADMIN_AUDIT_SERVICES)
  service?: AdminAuditService;

  @ApiPropertyOptional({ description: 'Admin who acted (user id)', example: '3f1c2a4e-9b7d-4e1a-8c55-0d2f6a7b8c9d' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  actorId?: string;

  @ApiPropertyOptional({
    description: 'Kind of object changed: `admin` (auth), `workspace` / `user` / `plan` (subscription)',
    example: 'workspace',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetType?: string;

  @ApiPropertyOptional({
    description: 'Object id — schoolId for `workspace`, userId for `user` / `admin`, plan code for `plan`',
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  targetId?: string;

  @ApiPropertyOptional({ description: 'From this moment, inclusive (ISO 8601)', example: '2026-11-01T00:00:00Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ description: 'Up to this moment, exclusive (ISO 8601)', example: '2026-11-10T00:00:00Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @ApiPropertyOptional({ description: '`nextCursor` of the previous page' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  cursor?: string;

  @ApiPropertyOptional({ description: 'Page size', default: ADMIN_AUDIT_PAGE_DEFAULT, maximum: ADMIN_AUDIT_PAGE_MAX })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_AUDIT_PAGE_MAX)
  limit?: number;
}

export class AdminAuditEntryDto {
  @ApiProperty({ description: 'Event id = id of the row in the service\'s own `admin_audit`' })
  id!: string;

  @ApiProperty({ enum: ADMIN_AUDIT_SERVICES })
  service!: string;

  @ApiProperty({ description: 'When the change was committed (ISO 8601)' })
  occurredAt!: string;

  @ApiProperty({ nullable: true, type: String, description: 'Null when no person acted (auth `admin bootstrap`)' })
  actorId!: string | null;

  @ApiProperty({ nullable: true, type: String, enum: ['support', 'admin', 'super'] })
  actorLevel!: string | null;

  @ApiProperty({ example: 'subscription.assigned', description: '`<object>.<verb>`, owned by the service' })
  action!: string;

  @ApiProperty({ example: 'workspace' })
  targetType!: string;

  @ApiProperty()
  targetId!: string;

  @ApiProperty({ nullable: true, type: String })
  reason!: string | null;

  @ApiProperty({ nullable: true, type: Object, description: 'State before the change; null = did not exist' })
  before!: Record<string, unknown> | null;

  @ApiProperty({ nullable: true, type: Object, description: 'State after the change; null = no longer exists' })
  after!: Record<string, unknown> | null;
}

export class AdminAuditPageDto {
  @ApiProperty({ type: [AdminAuditEntryDto], description: 'Newest first' })
  items!: AdminAuditEntryDto[];

  @ApiProperty({ nullable: true, type: String, description: 'Pass as `cursor` for the next page; null = last page' })
  nextCursor!: string | null;
}
