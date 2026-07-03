import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { CanDoDescriptorEntity } from '../../domain/entities/can-do-descriptor.entity.js';
import { CanDoSkill } from '../../domain/value-objects/can-do-skill.vo.js';
import { CanDoScope } from '../../domain/value-objects/can-do-scope.vo.js';

export class CanDoLocalizationDto {
  @ApiProperty({ example: 'en' })
  @IsString()
  @IsNotEmpty()
  language!: string;

  @ApiProperty({ example: 'I can understand the main points of clear standard speech on familiar topics.' })
  @IsString()
  @IsNotEmpty()
  text!: string;
}

export class CreateCanDoDescriptorDto {
  @ApiProperty({ enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] })
  @IsEnum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])
  cefrLevel!: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

  @ApiProperty({ enum: CanDoSkill })
  @IsEnum(CanDoSkill)
  skill!: CanDoSkill;

  @ApiProperty({ enum: CanDoScope })
  @IsEnum(CanDoScope)
  scope!: CanDoScope;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsString()
  @IsOptional()
  ownerSchoolId?: string;

  @ApiPropertyOptional({ example: 'CEFR 2020' })
  @IsString()
  @IsOptional()
  source?: string;

  @ApiProperty({ type: [CanDoLocalizationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CanDoLocalizationDto)
  localizations!: CanDoLocalizationDto[];
}

export class CanDoDescriptorResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] })
  cefrLevel!: string;

  @ApiProperty({ enum: CanDoSkill })
  skill!: string;

  @ApiProperty({ enum: CanDoScope })
  scope!: string;

  @ApiPropertyOptional({ nullable: true })
  ownerSchoolId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  source!: string | null;

  @ApiProperty({ type: [CanDoLocalizationDto] })
  localizations!: CanDoLocalizationDto[];

  @ApiProperty()
  createdAt!: string;

  static fromEntity(e: CanDoDescriptorEntity): CanDoDescriptorResponse {
    return {
      id: e.id,
      cefrLevel: e.cefrLevel,
      skill: e.skill,
      scope: e.scope,
      ownerSchoolId: e.ownerSchoolId,
      source: e.source,
      localizations: e.localizations,
      createdAt: e.createdAt.toISOString(),
    };
  }
}
