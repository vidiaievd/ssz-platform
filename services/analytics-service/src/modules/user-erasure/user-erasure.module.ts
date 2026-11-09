import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { EraseDeletedUserHandler } from './application/commands/erase-deleted-user.handler.js';
import { DELETED_USER_ERASER } from './application/ports/deleted-user-eraser.port.js';
import { UserDeletedConsumer } from './consumers/user-deleted.consumer.js';
import { DeletedUserPrismaEraser } from './infrastructure/persistence/deleted-user.prisma.eraser.js';

/** VoxOrd plan 07, step 3e: a learner's account erased in auth leaves nothing here but money. */
@Module({
  imports: [CqrsModule],
  providers: [
    EraseDeletedUserHandler,
    UserDeletedConsumer,
    { provide: DELETED_USER_ERASER, useClass: DeletedUserPrismaEraser },
  ],
})
export class UserErasureModule {}
