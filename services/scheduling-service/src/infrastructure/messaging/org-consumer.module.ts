import { Module } from '@nestjs/common';
import { OrgConsumerService } from './org-consumer.service.js';
import { SlotsModule } from '../../modules/slots/slots.module.js';

@Module({
  imports: [SlotsModule],
  providers: [OrgConsumerService],
})
export class OrgConsumerModule {}
