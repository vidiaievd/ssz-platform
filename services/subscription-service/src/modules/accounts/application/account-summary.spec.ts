import type { LookupAccountRow, LookupRows } from './account-views.js';
import { summariseLookup } from './account-summary.js';
import { LookupAccountsHandler } from './queries/lookup-accounts/lookup-accounts.handler.js';
import { LookupAccountsQuery } from './queries/lookup-accounts/lookup-accounts.query.js';
import type { IAccountReader } from './ports/account.reader.js';

const now = new Date('2026-11-09T12:00:00.000Z');
const past = new Date('2026-10-01T00:00:00.000Z');
const soon = new Date('2026-11-20T00:00:00.000Z');
const free = { code: 'free_workspace', name: 'Free', version: 2 };
const freeRow = { ...free, seats: null };
const seats = (max: number) => ({ enabled: true, limits: { max } });
const grant = (over: Partial<LookupAccountRow['liveGrants'][number]> = {}): LookupAccountRow['liveGrants'][number] => ({
  featureKey: 'ai.practice',
  enabled: true,
  monthlyCredits: null,
  limits: {},
  startsAt: past,
  endsAt: soon,
  revokedAt: null,
  ...over,
});

const subscription = (
  over: Partial<LookupAccountRow['openSubscriptions'][number]> = {},
): LookupAccountRow['openSubscriptions'][number] => ({
  id: 'sub-1',
  planCode: 'school',
  planName: 'School',
  planVersion: 3,
  status: 'active' as const,
  periodStart: past,
  periodEnd: null,
  seats: null,
  ...over,
});

describe('summariseLookup', () => {
  it('answers every id in the order asked, unknown ones on the free plan', () => {
    const rows: LookupRows = {
      accounts: [{ externalId: 'b', openSubscriptions: [subscription()], liveGrants: [] }],
      freePlan: freeRow,
    };
    const items = summariseLookup(['a', 'b'], rows, now);
    expect(items.map((i) => i.externalId)).toEqual(['a', 'b']);
    expect(items[0]).toEqual({
      externalId: 'a',
      hasAccount: false,
      source: 'free_plan',
      plan: free,
      subscription: null,
      activeGrants: 0,
      scheduledGrants: 0,
      seats: null,
    });
    expect(items[1]).toMatchObject({
      hasAccount: true,
      source: 'subscription',
      plan: { code: 'school', name: 'School', version: 3 },
      subscription: { id: 'sub-1', status: 'active', periodStart: past, periodEnd: null },
    });
  });

  it('falls back to the free plan when the open subscription has run out', () => {
    const rows: LookupRows = {
      accounts: [{ externalId: 'a', openSubscriptions: [subscription({ periodEnd: past })], liveGrants: [] }],
      freePlan: freeRow,
    };
    expect(summariseLookup(['a'], rows, now)[0]).toMatchObject({
      hasAccount: true,
      source: 'free_plan',
      plan: free,
      subscription: null,
    });
  });

  it('keeps a trial with its term', () => {
    const rows: LookupRows = {
      accounts: [{ externalId: 'a', openSubscriptions: [subscription({ status: 'trial', periodEnd: soon })], liveGrants: [] }],
      freePlan: freeRow,
    };
    expect(summariseLookup(['a'], rows, now)[0].subscription).toMatchObject({ status: 'trial', periodEnd: soon });
  });

  it('counts active and scheduled grants apart', () => {
    const rows: LookupRows = {
      accounts: [
        {
          externalId: 'a',
          openSubscriptions: [],
          liveGrants: [
            grant(),
            grant(),
            grant({ startsAt: soon, endsAt: new Date('2026-12-31T00:00:00.000Z') }),
            // The reader filters these out; the summary must not count them if one slips through.
            grant({ endsAt: past }),
            grant({ revokedAt: past }),
          ],
        },
      ],
      freePlan: freeRow,
    };
    expect(summariseLookup(['a'], rows, now)[0]).toMatchObject({ activeGrants: 2, scheduledGrants: 1 });
  });

  describe('seats (plan 90, phase 4)', () => {
    it('takes the limit of the version the subscription is on', () => {
      const rows: LookupRows = {
        accounts: [{ externalId: 'a', openSubscriptions: [subscription({ seats: seats(100) })], liveGrants: [] }],
        freePlan: { ...free, seats: seats(5) },
      };
      expect(summariseLookup(['a'], rows, now)[0].seats).toEqual({ max: 100 });
    });

    it("takes the free plan's limit without a subscription, unknown payers too", () => {
      const rows: LookupRows = { accounts: [], freePlan: { ...free, seats: seats(5) } };
      expect(summariseLookup(['x'], rows, now)[0].seats).toEqual({ max: 5 });
    });

    it('has no limit on a version without the key', () => {
      const rows: LookupRows = {
        accounts: [{ externalId: 'a', openSubscriptions: [subscription()], liveGrants: [] }],
        freePlan: { ...free, seats: seats(5) },
      };
      expect(summariseLookup(['a'], rows, now)[0].seats).toBeNull();
    });

    it('lets an active seats grant raise the limit, never lower it; other keys and scheduled grants do not count', () => {
      const raise = grant({ featureKey: 'seats.students', limits: { max: 150 } });
      const lower = grant({ featureKey: 'seats.students', limits: { max: 10 } });
      const later = grant({ featureKey: 'seats.students', limits: { max: 500 }, startsAt: soon, endsAt: new Date('2026-12-31') });
      const other = grant({ featureKey: 'ai.practice', limits: { perLearnerMonthlyCredits: 900 } });
      const rows: LookupRows = {
        accounts: [
          { externalId: 'a', openSubscriptions: [subscription({ seats: seats(100) })], liveGrants: [raise, later, other] },
          { externalId: 'b', openSubscriptions: [subscription({ seats: seats(100) })], liveGrants: [lower] },
        ],
        freePlan: freeRow,
      };
      const [a, b] = summariseLookup(['a', 'b'], rows, now);
      expect(a.seats).toEqual({ max: 150 });
      expect(b.seats).toEqual({ max: 100 });
    });

    it('keeps no limit on a plan without the key, whatever a grant says', () => {
      const rows: LookupRows = {
        accounts: [
          { externalId: 'a', openSubscriptions: [], liveGrants: [grant({ featureKey: 'seats.students', limits: { max: 20 } })] },
        ],
        freePlan: freeRow,
      };
      expect(summariseLookup(['a'], rows, now)[0].seats).toBeNull();
    });
  });

  it('gives a null plan when nothing runs and the free plan is not seeded', () => {
    expect(summariseLookup(['a'], { accounts: [], freePlan: null }, now)[0]).toMatchObject({
      source: 'free_plan',
      plan: null,
    });
  });
});

describe('LookupAccountsHandler', () => {
  it('reads each id once and answers each once', async () => {
    const lookup = jest.fn().mockResolvedValue({ accounts: [], freePlan: freeRow });
    const handler = new LookupAccountsHandler({ lookup } as unknown as IAccountReader);
    const items = await handler.execute(new LookupAccountsQuery('workspace', ['a', 'b', 'a']));
    expect(lookup).toHaveBeenCalledWith('workspace', ['a', 'b'], expect.any(Date));
    expect(items.map((i) => i.externalId)).toEqual(['a', 'b']);
  });
});
