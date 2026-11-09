import { ApiProperty } from '@nestjs/swagger';

export class StudentPreferencesResponseDto {
  @ApiProperty({
    description:
      'Daily study goal in minutes; null — not chosen, the app uses its default',
    example: 15,
    nullable: true,
    type: Number,
  })
  dailyGoalMin!: number | null;

  @ApiProperty({
    description:
      'ISO 639-1 language word translations are shown in; null — follow the interface language',
    example: 'uk',
    nullable: true,
    type: String,
  })
  translationLanguage!: string | null;
}
