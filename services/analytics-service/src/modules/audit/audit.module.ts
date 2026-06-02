import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { SchoolActivityConsumer } from './consumers/school-activity.consumer.js';
import { GetActivityHandler } from './queries/get-activity.handler.js';
import { ActivityController } from './controllers/activity.controller.js';

@Module({
  imports: [CqrsModule],
  controllers: [ActivityController],
  providers: [SchoolActivityConsumer, GetActivityHandler],
})
export class AuditModule {}
