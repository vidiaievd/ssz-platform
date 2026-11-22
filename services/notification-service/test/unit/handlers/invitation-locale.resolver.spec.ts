import { InvitationLocaleResolver } from '../../../src/modules/notifications/handlers/invitation-locale.resolver.js';
import type { OwnerContactClient, UserContact } from '../../../src/modules/notifications/schedules/clients/owner-contact.client.js';

function contact(userId: string, uiLocale: string | null): UserContact {
  return { userId, email: `${userId}@example.test`, displayName: null, uiLocale };
}

describe('InvitationLocaleResolver', () => {
  let contacts: { contactOf: jest.Mock; userIdByEmail: jest.Mock };
  let resolver: InvitationLocaleResolver;

  beforeEach(() => {
    contacts = { contactOf: jest.fn(), userIdByEmail: jest.fn() };
    resolver = new InvitationLocaleResolver(contacts as unknown as OwnerContactClient);
  });

  it('writes to a known account in its own language, without looking the address up', async () => {
    contacts.contactOf.mockResolvedValue(contact('u1', 'ru'));
    await expect(resolver.resolve({ inviteeEmail: 'a@x', recipientUserId: 'u1', schoolLanguage: 'nb', ownerId: 'o1' })).resolves.toBe('ru');
    expect(contacts.userIdByEmail).not.toHaveBeenCalled();
    expect(contacts.contactOf).toHaveBeenCalledWith('u1');
  });

  it('finds the account by address when the event names none (resend, teacher invitations)', async () => {
    contacts.userIdByEmail.mockResolvedValue('u2');
    contacts.contactOf.mockResolvedValue(contact('u2', 'uk'));
    await expect(resolver.resolve({ inviteeEmail: 'b@x', schoolLanguage: 'nb', ownerId: 'o1' })).resolves.toBe('uk');
    expect(contacts.userIdByEmail).toHaveBeenCalledWith('b@x');
  });

  it('writes to a new address in the school language', async () => {
    contacts.userIdByEmail.mockResolvedValue(null);
    await expect(resolver.resolve({ inviteeEmail: 'c@x', schoolLanguage: 'nb', ownerId: 'o1' })).resolves.toBe('nb');
    expect(contacts.contactOf).not.toHaveBeenCalled();
  });

  it("falls back to the owner's language when the school has none", async () => {
    contacts.userIdByEmail.mockResolvedValue(null);
    contacts.contactOf.mockResolvedValue(contact('o1', 'uk'));
    await expect(resolver.resolve({ inviteeEmail: 'c@x', schoolLanguage: null, ownerId: 'o1' })).resolves.toBe('uk');
    expect(contacts.contactOf).toHaveBeenCalledWith('o1');
  });

  it('answers null (English) when nothing is known', async () => {
    contacts.userIdByEmail.mockResolvedValue(null);
    await expect(resolver.resolve({ inviteeEmail: 'c@x' })).resolves.toBeNull();
  });

  it('never throws: a profile-service failure only moves to the next source', async () => {
    contacts.userIdByEmail.mockRejectedValue(new Error('down'));
    await expect(resolver.resolve({ inviteeEmail: 'd@x', schoolLanguage: 'ru' })).resolves.toBe('ru');

    contacts.contactOf.mockRejectedValue(new Error('down'));
    await expect(resolver.resolve({ inviteeEmail: 'd@x', recipientUserId: 'u1', ownerId: 'o1' })).resolves.toBeNull();
  });

  it('a registered invitee without a contact row reads the school language', async () => {
    contacts.contactOf.mockResolvedValue(null);
    await expect(resolver.resolve({ inviteeEmail: 'e@x', recipientUserId: 'u3', schoolLanguage: 'nb' })).resolves.toBe('nb');
  });
});
