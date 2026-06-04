import { Module } from '@nestjs/common';
import { MembershipConsumer } from './consumers/membership.consumer.js';
import { UserDirectoryConsumer } from './consumers/user-directory.consumer.js';
import { ContainerDirectoryConsumer } from './consumers/container-directory.consumer.js';
import { GroupProjectionsConsumer } from './consumers/group-projections.consumer.js';

@Module({
  providers: [MembershipConsumer, UserDirectoryConsumer, ContainerDirectoryConsumer, GroupProjectionsConsumer],
})
export class ProjectionsModule {}
