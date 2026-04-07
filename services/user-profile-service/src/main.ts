import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    // Disable built-in logger — Pino logger is wired in via LoggerModule
    bufferLogs: true,
  });

  // Use the Pino logger for NestJS internal logs
  app.useLogger(app.get(Logger));

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port') ?? 3001;

  // Global API prefix — all routes are under /api/v1/
  app.setGlobalPrefix('api/v1');

  // Global pipes — strip unknown properties and validate all incoming DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filter — formats all errors into a consistent JSON envelope
  app.useGlobalFilters(new HttpExceptionFilter());

  // CORS — allow all origins in development; restrict in production via env
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || '*',
    credentials: true,
  });

  // Swagger documentation available at /api/docs
  const swaggerConfig = new DocumentBuilder()
    .setTitle('User Profile Service')
    .setDescription('API for managing user profiles (students & tutors) on the SSZ EdTech platform')
    .setVersion('1.0')
    .addBearerAuth()
    .addServer(`http://localhost:${port}`, 'Local development')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // Graceful shutdown — NestJS lifecycle hooks (PrismaService.onModuleDestroy etc.)
  app.enableShutdownHooks();

  await app.listen(port);

  // Log startup info via the app logger (Pino)
  const logger = app.get(Logger);
  logger.log(`User Profile Service running on port ${port}`);
  logger.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
