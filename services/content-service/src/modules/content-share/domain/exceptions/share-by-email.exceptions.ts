import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';

/** 404 `USER_NOT_FOUND` — no account has that address. */
export class ShareRecipientNotFoundException extends NotFoundException {
  constructor() {
    super({ message: 'No user found with that email', code: 'USER_NOT_FOUND' });
  }
}

/** 429 `LOOKUP_RATE_LIMITED` — the asker looked up too many addresses in the window. */
export class LookupRateLimitedException extends HttpException {
  constructor(retryAfterMs: number) {
    super(
      {
        message: 'Too many address lookups, try again later',
        code: 'LOOKUP_RATE_LIMITED',
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
