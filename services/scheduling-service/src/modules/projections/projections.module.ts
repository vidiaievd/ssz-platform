import { Module } from '@nestjs/common';
import { SchoolMembershipConsumer } from './school-membership.consumer.js';

@Module({ providers: [SchoolMembershipConsumer] })
export class ProjectionsModule {}
