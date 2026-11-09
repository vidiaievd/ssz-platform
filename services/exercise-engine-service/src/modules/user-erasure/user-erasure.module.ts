import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { EraseDeletedUserHandler } from './application/commands/erase-deleted-user.handler.js';
import { DELETED_USER_ERASER } from './application/ports/deleted-user-eraser.port.js';
import { DeletedUserPrismaEraser } from './infrastructure/persistence/deleted-user.prisma.eraser.js';

/**
 * VoxOrd plan 07, step 3d: a learner's account erased in auth leaves nothing here. No domain
 * layer — the erase spans attempts and probes and owns neither.
 */
@Module({
  imports: [CqrsModule],
  providers: [
    EraseDeletedUserHandler,
    { provide: DELETED_USER_ERASER, useClass: DeletedUserPrismaEraser },
  ],
})
export class UserErasureModule {}
