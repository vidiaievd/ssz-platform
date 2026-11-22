import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class SchoolUserLookupRequestDto {
  @ApiProperty({ example: 'learner@example.com', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class SchoolUserLookupResponseDto {
  @ApiProperty({ description: 'Whether an account has this address' })
  found!: boolean;

  @ApiPropertyOptional({ format: 'uuid', description: 'Only when found' })
  userId?: string;

  @ApiPropertyOptional({ nullable: true, type: String, description: 'Profile name, only when found' })
  displayName?: string | null;

  @ApiPropertyOptional({ description: 'The account is a learner (role `student`)' })
  isStudent?: boolean;

  @ApiPropertyOptional({ description: 'The account is a teacher (role `teacher`)' })
  isTeacher?: boolean;
}
