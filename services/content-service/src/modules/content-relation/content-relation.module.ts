import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { PrismaContentRelationRepository } from './infrastructure/persistence/prisma-content-relation.repository.js';
import { CONTENT_RELATION_REPOSITORY } from './domain/repositories/content-relation.repository.interface.js';
import { RelatableEntityExistenceChecker } from './application/services/relatable-entity-existence-checker.service.js';

import { CreateContentRelationHandler } from './application/commands/create-content-relation/create-content-relation.handler.js';
import { DeleteContentRelationHandler } from './application/commands/delete-content-relation/delete-content-relation.handler.js';
import { ListRelationsBySourceHandler } from './application/queries/list-relations-by-source/list-relations-by-source.handler.js';
import { ListRelationsByTargetHandler } from './application/queries/list-relations-by-target/list-relations-by-target.handler.js';

import { ContentRelationController } from './presentation/controllers/content-relation.controller.js';

const CommandHandlers = [CreateContentRelationHandler, DeleteContentRelationHandler];

const QueryHandlers = [ListRelationsBySourceHandler, ListRelationsByTargetHandler];

@Module({
  imports: [CqrsModule],
  controllers: [ContentRelationController],
  providers: [
    { provide: CONTENT_RELATION_REPOSITORY, useClass: PrismaContentRelationRepository },
    RelatableEntityExistenceChecker,
    ...CommandHandlers,
    ...QueryHandlers,
  ],
  exports: [CONTENT_RELATION_REPOSITORY],
})
export class ContentRelationModule {}
