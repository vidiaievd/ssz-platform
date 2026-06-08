import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  Min,
  Max,
  IsArray,
  ValidateNested,
  IsString,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../../../../infrastructure/auth/jwt-verifier.service.js';
import { ListSchoolTeachersQuery } from '../../application/queries/list-school-teachers/list-school-teachers.query.js';
import type { SchoolTeacherDto } from '../../application/dto/school.dto.js';
import { UpdateTeacherAttrsCommand } from '../../application/commands/update-teacher-attrs/update-teacher-attrs.command.js';

class AvailabilityWindowDto {
  @ApiProperty({ example: 1, description: '1=Mon … 7=Sun' })
  @IsInt() @Min(1) @Max(7)
  weekday!: number;

  @ApiProperty({ example: '09:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  start!: string;

  @ApiProperty({ example: '17:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  end!: string;
}

class UpdateTeacherAttrsRequestDto {
  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  maxWeeklyHours?: number | null;

  @ApiPropertyOptional({ type: [AvailabilityWindowDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AvailabilityWindowDto)
  availability?: AvailabilityWindowDto[] | null;

  @ApiPropertyOptional({ enum: ['full', 'part', 'contract'] })
  @IsOptional()
  @IsEnum(['full', 'part', 'contract'])
  employmentType?: 'full' | 'part' | 'contract' | null;

  @ApiPropertyOptional({ enum: ['active', 'invited', 'inactive'] })
  @IsOptional()
  @IsEnum(['active', 'invited', 'inactive'])
  status?: 'active' | 'invited' | 'inactive';
}

class SchoolTeacherResponseDto {
  @ApiProperty() userId!: string;
  @ApiPropertyOptional() maxWeeklyHours?: number | null;
  @ApiProperty({ type: [AvailabilityWindowDto] }) availability!: AvailabilityWindowDto[];
  @ApiPropertyOptional({ enum: ['full', 'part', 'contract'] }) employmentType?: string | null;
  @ApiProperty({ enum: ['active', 'invited', 'inactive'], default: 'active' }) status!: string;
}

@ApiTags('School Teachers')
@ApiBearerAuth('JWT')
@Controller('schools/:schoolId/teachers')
export class SchoolTeachersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all TEACHER members with workload/availability (any school member)' })
  @ApiOkResponse({ type: [SchoolTeacherResponseDto] })
  async listTeachers(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
  ): Promise<SchoolTeacherDto[]> {
    return this.queryBus.execute(new ListSchoolTeachersQuery(user.sub, schoolId));
  }

  @Patch(':userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Update teacher workload/availability/employment (owner/admin only)' })
  @ApiNoContentResponse()
  async updateTeacherAttrs(
    @CurrentUser() user: JwtPayload,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateTeacherAttrsRequestDto,
  ): Promise<void> {
    await this.commandBus.execute(
      new UpdateTeacherAttrsCommand(
        user.sub,
        schoolId,
        userId,
        dto.maxWeeklyHours,
        dto.availability,
        dto.employmentType,
        dto.status,
      ),
    );
  }
}
