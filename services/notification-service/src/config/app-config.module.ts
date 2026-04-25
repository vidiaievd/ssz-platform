import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration, { validate } from './configuration.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
    }),
  ],
})
export class AppConfigModule {}
