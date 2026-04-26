import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';
import { AssignmentsModule } from '../assignments/assignments.module.js';
import { CLOCK, SystemClock } from '../../shared/application/ports/clock.port.js';
import { MarkOverdueAssignmentsWorker } from './mark-overdue-assignments.worker.js';
import { JobSchedulerService } from './job-scheduler.service.js';

@Module({
  imports: [
    AssignmentsModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => {
        const r = config.get<AppConfig['redis']>('redis')!;
        return {
          connection: {
            host: r.host,
            port: r.port,
            password: r.password,
            db: r.db,
          },
        };
      },
    }),
    BullModule.registerQueue({ name: 'assignments' }),
  ],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    MarkOverdueAssignmentsWorker,
    JobSchedulerService,
  ],
})
export class JobsModule {}
