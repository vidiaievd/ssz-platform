import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { EraseDeletedUserHandler } from './application/commands/erase-deleted-user/erase-deleted-user.handler.js';
import { DELETED_USER_ERASER } from './application/ports/deleted-user-eraser.port.js';
import { DeletedUserPrismaEraser } from './infrastructure/persistence/deleted-user.prisma.eraser.js';
import { UserDeletedConsumer } from './infrastructure/events/user-deleted.consumer.js';

/**
 * VoxOrd plan 07, step 3d: a learner's account erased in auth leaves nothing personal here.
 * No domain layer — the erase spans tables of several modules and owns none of them.
 */
@Module({
  imports: [CqrsModule],
  providers: [
    UserDeletedConsumer,
    EraseDeletedUserHandler,
    { provide: DELETED_USER_ERASER, useClass: DeletedUserPrismaEraser },
  ],
})
export class UserErasureModule {}
