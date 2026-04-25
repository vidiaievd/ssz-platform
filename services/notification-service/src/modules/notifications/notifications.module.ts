import { Module } from '@nestjs/common';
import { RABBITMQ_HANDLERS } from '../../infrastructure/messaging/message-handler.interface.js';
import type { IMessageHandler } from '../../infrastructure/messaging/message-handler.interface.js';
import { NotificationsRepository } from './notifications.repository.js';
import { NotificationsService } from './notifications.service.js';
import { UserRegisteredHandler } from './handlers/user-registered.handler.js';
import { EmailVerificationHandler } from './handlers/email-verification.handler.js';
import { PasswordResetHandler } from './handlers/password-reset.handler.js';

@Module({
  providers: [
    NotificationsRepository,
    NotificationsService,
    UserRegisteredHandler,
    EmailVerificationHandler,
    PasswordResetHandler,
    {
      provide: RABBITMQ_HANDLERS,
      useFactory: (h1: UserRegisteredHandler, h2: EmailVerificationHandler, h3: PasswordResetHandler): IMessageHandler[] => [h1, h2, h3],
      inject: [UserRegisteredHandler, EmailVerificationHandler, PasswordResetHandler],
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
