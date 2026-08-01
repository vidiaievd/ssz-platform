import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class PronounceDto {
  @ApiProperty({ example: 'sykepleier', description: 'Word or short phrase to pronounce' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  text!: string;

  @ApiPropertyOptional({
    example: 'nb',
    description: 'BCP-47 language tag of the text. Defaults to Norwegian Bokmål.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  lang?: string;
}

export class PronounceResponseDto {
  @ApiProperty({
    example: 'http://localhost:9000/ssz-public/tts/no/6f1c….mp3',
    description: 'Public URL of the mp3 clip',
  })
  url!: string;

  @ApiProperty({
    example: true,
    description: 'False when this request is what synthesized the clip',
  })
  cached!: boolean;
}
