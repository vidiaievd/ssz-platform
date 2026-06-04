import { Module } from '@nestjs/common';
import { EntitlementModule } from '../../modules/entitlement/entitlement.module.js';
import { GroupEntitlementConsumer } from './group-entitlement.consumer.js';

@Module({
  imports: [EntitlementModule],
  providers: [GroupEntitlementConsumer],
})
export class GroupEntitlementModule {}
