import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PreferencesController } from './preferences.controller';
import { PreferencesService } from './preferences.service';
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
  controllers: [PreferencesController],
  providers: [PreferencesService, ProfilesRepository, PrismaService],
})
export class PreferencesModule {}
