import { ApiProperty } from '@nestjs/swagger';
import { FOCUS_SOURCES, FOCUSES, FORMS, SKILL_SOURCES, SKILLS } from '@ssz/shared-kernel/skills';
import type { DerivedProfile } from '@ssz/shared-kernel/skills';

/**
 * What an exercise trains, and where that answer came from.
 *
 * The two `source` fields are not decoration. A strip that shows an axis without saying
 * whether the template guessed it or the author declared it makes overriding feel like
 * guesswork, and an author who cannot tell the difference will either never correct a
 * wrong value or overwrite a right one.
 */
export class ExerciseAxesResponseDto {
  @ApiProperty({ isArray: true, enum: SKILLS, example: ['reading'] })
  skills!: string[];

  @ApiProperty({ isArray: true, enum: FOCUSES, example: ['grammar'] })
  focus!: string[];

  @ApiProperty({
    enum: FORMS,
    example: 'bank',
    description:
      'How the answer is produced. `mixed` means the document decides and this one did ' +
      'not say; `unknown` means no rule covers this template.',
  })
  form!: string;

  @ApiProperty({
    enum: SKILL_SOURCES,
    example: 'template',
    description:
      'Which rung produced the skills: `override` (the author said so), `placement` ' +
      '(where the exercise stands in its lesson), `document` (a flag inside it) or ' +
      '`template`.',
  })
  skillSource!: string;

  @ApiProperty({
    enum: FOCUS_SOURCES,
    example: 'atoms',
    description:
      'Which rung produced the focus. Its chain is shorter — override, the atom graph, ' +
      'then the template — because neither placement nor the document says anything ' +
      'about the subject.',
  })
  focusSource!: string;

  static from(profile: DerivedProfile): ExerciseAxesResponseDto {
    const dto = new ExerciseAxesResponseDto();
    dto.skills = profile.skills;
    dto.focus = profile.focus;
    dto.form = profile.form;
    dto.skillSource = profile.skillSource;
    dto.focusSource = profile.focusSource;
    return dto;
  }
}
