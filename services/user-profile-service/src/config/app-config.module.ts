import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration, { validate } from './configuration.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      // Load .env file automatically
      isGlobal: true,
      // validate runs first — throws on bad values before anything starts
      validate,
      // load typed config factory so ConfigService.get<Env>() works
      load: [configuration],
      // Cache the parsed result across the app
      cache: true,
    }),
  ],
})
export class AppConfigModule {}
