import { Module } from '@nestjs/common';
import { OrgConsumerService } from './org-consumer.service.js';
import { SchoolLifecycleConsumer } from './school-lifecycle.consumer.js';
import { SlotsModule } from '../../modules/slots/slots.module.js';

@Module({
  imports: [SlotsModule],
  providers: [OrgConsumerService, SchoolLifecycleConsumer],
})
export class OrgConsumerModule {}
