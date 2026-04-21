import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard.js';
import type { Result } from '../../../../shared/kernel/result.js';
import type { ExerciseTemplateEntity } from '../../domain/entities/exercise-template.entity.js';
import type { ExerciseTemplateDomainError } from '../../domain/exceptions/exercise-template-domain.exceptions.js';
import { GetExerciseTemplatesQuery } from '../../application/queries/get-exercise-templates/get-exercise-templates.query.js';
import { GetExerciseTemplateQuery } from '../../application/queries/get-exercise-template/get-exercise-template.query.js';
import { ExerciseTemplateResponseDto } from '../dto/responses/exercise-template.response.dto.js';
import { throwHttpException } from '../utils/domain-error.mapper.js';

@ApiTags('Exercise Templates')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('exercise-templates')
export class ExerciseTemplateController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({ summary: 'List all exercise templates' })
  @ApiOkResponse({ type: ExerciseTemplateResponseDto, isArray: true })
  async findAll(@Query('onlyActive') onlyActive?: string): Promise<ExerciseTemplateResponseDto[]> {
    const templates = await this.queryBus.execute<
      GetExerciseTemplatesQuery,
      ExerciseTemplateEntity[]
    >(new GetExerciseTemplatesQuery(onlyActive === 'true'));

    return templates.map((t) => ExerciseTemplateResponseDto.from(t));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an exercise template by ID' })
  @ApiOkResponse({ type: ExerciseTemplateResponseDto })
  async findOne(@Param('id') id: string): Promise<ExerciseTemplateResponseDto> {
    const result = await this.queryBus.execute<
      GetExerciseTemplateQuery,
      Result<ExerciseTemplateEntity, ExerciseTemplateDomainError>
    >(new GetExerciseTemplateQuery(id));

    if (result.isFail) throwHttpException(result.error);
    return ExerciseTemplateResponseDto.from(result.value);
  }
}
