import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { CandidateRankingService } from '../../application/services/candidate-ranking.service.js';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import {
  CreateSubRequestDto,
  AssignSubstituteDto,
  SubRequestResponseDto,
  CandidateDto,
  AssignmentResponseDto,
} from '../dto/substitutions.dto.js';

function toRequestDto(row: {
  id: string; schoolId: string; lessonId: string; absenceId: string | null;
  groupId: string; originalTeacherId: string;
  coverFrom: Date; coverTo: Date; urgency: string; status: string; createdAt: Date;
}): SubRequestResponseDto {
  return {
    id: row.id,
    schoolId: row.schoolId,
    lessonId: row.lessonId,
    absenceId: row.absenceId,
    groupId: row.groupId,
    originalTeacherId: row.originalTeacherId,
    coverFrom: row.coverFrom.toISOString().slice(0, 10),
    coverTo: row.coverTo.toISOString().slice(0, 10),
    urgency: row.urgency,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

@ApiTags('Substitutions')
@ApiBearerAuth()
@Controller('scheduling')
export class SubstitutionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ranking: CandidateRankingService,
  ) {}

  @Get('schools/:schoolId/substitutions')
  @ApiOperation({ summary: 'List substitute requests for a school' })
  @ApiResponse({ status: 200, type: [SubRequestResponseDto] })
  async list(@Param('schoolId') schoolId: string): Promise<SubRequestResponseDto[]> {
    const rows = await this.prisma.substituteRequest.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toRequestDto);
  }

  @Post('schools/:schoolId/substitutions')
  @ApiOperation({ summary: 'Create a substitute request manually' })
  @ApiResponse({ status: 201, type: SubRequestResponseDto })
  async create(
    @Param('schoolId') schoolId: string,
    @Body() body: CreateSubRequestDto,
  ): Promise<SubRequestResponseDto> {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: body.lessonId } });
    if (!lesson) throw new Error('Lesson not found');

    const now = new Date();
    const daysUntil = Math.floor((new Date(body.coverFrom).getTime() - now.getTime()) / 86_400_000);
    const urgency = daysUntil <= 0 ? 'today' : daysUntil <= 3 ? 'upcoming' : 'open';

    const row = await this.prisma.substituteRequest.create({
      data: {
        schoolId,
        lessonId: body.lessonId,
        absenceId: body.absenceId ?? null,
        groupId: lesson.groupId,
        originalTeacherId: lesson.teacherId,
        coverFrom: new Date(body.coverFrom),
        coverTo: new Date(body.coverTo),
        urgency: urgency as any,
        status: 'open',
      },
    });
    return toRequestDto(row);
  }

  @Get('substitutions/:requestId/candidates')
  @ApiOperation({ summary: 'Get ranked candidates for a substitute request' })
  @ApiResponse({ status: 200, type: [CandidateDto] })
  async candidates(@Param('requestId') requestId: string): Promise<CandidateDto[]> {
    return this.ranking.rankCandidates(requestId);
  }

  @Post('substitutions/:requestId/assign')
  @ApiOperation({ summary: 'Assign a substitute teacher to a request' })
  @ApiResponse({ status: 201, type: AssignmentResponseDto })
  async assign(
    @Param('requestId') requestId: string,
    @Body() body: AssignSubstituteDto,
  ): Promise<AssignmentResponseDto> {
    const request = await this.prisma.substituteRequest.findUniqueOrThrow({
      where: { id: requestId },
    });

    // Get fit score by ranking
    const candidates = await this.ranking.rankCandidates(requestId);
    const candidate = candidates.find((c) => c.teacherId === body.substituteTeacherId);
    const fitScore = candidate?.fitScore ?? 0;

    const assignment = await this.prisma.substituteAssignment.create({
      data: {
        requestId,
        originalTeacherId: request.originalTeacherId,
        substituteTeacherId: body.substituteTeacherId,
        lessonId: request.lessonId,
        coverFrom: request.coverFrom,
        coverTo: request.coverTo,
        fitScore,
        status: 'proposed',
      },
    });

    await this.prisma.substituteRequest.update({
      where: { id: requestId },
      data: { status: 'closed' },
    });

    return {
      id: assignment.id,
      requestId: assignment.requestId,
      substituteTeacherId: assignment.substituteTeacherId,
      originalTeacherId: assignment.originalTeacherId,
      fitScore: assignment.fitScore,
      status: assignment.status,
    };
  }

  @Post('substitutions/:requestId/cancel')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cancel a substitute request' })
  @ApiResponse({ status: 204 })
  async cancel(@Param('requestId') requestId: string): Promise<void> {
    await this.prisma.substituteRequest.update({
      where: { id: requestId },
      data: { status: 'cancelled' },
    });
  }
}
