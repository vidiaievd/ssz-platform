import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  // Global prefix for all versioned API routes.
  // /health is excluded so load balancers can reach it without the prefix.
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  // Validate and transform all incoming request bodies.
  // whitelist: strip properties not in the DTO.
  // transform: convert plain objects to DTO class instances.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Map domain exceptions to HTTP responses globally.
  app.useGlobalFilters(new DomainExceptionFilter());

  // Swagger / OpenAPI
  const swaggerConfig = new DocumentBuilder()
    .setTitle('User Profile Service')
    .setDescription('Manages user profiles for the SSZ Platform')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT',
    )
    .addServer(`http://localhost:${process.env.PORT ?? 3001}`, 'Local')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // Swagger UI at /api/docs
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}

bootstrap();
