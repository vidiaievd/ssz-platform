import { validate } from './configuration.js';

describe('validate', () => {
  it('refuses the entitlement stub in production', () => {
    expect(() => validate({ NODE_ENV: 'production', AI_ENTITLEMENTS_STUB: 'true' })).toThrow(/AI_ENTITLEMENTS_STUB/);
  });

  it('takes the stub outside production and leaves it off by default', () => {
    expect(validate({ NODE_ENV: 'development', AI_ENTITLEMENTS_STUB: 'true' }).AI_ENTITLEMENTS_STUB).toBe(true);
    expect(validate({ NODE_ENV: 'production' }).AI_ENTITLEMENTS_STUB).toBe(false);
  });
});
