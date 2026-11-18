import { ConflictException, ForbiddenException, type ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from '../../../src/common/filters/all-exceptions.filter.js';

function hostFor(json: jest.Mock): ArgumentsHost {
  const response = { status: jest.fn().mockReturnValue({ json }) };
  const request = { url: '/api/v1/admin/media/sweeps', correlationId: 'c-1' };
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  it('keeps extra fields of an object body (requiredLevel on ADMIN_LEVEL_REQUIRED)', () => {
    const json = jest.fn();
    new AllExceptionsFilter().catch(
      new ForbiddenException({ message: 'ADMIN_LEVEL_REQUIRED', requiredLevel: 'support' }),
      hostFor(json),
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        error: 'Forbidden',
        message: 'ADMIN_LEVEL_REQUIRED',
        requiredLevel: 'support',
        correlationId: 'c-1',
      }),
    );
  });

  it('never lets the body override statusCode, error or message', () => {
    const json = jest.fn();
    new AllExceptionsFilter().catch(new ConflictException({ message: 'SWEEP_RUNNING' }), hostFor(json));
    const body = json.mock.calls[0][0] as Record<string, unknown>;
    expect(body).toMatchObject({ statusCode: 409, error: 'Conflict', message: 'SWEEP_RUNNING' });
  });
});
