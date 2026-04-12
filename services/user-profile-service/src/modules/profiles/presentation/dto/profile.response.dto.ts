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
  locale: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
