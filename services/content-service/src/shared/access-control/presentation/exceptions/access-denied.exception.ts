import { HttpException, HttpStatus } from '@nestjs/common';

/** Reasons a decision can carry that are a conflict with the school's state, not a lack of rights. */
export const SCHOOL_NOT_ACTIVE_REASON = 'school_not_active';

/**
 * 403 `ACCESS_DENIED`; or 409 `SCHOOL_NOT_ACTIVE` when the school that owns the material is
 * suspended, closed or purged (plan 90, phase 5, step 7) — the person may edit, the school is
 * read only, and the screen can say why.
 */
export class AccessDeniedException extends HttpException {
  constructor(reason?: string) {
    super(
      reason === SCHOOL_NOT_ACTIVE_REASON
        ? { message: 'The school is read only', code: 'SCHOOL_NOT_ACTIVE', reason }
        : { message: 'Access denied', code: 'ACCESS_DENIED', reason },
      reason === SCHOOL_NOT_ACTIVE_REASON ? HttpStatus.CONFLICT : HttpStatus.FORBIDDEN,
    );
  }
}
