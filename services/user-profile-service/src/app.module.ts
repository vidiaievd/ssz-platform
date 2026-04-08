import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppConfigModule } from './config/app-config.module';

@Module({
  imports: [AppConfigModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
