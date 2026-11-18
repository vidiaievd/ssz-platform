import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EXCHANGES } from '@ssz/contracts';
import { OUTBOX_RELAY_OPTIONS, OUTBOX_STORE, OutboxRelayService, type OutboxRelayOptions } from '@ssz/messaging';
import type { AppConfig } from '../../config/configuration.js';
import { ADMIN_AUDIT_RECORDER } from '../../shared/application/admin-audit.js';
import { PrismaOutboxStore } from '../messaging/prisma-outbox.store.js';
import { PrismaAdminAuditRecorder } from './prisma-admin-audit.recorder.js';

/**
 * The admin trail (plan 90, phase 8, step 4) and the outbox relay that carries its
 * `admin.action.performed` to `media.events`. Asset events keep their direct publisher; the
 * outbox is for the trail only.
 */
@Global()
@Module({
  providers: [
    { provide: ADMIN_AUDIT_RECORDER, useClass: PrismaAdminAuditRecorder },
    PrismaOutboxStore,
    { provide: OUTBOX_STORE, useExisting: PrismaOutboxStore },
    {
      provide: OUTBOX_RELAY_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>): OutboxRelayOptions => ({
        rabbitmqUrl: config.get<AppConfig['rabbitmq']>('rabbitmq')?.url ?? '',
        pollIntervalMs: 1_000,
        batchSize: 50,
        maxAttempts: 5,
        exchanges: [EXCHANGES.MEDIA!],
      }),
    },
    OutboxRelayService,
  ],
  exports: [ADMIN_AUDIT_RECORDER],
})
export class AuditModule {}
