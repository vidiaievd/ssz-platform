import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '../../infrastructure/database/prisma.module.js';
import { CAN_DO_DESCRIPTOR_REPOSITORY } from './domain/repositories/can-do-descriptor.repository.interface.js';
import { PrismaCanDoDescriptorRepository } from './infrastructure/persistence/prisma-can-do-descriptor.repository.js';
import { CreateCanDoDescriptorHandler } from './application/commands/create-descriptor/create-descriptor.handler.js';
import { ListCanDoDescriptorsHandler } from './application/queries/list-descriptors/list-descriptors.handler.js';
import { GetCanDoDescriptorsByModuleHandler } from './application/queries/get-descriptors-by-module/get-descriptors-by-module.handler.js';
import { GetCanDoDescriptorsByIdsHandler } from './application/queries/get-descriptors-by-ids/get-descriptors-by-ids.handler.js';
import { CanDoDescriptorController } from './presentation/controllers/can-do-descriptor.controller.js';

const CommandHandlers = [CreateCanDoDescriptorHandler];
const QueryHandlers = [
  ListCanDoDescriptorsHandler,
  GetCanDoDescriptorsByModuleHandler,
  GetCanDoDescriptorsByIdsHandler,
];

@Module({
  imports: [CqrsModule, PrismaModule],
  controllers: [CanDoDescriptorController],
  providers: [
    { provide: CAN_DO_DESCRIPTOR_REPOSITORY, useClass: PrismaCanDoDescriptorRepository },
    ...CommandHandlers,
    ...QueryHandlers,
  ],
  exports: [CAN_DO_DESCRIPTOR_REPOSITORY],
})
export class CanDoModule {}
