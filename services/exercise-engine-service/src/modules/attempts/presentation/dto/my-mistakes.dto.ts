import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MyMistakeDto {
  @ApiProperty({ format: 'uuid', description: 'The failing attempt.' })
  attemptId!: string;

  @ApiProperty({ format: 'uuid' })
  exerciseId!: string;

  @ApiProperty({ example: 'word_bank_gap_fill', description: 'The exercise template — for the row icon.' })
  templateCode!: string;

  @ApiProperty({ example: 'nb' })
  targetLanguage!: string;

  @ApiProperty({ format: 'uuid', description: 'The course the attempt was made in.' })
  containerId!: string;

  @ApiPropertyOptional({
    nullable: true,
    format: 'uuid',
    description: 'The unit the exercise sits in; null when it is in no unit any more.',
  })
  unitId!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Familien', description: 'Title as it read at start.' })
  exerciseTitle!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 40 })
  score!: number | null;

  @ApiProperty({ example: '2026-10-27T18:12:00.000Z', description: 'When the failing answer was scored.' })
  attemptedAt!: string;
}

export class MyMistakesResponseDto {
  @ApiProperty({ type: [MyMistakeDto], description: 'Newest mistake first.' })
  items!: MyMistakeDto[];

  @ApiProperty({ example: 7, description: 'Every exercise with an uncorrected mistake, not only this page.' })
  total!: number;
}
