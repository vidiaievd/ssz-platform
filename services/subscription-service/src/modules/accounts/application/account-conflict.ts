import { ConflictException } from '@nestjs/common';

/** Stable code of every 409 that means "the account is not the one you read". */
export const ACCOUNT_CHANGED = 'account_changed';

/**
 * The account moved past the revision the caller read (another tab, another admin, the
 * refresh job, a school closing) — or a concurrent writer won the save. `expectedRevision`
 * is what the caller sent, `revision` what the account is at when the server knows it.
 */
export function accountChanged(details: { expectedRevision?: number; revision?: number } = {}): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: ACCOUNT_CHANGED,
    message: 'The account changed meanwhile; reload and retry',
    details: { code: ACCOUNT_CHANGED, ...details },
  });
}

/**
 * Optimistic lock of an admin's change: refused when the caller says which revision it read
 * and the account is past it. No `expectedRevision` = last writer wins (scripts, old callers).
 * A payer never seen has revision 0, so a panel that found no account sends 0.
 */
export function assertRevision(account: { revision: number }, expectedRevision: number | undefined): void {
  if (expectedRevision !== undefined && expectedRevision !== account.revision) {
    throw accountChanged({ expectedRevision, revision: account.revision });
  }
}
