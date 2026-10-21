import { UnprocessableEntityException } from '@nestjs/common';

/**
 * A domain refusal as a 422. `code` is the stable, machine-readable part (`plan_archived`,
 * `audience_mismatch`, ...); `message` is for people.
 */
export function businessError(error: { code: string }, message: string): UnprocessableEntityException {
  return new UnprocessableEntityException({ statusCode: 422, code: error.code, message, details: error });
}
