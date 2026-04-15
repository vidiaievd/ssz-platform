import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

// Logs every HTTP request/response with method, path, status, and duration.
// Attaches a correlation ID (from x-correlation-id header or generated UUID)
// to request.correlationId so AllExceptionsFilter and downstream code can read it.
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { correlationId?: string }>();
    const response = http.getResponse<Response>();

    const correlationId =
      (request.headers['x-correlation-id'] as string | undefined) ?? crypto.randomUUID();

    // Attach to request so filter and handlers can read it without re-generating
    request.correlationId = correlationId;
    response.setHeader('x-correlation-id', correlationId);

    const { method, url } = request;
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = response.statusCode;
          const durationMs = Date.now() - startedAt;

          this.logger.log({
            correlationId,
            method,
            url,
            statusCode,
            durationMs,
          });
        },
        error: () => {
          // Error path — status not yet written; AllExceptionsFilter will log the details.
          // We log here only to capture duration for failed requests.
          const durationMs = Date.now() - startedAt;

          this.logger.warn({
            correlationId,
            method,
            url,
            durationMs,
            note: 'request failed — see exception filter log for details',
          });
        },
      }),
    );
  }
}
