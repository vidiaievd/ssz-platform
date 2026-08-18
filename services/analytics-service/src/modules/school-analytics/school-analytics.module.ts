import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { SchoolAnalyticsController } from './controllers/school-analytics.controller.js';
import { GetKpisHandler } from './queries/get-kpis.handler.js';
import { GetAtRiskHandler } from './queries/get-at-risk.handler.js';
import { GetCourseHealthHandler } from './queries/get-course-health.handler.js';
import { GetSchoolStudentsHandler } from './queries/get-school-students.handler.js';
import { GetStudentDetailHandler } from './queries/get-student-detail.handler.js';
import { NudgeAtRiskHandler } from './commands/nudge-at-risk.handler.js';
import { EventPublisherService } from '../../infrastructure/messaging/event-publisher.service.js';
import { ExerciseEngineClient } from '../../infrastructure/http/exercise-engine.client.js';

@Module({
  imports: [CqrsModule],
  controllers: [SchoolAnalyticsController],
  providers: [
    GetKpisHandler,
    GetAtRiskHandler,
    GetCourseHealthHandler,
    GetSchoolStudentsHandler,
    GetStudentDetailHandler,
    NudgeAtRiskHandler,
    EventPublisherService,
    ExerciseEngineClient,
  ],
})
export class SchoolAnalyticsModule {}
