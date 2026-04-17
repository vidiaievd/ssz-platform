import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';

export class UpdateUsageExampleRequestDto {
  @ApiPropertyOptional({ example: 'Takk for hjelpen!' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  exampleText?: string;

  @ApiPropertyOptional({ example: 'uuid-of-audio-file', nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.audioMediaId !== null)
  @IsUUID()
  audioMediaId?: string | null;

  @ApiPropertyOptional({ example: 'Used when thanking someone for help.', nullable: true })
  @IsOptional()
  @ValidateIf((o) => o.contextNote !== null)
  @IsString()
  @MaxLength(500)
  contextNote?: string | null;
}
