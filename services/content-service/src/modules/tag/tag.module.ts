import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { PrismaTagRepository } from './infrastructure/persistence/prisma-tag.repository.js';
import { PrismaTagAssignmentRepository } from './infrastructure/persistence/prisma-tag-assignment.repository.js';
import { TAG_REPOSITORY } from './domain/repositories/tag.repository.interface.js';
import { TAG_ASSIGNMENT_REPOSITORY } from './domain/repositories/tag-assignment.repository.interface.js';
import { TagSlugGeneratorService } from './domain/services/tag-slug-generator.service.js';

import { CreateTagHandler } from './application/commands/create-tag/create-tag.handler.js';
import { UpdateTagHandler } from './application/commands/update-tag/update-tag.handler.js';
import { DeleteTagHandler } from './application/commands/delete-tag/delete-tag.handler.js';
import { AssignTagHandler } from './application/commands/assign-tag/assign-tag.handler.js';
import { RemoveTagAssignmentHandler } from './application/commands/remove-tag-assignment/remove-tag-assignment.handler.js';
import { ListTagsHandler } from './application/queries/list-tags/list-tags.handler.js';
import { GetTagByIdHandler } from './application/queries/get-tag-by-id/get-tag-by-id.handler.js';
import { GetTagsForEntityHandler } from './application/queries/get-tags-for-entity/get-tags-for-entity.handler.js';

import { TagController } from './presentation/controllers/tag.controller.js';

const CommandHandlers = [
  CreateTagHandler,
  UpdateTagHandler,
  DeleteTagHandler,
  AssignTagHandler,
  RemoveTagAssignmentHandler,
];

const QueryHandlers = [ListTagsHandler, GetTagByIdHandler, GetTagsForEntityHandler];

@Module({
  imports: [CqrsModule],
  controllers: [TagController],
  providers: [
    { provide: TAG_REPOSITORY, useClass: PrismaTagRepository },
    { provide: TAG_ASSIGNMENT_REPOSITORY, useClass: PrismaTagAssignmentRepository },
    TagSlugGeneratorService,
    ...CommandHandlers,
    ...QueryHandlers,
  ],
  exports: [TAG_REPOSITORY, TAG_ASSIGNMENT_REPOSITORY],
})
export class TagModule {}
