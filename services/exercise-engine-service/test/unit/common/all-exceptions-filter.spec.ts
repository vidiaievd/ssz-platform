import { jest } from '@jest/globals';
import type { ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from '../../../src/common/filters/all-exceptions.filter.js';
import { OpenAttemptExistsError } from '../../../src/modules/attempts/domain/exceptions/attempt.errors.js';

function hostFor() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ url: '/api/v1/exercises/ex-1/attempts/a-1/submit' }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('AllExceptionsFilter', () => {
  // Plan 76, 2.5: the open-attempt index refusing a save that is not a start — a practice
  // check reopening an attempt while a newer one is open — is a conflict, not a crash.
  it('answers a second open attempt with 409 OPEN_ATTEMPT_EXISTS', () => {
    const { host, status, json } = hostFor();

    new AllExceptionsFilter().catch(new OpenAttemptExistsError(), host);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, code: 'OPEN_ATTEMPT_EXISTS' }),
    );
  });

  it('still answers an unknown error with 500', () => {
    const { host, status } = hostFor();

    new AllExceptionsFilter().catch(new Error('boom'), host);

    expect(status).toHaveBeenCalledWith(500);
  });
});
