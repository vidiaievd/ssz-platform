import {
  SchoolOwnerMailer,
  SchoolSuspendedHandler,
  SchoolClosedHandler,
  SchoolRestoredHandler,
  SchoolPurgeReminderHandler,
  remainingDays,
} from '../../../src/modules/notifications/handlers/school-lifecycle.handlers.js';
import type { MessageMeta } from '../../../src/infrastructure/messaging/message-handler.interface.js';

const meta: MessageMeta = { eventId: 'e-1', eventType: 'x', occurredAt: new Date().toISOString(), source: 'organization-service' };

const lifecycle = {
  schoolId: 's-1',
  ownerId: 'o-1',
  name: 'Nordick',
  kind: 'SCHOOL' as const,
  status: 'suspended' as const,
  previousStatus: 'active' as const,
  by: 'admin' as const,
  changedAt: '2026-11-11T10:00:00.000Z',
  closesAt: '2026-12-11T10:00:00.000Z',
  purgeAt: null,
};

describe('school lifecycle letters', () => {
  let notifications: { sendSchoolLifecycleEmail: jest.Mock };
  let contacts: { contactOf: jest.Mock };
  let mailer: SchoolOwnerMailer;

  beforeEach(() => {
    notifications = { sendSchoolLifecycleEmail: jest.fn().mockResolvedValue(undefined) };
    contacts = { contactOf: jest.fn().mockResolvedValue({ userId: 'o-1', email: 'owner@x.test', displayName: 'O', uiLocale: 'uk' }) };
    mailer = new SchoolOwnerMailer(notifications as any, contacts as any);
  });

  it('suspended: writes to the owner in their language with the closing date', async () => {
    await new SchoolSuspendedHandler(mailer).handle(lifecycle, meta);
    expect(contacts.contactOf).toHaveBeenCalledWith('o-1');
    expect(notifications.sendSchoolLifecycleEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        letter: 'suspended',
        email: 'owner@x.test',
        locale: 'uk',
        schoolName: 'Nordick',
        closesAt: lifecycle.closesAt,
        ownerId: 'o-1',
        schoolId: 's-1',
      }),
    );
  });

  it('closed: carries the purge date', async () => {
    await new SchoolClosedHandler(mailer).handle(
      { ...lifecycle, status: 'closed', closesAt: null, purgeAt: '2027-05-12T10:00:00.000Z' },
      meta,
    );
    expect(notifications.sendSchoolLifecycleEmail).toHaveBeenCalledWith(
      expect.objectContaining({ letter: 'closed', purgeAt: '2027-05-12T10:00:00.000Z' }),
    );
  });

  it('restored: plain letter', async () => {
    await new SchoolRestoredHandler(mailer).handle({ ...lifecycle, status: 'active' }, meta);
    expect(notifications.sendSchoolLifecycleEmail).toHaveBeenCalledWith(expect.objectContaining({ letter: 'restored' }));
  });

  it('purge reminder: carries the days really left and the date, not the threshold', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2027-05-07T09:00:00.000Z'));
    try {
      // The 7-day reminder went out late: 5 days and an hour are left → "in 6 days".
      await new SchoolPurgeReminderHandler(mailer).handle(
        { schoolId: 's-1', ownerId: 'o-1', name: 'Nordick', kind: 'SCHOOL', daysLeft: 7, purgeAt: '2027-05-12T10:00:00.000Z' },
        meta,
      );
    } finally {
      jest.useRealTimers();
    }
    expect(notifications.sendSchoolLifecycleEmail).toHaveBeenCalledWith(
      expect.objectContaining({ letter: 'purge_reminder', daysLeft: 6, purgeAt: '2027-05-12T10:00:00.000Z' }),
    );
  });

  describe('remainingDays', () => {
    const now = new Date('2027-04-12T10:00:00.000Z');
    it('counts whole days up to the purge', () => {
      expect(remainingDays('2027-05-12T10:00:00.000Z', 30, now)).toBe(30);
      expect(remainingDays('2027-05-12T09:00:00.000Z', 30, now)).toBe(30);
      expect(remainingDays('2027-05-12T11:00:00.000Z', 30, now)).toBe(31);
    });
    it('never says less than one day, even past the date', () => {
      expect(remainingDays('2027-04-12T12:00:00.000Z', 7, now)).toBe(1);
      expect(remainingDays('2027-04-11T10:00:00.000Z', 7, now)).toBe(1);
    });
    it('falls back to the threshold without a usable date', () => {
      expect(remainingDays(null, 7, now)).toBe(7);
      expect(remainingDays('not a date', 30, now)).toBe(30);
    });
  });

  it('no address on record: no letter and no failure', async () => {
    contacts.contactOf.mockResolvedValue(null);
    await expect(new SchoolClosedHandler(mailer).handle({ ...lifecycle, status: 'closed' }, meta)).resolves.toBeUndefined();
    expect(notifications.sendSchoolLifecycleEmail).not.toHaveBeenCalled();
  });

  it('profile-service down: the error goes up so the event is requeued', async () => {
    contacts.contactOf.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(new SchoolSuspendedHandler(mailer).handle(lifecycle, meta)).rejects.toThrow('ECONNREFUSED');
    expect(notifications.sendSchoolLifecycleEmail).not.toHaveBeenCalled();
  });

  it('listens to the four routing keys', () => {
    expect([SchoolSuspendedHandler, SchoolClosedHandler, SchoolRestoredHandler, SchoolPurgeReminderHandler].map(
      (H) => new H(mailer).routingKey,
    )).toEqual(['school.suspended', 'school.closed', 'school.restored', 'school.purge.reminder']);
  });
});
