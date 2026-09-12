import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CourseAnalyticsController } from './controllers/course-analytics.controller.js';
import { GetCourseResultHandler } from './queries/get-course-result.handler.js';

@Module({
  imports: [CqrsModule],
  controllers: [CourseAnalyticsController],
  providers: [GetCourseResultHandler],
})
export class CourseAnalyticsModule {}
