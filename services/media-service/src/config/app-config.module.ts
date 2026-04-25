import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration, { validate } from './configuration.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      load: [configuration],
      cache: true,
    }),
  ],
})
export class AppConfigModule {}
