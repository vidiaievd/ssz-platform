import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { CatalogFilterQueryDto } from '../../../../../shared/discovery/presentation/dto/catalog-filter-query.dto.js';
import { GrammarTopic } from '../../../domain/value-objects/grammar-topic.vo.js';

export class GrammarRuleListQueryDto extends CatalogFilterQueryDto {
  @ApiPropertyOptional({ example: 'verbs', enum: GrammarTopic })
  @IsOptional()
  @IsEnum(GrammarTopic)
  topic?: GrammarTopic;
}
