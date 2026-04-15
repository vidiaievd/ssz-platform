import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import type { AppConfig } from './config/configuration.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Replace NestJS default logger with Pino
  app.useLogger(app.get(Logger));

  // All HTTP endpoints are prefixed with /api/v1
  app.setGlobalPrefix('api/v1');

  // Validate and transform request DTOs globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filter — unified error response shape
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global logging interceptor — request/response logging with correlation ID
  app.useGlobalInterceptors(new LoggingInterceptor());

  // Swagger UI at /api/docs, JSON spec at /api/docs-json
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Content Service')
    .setDescription('Learning material management: courses, modules, lessons, exercises')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addTag('health', 'Service health check')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const config = app.get(ConfigService<AppConfig>);
  const port = config.get<AppConfig['app']>('app')?.port ?? 3003;

  await app.listen(port);
}

void bootstrap();
