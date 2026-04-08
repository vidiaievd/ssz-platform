import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  // Disable default Nest logger during bootstrap; Pino takes over after init
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Replace Nest's built-in logger with Pino for all framework-level logs
  app.useLogger(app.get(Logger));

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}

bootstrap();
