import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProfileType } from '@prisma/client';

export class ProfileResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-...' })
  id: string;

  @ApiProperty({ example: 'a1b2c3d4-...' })
  userId: string;

  @ApiProperty({ example: 'johndoe' })
  displayName: string;

  @ApiPropertyOptional({ example: 'John' })
  firstName: string | null;

  @ApiPropertyOptional({ example: 'Doe' })
  lastName: string | null;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/avatar.jpg' })
  avatarUrl: string | null;

  @ApiPropertyOptional({ example: 'Passionate learner' })
  bio: string | null;

  @ApiProperty({ example: 'Europe/Kyiv' })
  timezone: string;

  @ApiProperty({ example: 'uk' })
  locale: string;

  @ApiProperty({ enum: ProfileType, example: ProfileType.STUDENT })
  profileType: ProfileType;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
