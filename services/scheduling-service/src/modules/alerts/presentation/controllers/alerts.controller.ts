import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { AlertResponseDto } from '../dto/alerts.dto.js';

function toDto(row: {
  id: string; schoolId: string; kind: string; severity: string;
  entityType: string | null; entityId: string | null;
  status: string; occurredAt: Date; acknowledgedAt: Date | null;
  resolvedAt: Date | null; createdAt: Date;
}): AlertResponseDto {
  return {
    id: row.id,
    schoolId: row.schoolId,
    kind: row.kind,
    severity: row.severity,
    entityType: row.entityType,
    entityId: row.entityId,
    status: row.status,
    occurredAt: row.occurredAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

@ApiTags('Alerts')
@ApiBearerAuth()
@Controller('scheduling')
export class AlertsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('schools/:schoolId/alerts')
  @ApiOperation({ summary: 'List alerts for a school' })
  @ApiResponse({ status: 200, type: [AlertResponseDto] })
  @ApiQuery({ name: 'status', required: false, enum: ['raised', 'acknowledged', 'resolved'] })
  @ApiQuery({ name: 'kind', required: false })
  async list(
    @Param('schoolId') schoolId: string,
    @Query('status') status?: string,
    @Query('kind') kind?: string,
  ): Promise<AlertResponseDto[]> {
    const rows = await this.prisma.alert.findMany({
      where: {
        schoolId,
        ...(status && { status: status as any }),
        ...(kind && { kind: kind as any }),
      },
      orderBy: { occurredAt: 'desc' },
    });
    return rows.map(toDto);
  }

  @Post('alerts/:alertId/acknowledge')
  @HttpCode(204)
  @ApiOperation({ summary: 'Acknowledge an alert' })
  @ApiResponse({ status: 204 })
  async acknowledge(
    @Param('alertId') alertId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.prisma.alert.update({
      where: { id: alertId },
      data: { status: 'acknowledged', acknowledgedAt: new Date(), acknowledgedBy: user.sub },
    });
  }

  @Post('alerts/:alertId/resolve')
  @HttpCode(204)
  @ApiOperation({ summary: 'Resolve an alert' })
  @ApiResponse({ status: 204 })
  async resolve(
    @Param('alertId') alertId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.prisma.alert.update({
      where: { id: alertId },
      data: { status: 'resolved', resolvedAt: new Date(), resolvedBy: user.sub },
    });
  }
}
