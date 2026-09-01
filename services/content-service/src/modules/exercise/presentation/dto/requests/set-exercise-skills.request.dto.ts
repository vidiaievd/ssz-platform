import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsIn } from 'class-validator';
import { FOCUSES, SKILLS } from '@ssz/shared-kernel/skills';
import type { Focus, Skill } from '@ssz/shared-kernel/skills';

/**
 * Both axes are required together, and that is the point.
 *
 * One marker covers the pair (plan 55 §3.5), so a half-override is not a state the
 * database can hold. The editor sends back the derived focus unchanged when it only meant
 * to correct the skill — which is honest: from that moment the author owns both, and the
 * derivation stops speaking for either.
 */
export class SetExerciseSkillsRequestDto {
  @ApiProperty({
    isArray: true,
    enum: SKILLS,
    example: ['listening'],
    description:
      'The channels this exercise trains. An empty list is allowed and means the exercise ' +
      'should count towards no channel at all — a warm-up, deliberately excluded from the ' +
      'coverage report. To hand the exercise back to the derivation instead, DELETE this ' +
      'resource rather than sending an empty list.',
  })
  @IsArray()
  @ArrayUnique()
  @IsIn(SKILLS as readonly string[], { each: true })
  skills!: Skill[];

  @ApiProperty({ isArray: true, enum: FOCUSES, example: ['grammar'] })
  @IsArray()
  @ArrayUnique()
  @IsIn(FOCUSES as readonly string[], { each: true })
  focus!: Focus[];
}
