import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { PrismaContentShareRepository } from './infrastructure/persistence/prisma-content-share.repository.js';
import { CONTENT_SHARE_REPOSITORY } from './domain/repositories/content-share.repository.interface.js';
import { CONTENT_SHARE_LOOKUP } from '../../shared/access-control/domain/ports/content-share-lookup.port.js';

import { CreateContentShareHandler } from './application/commands/create-content-share/create-content-share.handler.js';
import { ShareByEmailHandler } from './application/commands/share-by-email/share-by-email.handler.js';
import { USER_EMAIL_LOOKUP } from './application/ports/user-email-lookup.port.js';
import { LOOKUP_RATE_LIMITER } from './application/ports/lookup-rate-limiter.port.js';
import { HttpUserEmailLookup } from './infrastructure/http/http-user-email-lookup.js';
import { RedisLookupRateLimiter } from './infrastructure/rate-limit/redis-lookup-rate-limiter.js';
import { RevokeContentShareHandler } from './application/commands/revoke-content-share/revoke-content-share.handler.js';
import { ListMySharedWithMeHandler } from './application/queries/list-my-shared-with-me/list-my-shared-with-me.handler.js';
import { ListSharesForEntityHandler } from './application/queries/list-shares-for-entity/list-shares-for-entity.handler.js';

import { ContentShareExpiryCron } from './infrastructure/cron/content-share-expiry.cron.js';
import { ContentShareController } from './presentation/controllers/content-share.controller.js';

const CommandHandlers = [CreateContentShareHandler, ShareByEmailHandler, RevokeContentShareHandler];
const QueryHandlers = [ListMySharedWithMeHandler, ListSharesForEntityHandler];

@Module({
  imports: [CqrsModule],
  controllers: [ContentShareController],
  providers: [
    // Register under its own class token so useExisting aliases below can reference it.
    PrismaContentShareRepository,
    { provide: CONTENT_SHARE_REPOSITORY, useExisting: PrismaContentShareRepository },
    { provide: CONTENT_SHARE_LOOKUP, useExisting: PrismaContentShareRepository },
    { provide: USER_EMAIL_LOOKUP, useClass: HttpUserEmailLookup },
    { provide: LOOKUP_RATE_LIMITER, useClass: RedisLookupRateLimiter },
    ContentShareExpiryCron,
    ...CommandHandlers,
    ...QueryHandlers,
  ],
  exports: [CONTENT_SHARE_REPOSITORY, CONTENT_SHARE_LOOKUP],
})
export class ContentShareModule {}
