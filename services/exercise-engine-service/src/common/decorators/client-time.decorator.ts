import { applyDecorators, BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import type { Request } from 'express';
import type { ClientTimeClaim } from '../../shared/application/services/client-time.js';

export const CLIENT_AT_HEADER = 'x-client-at';
export const CLIENT_SENT_AT_HEADER = 'x-client-sent-at';

/**
 * The phone's account of when a replayed call was made (VoxOrd offline plan, B4), or null
 * for an ordinary online call. Read only: what to believe of it is `resolveClientTime`'s.
 *
 * A header that is there and unreadable is refused rather than ignored — a client sending
 * times it cannot write is a client whose replays would quietly land on the sync day.
 */
export const ClientTime = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ClientTimeClaim | null => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const at = readTime(request, CLIENT_AT_HEADER);
    if (at === null) return null;
    return { at, sentAt: readTime(request, CLIENT_SENT_AT_HEADER) };
  },
);

/** Swagger for the two headers, on every route a phone replays. */
export function ApiClientTimeHeaders(): MethodDecorator {
  return applyDecorators(
    ApiHeader({
      name: 'X-Client-At',
      required: false,
      description:
        'ISO 8601. When the call was made, by the phone clock — sent only when a call is ' +
        'replayed from the offline journal. Bounded by the server: never in the future, never ' +
        'before the last moment on the attempt, ignored when older than 7 days.',
      example: '2026-10-14T08:15:00.000Z',
    }),
    ApiHeader({
      name: 'X-Client-Sent-At',
      required: false,
      description:
        'ISO 8601. The phone clock when the replay was sent; corrects `X-Client-At` for a ' +
        'clock that is wrong by a constant amount.',
      example: '2026-10-16T12:00:00.000Z',
    }),
  );
}

function readTime(request: Request, header: string): Date | null {
  const raw = request.headers[header];
  if (raw === undefined) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = new Date(value ?? '');
  if (value === undefined || value === '' || Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${header} must be an ISO 8601 date-time`);
  }
  return parsed;
}
