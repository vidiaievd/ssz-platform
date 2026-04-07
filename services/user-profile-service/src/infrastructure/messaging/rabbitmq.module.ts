import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RabbitMQService } from './rabbitmq.service';

// Global module — RabbitMQService is injected wherever needed
// without importing this module explicitly in every feature module.
@Global()
@Module({
  providers: [
    RabbitMQService,
    {
      // Factory that makes ConfigService available inside RabbitMQService
      provide: 'RABBITMQ_CONFIG',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        url: configService.get<string>('rabbitmq.url'),
        exchangeProfiles: configService.get<string>('rabbitmq.exchangeProfiles'),
      }),
    },
  ],
  exports: [RabbitMQService],
})
export class RabbitMQModule {}
