import { parseSeatLimitMessage } from './entitlements-changed.consumer.js';

const SCHOOL = 'f3ced490-5f8b-4d04-bd05-45ab1a101ff8';
const envelope = (payload: Record<string, unknown>) =>
  JSON.stringify({ eventId: 'e1', eventType: 'subscription.entitlements.changed', payload });
const snapshot = (over: Record<string, unknown> = {}) => ({
  account: { type: 'workspace', externalId: SCHOOL },
  features: { 'seats.students': { enabled: true, monthlyCredits: null, limits: { max: 5 } } },
  version: 7,
  validUntil: '2026-12-01T00:00:00.000Z',
  ...over,
});

describe('parseSeatLimitMessage', () => {
  it("reads a school's limit, version and validUntil", () => {
    expect(parseSeatLimitMessage(envelope(snapshot()))).toEqual({
      kind: 'school',
      schoolId: SCHOOL,
      snapshot: { max: 5, version: 7, validUntil: new Date('2026-12-01T00:00:00.000Z') },
    });
  });

  it('stores "no limit" for a plan without the key', () => {
    const parsed = parseSeatLimitMessage(envelope(snapshot({ features: {} })));
    expect(parsed).toMatchObject({ kind: 'school', snapshot: { max: null } });
  });

  it("ignores a learner's own plan", () => {
    expect(parseSeatLimitMessage(envelope(snapshot({ account: { type: 'user', externalId: 'u1' } })))).toEqual({
      kind: 'ignored',
    });
  });

  it('refuses what cannot be a snapshot', () => {
    expect(() => parseSeatLimitMessage('not json')).toThrow();
    expect(() => parseSeatLimitMessage(envelope({}))).toThrow('no account');
    expect(() => parseSeatLimitMessage(envelope(snapshot({ account: { type: 'workspace', externalId: 'x' } })))).toThrow(
      'not a UUID',
    );
    expect(() => parseSeatLimitMessage(envelope(snapshot({ version: '7' })))).toThrow('no version');
    expect(() => parseSeatLimitMessage(envelope(snapshot({ validUntil: 'soon' })))).toThrow('no version');
  });
});
