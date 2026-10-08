import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID, IsOptional, IsString, MaxLength } from 'class-validator';

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

export class PronounceClipDto extends PronounceDto {
  @ApiPropertyOptional({
    example: '0f8fad5b-d9cb-469f-a165-70867728950e',
    description: 'Exercise the clip is for; stored on the asset as its entity id',
  })
  @IsOptional()
  @IsUUID()
  exerciseId?: string;
}

export class PronounceClipResponseDto {
  @ApiProperty({ description: 'Asset id to put in the exercise document; READY once processing ends' })
  assetId!: string;

  @ApiProperty({ example: 'no_NO-talesyntese-medium', description: 'Piper voice that spoke the clip' })
  voice!: string;
}
