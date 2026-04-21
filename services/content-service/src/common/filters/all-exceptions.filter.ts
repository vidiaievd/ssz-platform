import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

// Global exception filter — catches everything and returns a consistent RFC 7807-style body.
// HttpException: status and message are passed through as-is.
// Anything else: logged as an unexpected error and returned as 500.
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

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      error = this.statusText(statusCode);

      const responseBody = exception.getResponse();
      if (typeof responseBody === 'string') {
        message = responseBody;
      } else if (typeof responseBody === 'object' && responseBody !== null) {
        const body = responseBody as Record<string, unknown>;
        const raw = body['message'];
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        message = Array.isArray(raw) ? raw.join('; ') : String(raw ?? exception.message);
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
      405: 'Method Not Allowed',
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
