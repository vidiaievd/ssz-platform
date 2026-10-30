import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

// A field left out stays as it is; null clears it back to the app's default
// (@IsOptional lets null through without the other checks).
export class UpdateStudentPreferencesRequestDto {
  @ApiPropertyOptional({
    description: 'Daily study goal in minutes (1–240), or null to clear',
    example: 15,
    nullable: true,
    type: Number,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  dailyGoalMin?: number | null;

  @ApiPropertyOptional({
    description:
      'ISO 639-1 translation language, or null to follow the interface language',
    example: 'uk',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @Length(2, 5)
  translationLanguage?: string | null;
}
