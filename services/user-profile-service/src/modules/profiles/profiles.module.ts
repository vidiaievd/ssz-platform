import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { ProfilesRepository } from './profiles.repository';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Module({
  imports: [
    // JwtModule is configured with the RSA public key for token verification.
    // signOptions are irrelevant here — this service only verifies, never signs.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        publicKey: configService.get<string>('jwt.publicKey'),
        verifyOptions: {
          algorithms: ['RS256'],
        },
      }),
    }),
  ],
  controllers: [ProfilesController],
  providers: [ProfilesService, ProfilesRepository, PrismaService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
