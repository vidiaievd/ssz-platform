import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProfileResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  userId: string;

  @ApiProperty({ example: 'John Doe' })
  displayName: string;

  @ApiPropertyOptional({ example: 'John' })
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  lastName?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.jpg' })
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'Language enthusiast learning Ukrainian.' })
  bio?: string;

  @ApiProperty({ example: 'Europe/Kyiv' })
  timezone: string;

  @ApiProperty({ example: 'uk' })
  uiLocale: string;

  @ApiPropertyOptional({
    example: null,
    description: 'Guardian account ID (seam for minors — always null for current adults-only flow)',
    nullable: true,
  })
  guardianAccountId?: string;

  @ApiPropertyOptional({ example: '1995-06-15', description: 'Date of birth' })
  dateOfBirth?: Date;

  @ApiProperty({
    example: ['uk', 'en'],
    description: 'Language codes the user wants to learn (ISO 639-1)',
    type: [String],
  })
  languagesOfInterest: string[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ description: 'Whether the user has completed student profile setup' })
  hasStudentProfile: boolean;

  @ApiProperty({ description: 'Whether the user has completed tutor profile setup' })
  hasTutorProfile: boolean;

  @ApiProperty({ description: 'Whether the user has a teaching profile (teachers and tutors)' })
  hasTeachingProfile: boolean;
}
