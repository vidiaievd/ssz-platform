import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { StudentAnalyticsController } from './controllers/student-analytics.controller.js';
import { GetStudentGridHandler } from './queries/get-student-grid.handler.js';
import { GetStudentPositionHandler } from './queries/get-student-position.handler.js';
import { GetStudentWorkContextHandler } from './queries/get-student-work-context.handler.js';
import { GetModalityGapHandler } from './queries/get-modality-gap.handler.js';
import { GetNextPracticeHandler } from './queries/get-next-practice.handler.js';
import { StudentAccessService } from './student-access.service.js';
import { ContentClient } from '../../infrastructure/http/content.client.js';
import { LearningClient } from '../../infrastructure/http/learning.client.js';
// The learner's position is the group's own median read from the other side, and the
// work-context bar is literally the same count: both come from group-analytics rather
// than from a second implementation here (plan 58, phase 4).
import { GroupAnalyticsModule } from '../group-analytics/group-analytics.module.js';

@Module({
  imports: [CqrsModule, GroupAnalyticsModule],
  controllers: [StudentAnalyticsController],
  providers: [
    GetStudentGridHandler,
    GetStudentPositionHandler,
    GetStudentWorkContextHandler,
    GetModalityGapHandler,
    GetNextPracticeHandler,
    StudentAccessService,
    ContentClient,
    LearningClient,
  ],
})
export class StudentAnalyticsModule {}
