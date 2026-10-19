import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class MoveContainerItemRequestDto {
  @ApiProperty({
    example: 'uuid-of-target-module',
    description: 'The container whose draft receives the row — another module of the course.',
  })
  @IsUUID()
  targetContainerId: string;

  @ApiPropertyOptional({
    example: 'uuid-of-target-section',
    nullable: true,
    description:
      'A section of the target draft. Null or absent places the row outside any section.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  targetSectionId?: string | null;
}
