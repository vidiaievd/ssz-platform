import { UnauthorizedException } from '@nestjs/common';
import { InternalAuthGuard } from '../../../src/common/guards/internal-auth.guard.js';

function contextWith(headers: Record<string, unknown>) {
  return { switchToHttp: () => ({ getRequest: () => ({ headers }) }) } as any;
}

describe('InternalAuthGuard', () => {
  const guard = new InternalAuthGuard({ get: () => 'secret' } as any);

  it('lets the right token through', () => {
    expect(guard.canActivate(contextWith({ 'x-internal-token': 'secret' }))).toBe(true);
  });

  it.each([
    ['missing', {}],
    ['wrong', { 'x-internal-token': 'nope' }],
    ['a Bearer instead', { authorization: 'Bearer secret' }],
  ])('refuses a %s token', (_label, headers) => {
    expect(() => guard.canActivate(contextWith(headers))).toThrow(UnauthorizedException);
  });

  it('refuses everything when the service has no token configured', () => {
    const open = new InternalAuthGuard({ get: () => undefined } as any);
    expect(() => open.canActivate(contextWith({ 'x-internal-token': '' }))).toThrow(UnauthorizedException);
  });
});
