import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ExerciseRuleLink } from '../../../../grammar-rule/application/queries/get-exercise-rule-links/get-exercise-rule-links.handler.js';

/**
 * One grammar rule that practises this exercise.
 *
 * The pool is owned by the rule — this is the same row read from the other end, for an
 * author who is looking at the exercise and asking what it is training.
 */
export class ExerciseRuleLinkResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-...' })
  ruleId!: string;

  @ApiProperty({ example: 'Perfektum' })
  title!: string;

  @ApiProperty({ example: 'VERBS' })
  topic!: string;

  @ApiPropertyOptional({ example: 'Presens perfektum', nullable: true })
  subtopic!: string | null;

  @ApiProperty({ example: 'B1' })
  difficultyLevel!: string;

  @ApiProperty({ example: 1, description: 'How often the review queue picks this exercise' })
  weight!: number;

  @ApiProperty({ example: 0, description: 'Order within the rule’s pool' })
  position!: number;

  static from(link: ExerciseRuleLink): ExerciseRuleLinkResponseDto {
    const dto = new ExerciseRuleLinkResponseDto();
    dto.ruleId = link.ruleId;
    dto.title = link.title;
    dto.topic = link.topic;
    dto.subtopic = link.subtopic;
    dto.difficultyLevel = link.difficultyLevel;
    dto.weight = link.weight;
    dto.position = link.position;
    return dto;
  }
}
