import { Module } from '@nestjs/common';
import { EraseDeletedUserHandler } from './application/commands/erase-deleted-user.handler.js';
import { DELETED_USER_ERASER } from './application/ports/deleted-user-eraser.port.js';
import { DeletedUserPrismaEraser } from './infrastructure/persistence/deleted-user.prisma.eraser.js';
import { UserDeletedConsumer } from './presentation/events/user-deleted.consumer.js';

/**
 * VoxOrd plan 07, step 3e: a learner's account erased in auth leaves no trace of them here
 * but the money. No domain layer — the erase spans tables of other modules and owns none.
 */
@Module({
  providers: [
    EraseDeletedUserHandler,
    UserDeletedConsumer,
    { provide: DELETED_USER_ERASER, useClass: DeletedUserPrismaEraser },
  ],
})
export class UserErasureModule {}
