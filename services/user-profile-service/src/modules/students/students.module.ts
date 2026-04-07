import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
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
  controllers: [StudentsController],
  providers: [StudentsService, ProfilesRepository, PrismaService],
  exports: [StudentsService],
})
export class StudentsModule {}
