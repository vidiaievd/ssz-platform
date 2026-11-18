import { of, throwError } from 'rxjs';
import { OwnerContactClient } from '../../../src/modules/notifications/schedules/clients/owner-contact.client.js';

describe('OwnerContactClient', () => {
  const settings = { serviceUrl: 'http://profile:3001', internalToken: 'tok' };
  const make = (http: any, cfg: any = settings) =>
    new OwnerContactClient(http, { get: () => cfg } as any);

  it('asks the internal contact route with the service token', async () => {
    const get = jest.fn().mockReturnValue(of({ data: { userId: 'u', email: 'a@b.c', displayName: null, uiLocale: 'nb' } }));
    const out = await make({ get }).contactOf('u');
    expect(get).toHaveBeenCalledWith('http://profile:3001/api/v1/internal/profiles/u/contact', { headers: { 'x-service-token': 'tok' } });
    expect(out?.email).toBe('a@b.c');
  });

  it('404 → null (nobody to write to)', async () => {
    const get = jest.fn().mockReturnValue(throwError(() => ({ response: { status: 404 } })));
    await expect(make({ get }).contactOf('u')).resolves.toBeNull();
  });

  it('other failures throw', async () => {
    const get = jest.fn().mockReturnValue(throwError(() => ({ response: { status: 503 } })));
    await expect(make({ get }).contactOf('u')).rejects.toBeDefined();
  });

  it('not configured → null without a call', async () => {
    const get = jest.fn();
    await expect(make({ get }, { serviceUrl: undefined, internalToken: undefined }).contactOf('u')).resolves.toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});
