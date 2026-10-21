import { validate } from './configuration.js';

describe('validate', () => {
  it('points at subscription-service on the compose network by default', () => {
    expect(validate({}).SUBSCRIPTION_SERVICE_URL).toBe('http://subscription-service:3011');
  });

  it('refuses a subscription-service address that is not a URL', () => {
    expect(() => validate({ SUBSCRIPTION_SERVICE_URL: 'subscription-service' })).toThrow(/SUBSCRIPTION_SERVICE_URL/);
  });
});
