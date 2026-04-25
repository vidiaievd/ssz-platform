import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { correlationId?: string }>();
    const response = http.getResponse<Response>();

    const correlationId =
      (request.headers['x-correlation-id'] as string | undefined) ?? crypto.randomUUID();

    request.correlationId = correlationId;
    response.setHeader('x-correlation-id', correlationId);

    const { method, url } = request;
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.log({
            correlationId,
            method,
            url,
            statusCode: response.statusCode,
            durationMs: Date.now() - startedAt,
          });
        },
        error: () => {
          this.logger.warn({
            correlationId,
            method,
            url,
            durationMs: Date.now() - startedAt,
            note: 'request failed — see exception filter log for details',
          });
        },
      }),
    );
  }
}
