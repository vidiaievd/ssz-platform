import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { SLOT_REPOSITORY } from './domain/repositories/slot.repository.interface.js';
import { LESSON_REPOSITORY } from './domain/repositories/lesson.repository.interface.js';
import { SlotPrismaRepository } from './infrastructure/persistence/slot.prisma.repository.js';
import { LessonPrismaRepository } from './infrastructure/persistence/lesson.prisma.repository.js';
import { LessonGeneratorService } from './application/services/lesson-generator.service.js';
import { CURRICULUM_PLAN_READER } from './application/ports/curriculum-plan.reader.js';
import { CurriculumPlanPrismaReader } from './infrastructure/persistence/curriculum-plan.prisma.reader.js';
import { COURSE_OUTLINE_READER } from './application/ports/course-outline.reader.js';
import { ContentServiceHttpClient } from '../../infrastructure/content/content-service.http-client.js';
import { CreateSlotHandler } from './application/commands/create-slot/create-slot.handler.js';
import { DeleteSlotHandler } from './application/commands/delete-slot/delete-slot.handler.js';
import { ReplaceSlotsHandler } from './application/commands/replace-slots/replace-slots.handler.js';
import { ListSlotsHandler } from './application/queries/list-slots/list-slots.handler.js';
import { SlotsController } from './presentation/controllers/slots.controller.js';
import { LessonsController } from './presentation/controllers/lessons.controller.js';
import { SessionsController } from './presentation/controllers/sessions.controller.js';
import { SessionAccessService } from './application/services/session-access.service.js';
import { SessionWriterService } from './application/services/session-writer.service.js';
import { OrgServiceHttpClient } from '../../infrastructure/org/org-service.http-client.js';

const CommandHandlers = [CreateSlotHandler, DeleteSlotHandler, ReplaceSlotsHandler];
const QueryHandlers = [ListSlotsHandler];

@Module({
  imports: [CqrsModule],
  controllers: [SlotsController, LessonsController, SessionsController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    LessonGeneratorService,
    SessionAccessService,
    SessionWriterService,
    OrgServiceHttpClient,
    { provide: SLOT_REPOSITORY, useClass: SlotPrismaRepository },
    { provide: LESSON_REPOSITORY, useClass: LessonPrismaRepository },
    { provide: CURRICULUM_PLAN_READER, useClass: CurriculumPlanPrismaReader },
    { provide: COURSE_OUTLINE_READER, useClass: ContentServiceHttpClient },
  ],
  exports: [LESSON_REPOSITORY, LessonGeneratorService, OrgServiceHttpClient],
})
export class SlotsModule {}
