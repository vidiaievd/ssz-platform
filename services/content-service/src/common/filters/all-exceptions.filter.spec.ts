import { BadRequestException, ConflictException, type ArgumentsHost } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function run(exception: unknown) {
  const json = jest.fn();
  const response = { status: jest.fn().mockReturnValue({ json }) };
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ url: '/x', correlationId: 'c1' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return json.mock.calls[0]?.[0] as Record<string, unknown>;
}

describe('AllExceptionsFilter', () => {
  it('keeps the fields a handler put in the body', () => {
    const body = run(
      new ConflictException({
        message: 'MODIFIED_ELSEWHERE',
        currentUpdatedAt: '2026-11-03T05:00:00.000Z',
      }),
    );
    expect(body).toMatchObject({
      statusCode: 409,
      message: 'MODIFIED_ELSEWHERE',
      currentUpdatedAt: '2026-11-03T05:00:00.000Z',
    });
  });

  it('never lets a body field replace a standard one', () => {
    const body = run(
      new BadRequestException({ message: 'X', statusCode: 200, path: '/y', issues: [1] }),
    );
    expect(body).toMatchObject({ statusCode: 400, path: '/x', message: 'X', issues: [1] });
  });

  it('joins validation messages and adds nothing else', () => {
    const body = run(new BadRequestException(['a must be a string', 'b is required']));
    expect(Object.keys(body).sort()).toEqual(
      ['correlationId', 'error', 'message', 'path', 'statusCode', 'timestamp'].sort(),
    );
    expect(body.message).toBe('a must be a string; b is required');
  });
});
