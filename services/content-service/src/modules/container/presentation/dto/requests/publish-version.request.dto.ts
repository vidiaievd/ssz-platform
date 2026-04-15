import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PublishVersionRequestDto {
  @ApiPropertyOptional({ example: 'Added 5 new exercises.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  changelog?: string;

  @ApiPropertyOptional({
    example: 30,
    description: 'Days until the currently published version is deprecated (sunset period)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  deprecationDays?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether to auto-generate a slug from the container title if none exists',
  })
  @IsOptional()
  @IsBoolean()
  generateSlug?: boolean;
}
