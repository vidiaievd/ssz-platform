import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TutorsController } from './tutors.controller';
import { TutorsService } from './tutors.service';
import { ProfilesRepository } from '../profiles/profiles.repository';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        publicKey: configService.get<string>('jwt.publicKey'),
        verifyOptions: { algorithms: ['RS256'] },
      }),
    }),
  ],
  controllers: [TutorsController],
  providers: [TutorsService, ProfilesRepository, PrismaService],
  exports: [TutorsService],
})
export class TutorsModule {}
