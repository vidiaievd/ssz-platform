import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ContentClient } from '../../infrastructure/http/content.client.js';
import { StudentAccessService } from '../student-analytics/student-access.service.js';
import { AtomsFlaggedConsumer } from './consumers/atoms-flagged.consumer.js';
import { WeakRulesController } from './controllers/weak-rules.controller.js';
import { GetGroupWeakRulesHandler, GetStudentWeakRulesHandler } from './queries/get-weak-rules.handlers.js';
import { WeakRulesReader } from './weak-rules.reader.js';

@Module({
  imports: [CqrsModule],
  controllers: [WeakRulesController],
  providers: [
    // Rules checks named as the ground of a mistake (plan 85, step 10).
    AtomsFlaggedConsumer,
    WeakRulesReader,
    GetGroupWeakRulesHandler,
    GetStudentWeakRulesHandler,
    ContentClient,
    StudentAccessService,
  ],
})
export class WeakRulesModule {}
