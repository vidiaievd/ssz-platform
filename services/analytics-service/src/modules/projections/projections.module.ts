import { Module } from '@nestjs/common';
import { MembershipConsumer } from './consumers/membership.consumer.js';
import { UserDirectoryConsumer } from './consumers/user-directory.consumer.js';
import { ContainerDirectoryConsumer } from './consumers/container-directory.consumer.js';
import { GroupProjectionsConsumer } from './consumers/group-projections.consumer.js';
import { CourseOutlineService } from './course-outline.service.js';
import { ContentClient } from '../../infrastructure/http/content.client.js';

@Module({
  providers: [
    MembershipConsumer,
    UserDirectoryConsumer,
    ContainerDirectoryConsumer,
    GroupProjectionsConsumer,
    CourseOutlineService,
    ContentClient,
  ],
  // The group's progress endpoint (phase 2) fills a course in on first read.
  exports: [CourseOutlineService],
})
export class ProjectionsModule {}
