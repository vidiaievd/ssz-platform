import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';
import { QUEUE_AUDIO_PROCESSING, QUEUE_IMAGE_PROCESSING } from './queue-names.js';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => {
        const redis = config.get<AppConfig['redis']>('redis')!;
        return {
          connection: {
            host: redis.host,
            port: redis.port,
            password: redis.password,
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: QUEUE_IMAGE_PROCESSING },
      { name: QUEUE_AUDIO_PROCESSING },
    ),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
