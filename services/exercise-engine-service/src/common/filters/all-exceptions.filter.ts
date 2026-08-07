import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request & { correlationId?: string }>();
    const response = ctx.getResponse<Response>();

    const correlationId = request.correlationId ?? crypto.randomUUID();
    const path = request.url;
    const timestamp = new Date().toISOString();

    let statusCode: number;
    let error: string;
    let message: string;
    /**
     * Structured fields a thrower attached to the exception body, beyond the message.
     * They are the point of throwing an object rather than a string — a 409 that says
     * *which* attempt is already running is actionable, one that only says so in prose
     * is not — so the envelope must carry them through rather than flatten them away.
     */
    let extra: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      error = this.statusText(statusCode);

      const responseBody = exception.getResponse();
      if (typeof responseBody === 'string') {
        message = responseBody;
      } else if (typeof responseBody === 'object' && responseBody !== null) {
        const body = responseBody as Record<string, unknown>;
        const raw = body['message'];
        message = Array.isArray(raw) ? raw.join('; ') : String(raw ?? exception.message);
        // The envelope's own keys win: a thrower must not be able to rewrite the
        // status, the correlation id, or the path by naming a field after them.
        const { message: _message, statusCode: _statusCode, error: _error, ...rest } = body;
        extra = rest;
      } else {
        message = exception.message;
      }
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      error = 'Internal Server Error';
      message = 'An unexpected error occurred';

      this.logger.error(
        {
          correlationId,
          path,
          err:
            exception instanceof Error
              ? { message: exception.message, stack: exception.stack }
              : String(exception),
        },
        'Unhandled exception',
      );
    }

    response.status(statusCode).json({
      ...extra,
      statusCode,
      error,
      message,
      path,
      timestamp,
      correlationId,
    });
  }

  private statusText(status: number): string {
    const map: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      410: 'Gone',
      422: 'Unprocessable Entity',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
    };
    return map[status] ?? 'Error';
  }
}
